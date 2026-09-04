/** SPA 프론트: 연구실 팀원 배정·관리.
 *
 *   GET  /api/v1/lab/members?lab=N            — 구성원 + 대기 중 초대 목록
 *   POST /api/v1/lab/members?lab=N            — {action, ...}
 *     assign        {email, role}   기존 계정이면 즉시 배정, 없으면 초대 생성
 *     cancel_invite {id}
 *     set_role      {membershipId, role}
 *     remove        {membershipId}
 *
 * 구분: 팀 운영자(PI·LAB_MANAGER — 관리 권한)와 팀원(MEMBER).
 * 권한은 화면 쪽(orgActions)과 같은 규칙 — 배정·초대취소는 운영자(랩매니저↑),
 * 역할 변경·제외는 PI(또는 학과관리자). 타 연구실 계정은 apiLab 에서 이미 차단된다.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, withCors, corsPreflight, type ApiUser } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/guard";
import type { LabRole } from "@prisma/client";

const RANK: Record<string, number> = { MEMBER: 1, LAB_MANAGER: 2, PI: 3, DEPT_ADMIN: 4 };

function myRank(user: ApiUser, labId: number): number {
  if (user.isDeptAdmin) return RANK.DEPT_ADMIN;
  const m = user.memberships.find((x) => x.labId === labId);
  return m ? RANK[m.role] : 0;
}

function asRole(v: unknown): LabRole {
  return v === "PI" || v === "LAB_MANAGER" ? v : "MEMBER";
}

function fail(req: NextRequest, status: number, error: string) {
  return withCors(req, NextResponse.json({ ok: false, error }, { status }));
}

async function memberList(labId: number) {
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { labId },
      include: { user: true },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.invitation.findMany({
      where: { labId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { id: "desc" },
    }),
  ]);
  return {
    members: members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      position: m.user.position,
      workStatus: m.user.workStatus,
      role: m.role,
      operator: m.role === "PI" || m.role === "LAB_MANAGER",
    })),
    invites: invites.map((i) => ({
      id: i.id, email: i.email, role: i.role, token: i.token,
      expiresAt: i.expiresAt.toISOString().slice(0, 10),
    })),
  };
}

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;

  return withCors(
    req,
    NextResponse.json({
      ok: true,
      myRank: myRank(user, labId),
      ...(await memberList(labId)),
    })
  );
}

export async function POST(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;

  const rank = myRank(user, labId);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "assign") {
    if (rank < RANK.LAB_MANAGER) return fail(req, 403, "operator_required");
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = asRole(body.role);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(req, 400, "email_invalid");
    // 랩매니저는 PI 역할로 배정 불가 (orgActions 와 동일)
    if (role === "PI" && rank < RANK.PI) return fail(req, 403, "pi_requires_pi");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const m = await prisma.membership.upsert({
        where: { userId_labId: { userId: existing.id, labId } },
        create: { userId: existing.id, labId, role },
        update: { role },
      });
      await audit(user.id, labId, "member.assign", "membership", m.id, { email, role });
      return withCors(req, NextResponse.json({ ok: true, assigned: "member", ...(await memberList(labId)) }));
    }
    const invite = await prisma.invitation.create({
      data: {
        email, labId, role, invitedById: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    await audit(user.id, labId, "invite.create", "invitation", invite.id, { email, role });
    return withCors(
      req,
      NextResponse.json({ ok: true, assigned: "invited", token: invite.token, ...(await memberList(labId)) })
    );
  }

  if (action === "cancel_invite") {
    if (rank < RANK.LAB_MANAGER) return fail(req, 403, "operator_required");
    const id = Number(body.id);
    await prisma.invitation.deleteMany({ where: { id, labId, acceptedAt: null } });
    await audit(user.id, labId, "invite.cancel", "invitation", id);
    return withCors(req, NextResponse.json({ ok: true, ...(await memberList(labId)) }));
  }

  if (action === "set_role") {
    if (rank < RANK.PI) return fail(req, 403, "pi_required");
    const id = Number(body.membershipId);
    const role = asRole(body.role);
    await prisma.membership.updateMany({ where: { id, labId }, data: { role } });
    await audit(user.id, labId, "member.role", "membership", id, { role });
    return withCors(req, NextResponse.json({ ok: true, ...(await memberList(labId)) }));
  }

  if (action === "remove") {
    if (rank < RANK.PI) return fail(req, 403, "pi_required");
    const id = Number(body.membershipId);
    const target = await prisma.membership.findFirst({ where: { id, labId } });
    if (!target) return fail(req, 404, "not_found");
    if (target.userId === user.id) return fail(req, 400, "cannot_remove_self");
    await prisma.membership.delete({ where: { id: target.id } });
    await audit(user.id, labId, "member.remove", "membership", id);
    return withCors(req, NextResponse.json({ ok: true, ...(await memberList(labId)) }));
  }

  return fail(req, 400, "unknown_action");
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
