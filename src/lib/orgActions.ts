"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireDeptAdmin, requireLab, audit } from "./guard";
import { labSlots } from "./labLimit";
import type { LabRole } from "@prisma/client";

function s(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function asRole(v: string): LabRole {
  return v === "PI" || v === "LAB_MANAGER" ? v : "MEMBER";
}

// ---------- 학과 관리 (학과관리자) ----------

export async function createLab(fd: FormData) {
  const admin = await requireDeptAdmin();
  const name = s(fd, "name");
  if (!name) return;
  if ((await labSlots()).full) return;   // 상한 — 화면에서도 폼을 감추지만 여기서 막는다
  const lab = await prisma.lab.create({
    data: { name, piName: s(fd, "pi_name"), room: s(fd, "room") },
  });
  await audit(admin.id, lab.id, "lab.create", "lab", lab.id, { name });
  revalidatePath("/admin/labs");
  revalidatePath("/admin/settings");
}

export async function setLabStatus(fd: FormData) {
  const admin = await requireDeptAdmin();
  const id = Number(fd.get("id"));
  const status = s(fd, "status") || "운영";
  await prisma.lab.update({ where: { id }, data: { status } });
  await audit(admin.id, id, "lab.status", "lab", id, { status });
  revalidatePath("/admin/labs");
  revalidatePath("/admin/settings");
}

/** c1 리눅스 계정명 연결 — MUSE 공동 로그인(SSO·PAM)이 이 사용자로 매핑된다 */
export async function setUsername(fd: FormData) {
  const admin = await requireDeptAdmin();
  const userId = s(fd, "user_id");
  const username = s(fd, "username").toLowerCase();
  if (username && !/^[a-z_][a-z0-9_-]*$/.test(username)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { username: username || null },
  });
  await audit(admin.id, null, "user.username", "user", userId, { username });
  revalidatePath("/admin/labs");
  revalidatePath("/admin/settings");
}

export async function toggleDeptAdmin(fd: FormData) {
  const admin = await requireDeptAdmin();
  const userId = s(fd, "user_id");
  if (userId === admin.id) return; // 자기 자신의 관리자 권한 해제 방지
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;
  await prisma.user.update({
    where: { id: userId },
    data: { isDeptAdmin: !target.isDeptAdmin },
  });
  await audit(admin.id, null, "user.dept_admin", "user", userId, {
    isDeptAdmin: !target.isDeptAdmin,
  });
  revalidatePath("/admin/labs");
  revalidatePath("/admin/settings");
}

// ---------- 랩 구성원 관리 (PI / 랩매니저) ----------

/** 한 줄에 하나씩, '이름 <메일>'·'이름, 메일' 같은 형태에서도 메일만 뽑아낸다 */
function parseEmails(raw: string): string[] {
  const found = raw.toLowerCase().match(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g) ?? [];
  return [...new Set(found)];
}

/**
 * 팀원 추가 — 여러 명을 한 번에 받는다 (한 줄에 하나).
 * 이미 계정이 있으면 바로 배정하고, 없으면 초대 링크를 만든다.
 */
export async function inviteMember(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const role = asRole(s(fd, "role"));
  // 랩매니저는 PI 역할로 초대 불가
  if (role === "PI" && ctx.role !== "PI") return;

  const emails = parseEmails(s(fd, "emails") || s(fd, "email"));
  if (!emails.length) return;

  let assigned = 0, invited = 0, skipped = 0;
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.membership.upsert({
        where: { userId_labId: { userId: user.id, labId: ctx.labId } },
        create: { userId: user.id, labId: ctx.labId, role },
        update: {},   // 이미 소속이면 역할은 건드리지 않는다 (역할 변경은 따로 있다)
      });
      assigned++;
      continue;
    }
    const pending = await prisma.invitation.findFirst({
      where: { labId: ctx.labId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) {
      skipped++;
      continue;
    }
    await prisma.invitation.create({
      data: {
        email,
        labId: ctx.labId,
        role,
        invitedById: ctx.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    invited++;
  }
  await audit(ctx.user.id, ctx.labId, "invite.create", "invitation", "", {
    role, assigned, invited, skipped, emails: emails.length,
  });
  revalidatePath("/admin/settings");
}

export async function cancelInvite(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const id = Number(fd.get("id"));
  await prisma.invitation.deleteMany({ where: { id, labId: ctx.labId, acceptedAt: null } });
  await audit(ctx.user.id, ctx.labId, "invite.cancel", "invitation", id);
  revalidatePath("/admin/settings");
}

export async function changeMemberRole(fd: FormData) {
  const ctx = await requireLab("PI");
  const id = Number(fd.get("id"));
  const role = asRole(s(fd, "role"));
  await prisma.membership.updateMany({ where: { id, labId: ctx.labId }, data: { role } });
  await audit(ctx.user.id, ctx.labId, "member.role", "membership", id, { role });
  revalidatePath("/admin/settings");
}

export async function removeMember(fd: FormData) {
  const ctx = await requireLab("PI");
  const id = Number(fd.get("id"));
  const target = await prisma.membership.findFirst({ where: { id, labId: ctx.labId } });
  if (!target) return;
  if (target.userId === ctx.user.id) return; // 자기 자신 제외 방지
  await prisma.membership.delete({ where: { id: target.id } });
  await audit(ctx.user.id, ctx.labId, "member.remove", "membership", id);
  revalidatePath("/admin/settings");
}
