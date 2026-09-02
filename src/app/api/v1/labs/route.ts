/** SPA 프론트: 연구실 관리 (학과관리자 전용) — 화면 쪽 orgActions 와 같은 규칙.
 *
 *   GET  /api/v1/labs                                → 연구실 목록 (구성원 수 포함)
 *   POST /api/v1/labs  {action:"create", name, piName, room}
 *   POST /api/v1/labs  {action:"status", id, status}
 *   POST /api/v1/labs  {action:"delete", id}
 *
 * 공개 목록(/api/labs, 이름·id 만)과 달리 이쪽은 인증이 필요하다.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, withCors, corsPreflight } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/guard";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["운영", "휴면", "폐쇄"]);

async function labList() {
  const labs = await prisma.lab.findMany({
    include: { _count: { select: { memberships: true } } },
    orderBy: { name: "asc" },
  });
  return labs.map((l) => ({
    id: l.id, name: l.name, piName: l.piName, room: l.room,
    status: l.status, members: l._count.memberships,
  }));
}

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  if (!user.isDeptAdmin) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }
  return withCors(req, NextResponse.json({ ok: true, labs: await labList() }));
}

export async function POST(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  if (!user.isDeptAdmin) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string; id?: number; name?: string; piName?: string; room?: string; status?: string;
  };
  const fail = (e: string) =>
    withCors(req, NextResponse.json({ ok: false, error: e }, { status: 400 }));

  if (body.action === "create") {
    const name = String(body.name ?? "").trim();
    if (!name) return fail("name_required");
    if (await prisma.lab.findUnique({ where: { name } })) return fail("name_taken");
    const lab = await prisma.lab.create({
      data: { name, piName: String(body.piName ?? "").trim(), room: String(body.room ?? "").trim() },
    });
    await audit(user.id, lab.id, "lab.create", "lab", lab.id, { name });
  } else if (body.action === "status") {
    const status = String(body.status ?? "");
    if (!STATUSES.has(status)) return fail("bad_status");
    await prisma.lab.update({ where: { id: Number(body.id) }, data: { status } });
    await audit(user.id, Number(body.id), "lab.status", "lab", Number(body.id), { status });
  } else if (body.action === "delete") {
    const id = Number(body.id);
    await audit(user.id, null, "lab.delete", "lab", id);
    await prisma.lab.delete({ where: { id } });
  } else {
    return fail("unknown_action");
  }
  return withCors(req, NextResponse.json({ ok: true, labs: await labList() }));
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
