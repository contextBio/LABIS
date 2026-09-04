"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signOut } from "./auth";
import { prisma } from "./prisma";
import { audit, requireUser, ACTIVE_LAB_COOKIE } from "./guard";

// Auth.js의 redirectTo는 Next basePath를 인지하지 못하므로 절대 경로로 직접 붙인다
const BASE = process.env.NEXT_BASE_PATH || "/labis";

// 로그인은 contextBio 통합 계정 하나다 (2026-08-31, 자체 로그인 삭제) —
// 로그인 액션은 /api/sso/contextbio 가 맡고, 여기에는 로그아웃과 계정 부트스트랩·
// 초대 수락만 남는다. 비밀번호는 어디에서도 만들지 않는다.

export async function logoutAction() {
  await signOut({ redirectTo: `${BASE}/login` });
}

/** 최초 부트스트랩: 사용자가 한 명도 없을 때만 학과관리자 계정 생성.
 *  로그인은 같은 이메일의 contextBio 계정으로 한다 — 비밀번호를 두지 않는다. */
export async function setupAction(fd: FormData) {
  const count = await prisma.user.count();
  if (count > 0) redirect("/login");

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  if (!email || !name) {
    redirect("/setup?error=invalid");
  }
  const user = await prisma.user.create({
    data: { email, name, isDeptAdmin: true },
  });
  await audit(user.id, null, "setup.bootstrap", "user", user.id, { email });
  redirect("/login?setup=done");
}

/** 초대 수락: 신규 사용자는 계정 생성, 기존 사용자는 랩 소속만 추가.
 *  로그인은 초대된 이메일의 contextBio 계정으로 한다. */
export async function acceptInviteAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();

  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { lab: true },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    redirect("/login?error=invite");
  }

  const email = invite.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (!name) redirect(`/invite/${token}?error=invalid`);
    user = await prisma.user.create({ data: { email, name } });
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_labId: { userId: user.id, labId: invite.labId } },
      create: { userId: user.id, labId: invite.labId, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);
  await audit(user.id, invite.labId, "invite.accept", "membership", user.id, {
    role: invite.role,
  });
  redirect("/login?invited=done");
}

/** 활성 랩 전환 (소속 검증은 guard가 매 요청 수행하므로 여기선 쿠키만) */
export async function switchLabAction(fd: FormData) {
  const labId = Number(fd.get("lab_id"));
  const user = await requireUser();
  const allowed =
    user.isDeptAdmin || user.memberships.some((m) => m.labId === labId);
  if (Number.isFinite(labId) && allowed) {
    const store = await cookies();
    store.set(ACTIVE_LAB_COOKIE, String(labId), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/");
}
