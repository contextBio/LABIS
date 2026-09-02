"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireDeptAdmin, requireLab, audit } from "./guard";
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

export async function inviteMember(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const email = s(fd, "email").toLowerCase();
  const role = asRole(s(fd, "role"));
  if (!email) return;
  // 랩매니저는 PI 역할로 초대 불가
  if (role === "PI" && ctx.role !== "PI") return;
  const invite = await prisma.invitation.create({
    data: {
      email,
      labId: ctx.labId,
      role,
      invitedById: ctx.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  await audit(ctx.user.id, ctx.labId, "invite.create", "invitation", invite.id, { email, role });
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
