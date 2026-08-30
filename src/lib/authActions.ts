"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { signIn, signOut } from "./auth";
import { prisma } from "./prisma";
import { audit, requireUser, ACTIVE_LAB_COOKIE } from "./guard";

// Auth.js의 redirectTo는 Next basePath를 인지하지 못하므로 절대 경로로 직접 붙인다
const BASE = process.env.NEXT_BASE_PATH || "/labis";

function withBase(next: string): string {
  const path = next.startsWith("/") ? next : "/";
  return path.startsWith(BASE) ? path : `${BASE}${path === "/" ? "" : path}` || BASE;
}

export async function loginAction(fd: FormData) {
  const next = String(fd.get("next") ?? "/") || "/";
  try {
    await signIn("credentials", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      redirectTo: withBase(next),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
    }
    throw e; // NEXT_REDIRECT 는 그대로 통과
  }
}

export async function googleLoginAction(fd: FormData) {
  const next = String(fd.get("next") ?? "/") || "/";
  await signIn("google", { redirectTo: withBase(next) });
}

export async function logoutAction() {
  // sso=off: MUSE 세션이 살아 있어도 즉시 자동 재로그인되지 않게 한다
  await signOut({ redirectTo: `${BASE}/login?sso=off` });
}

/** 최초 부트스트랩: 사용자가 한 명도 없을 때만 학과관리자 계정 생성 */
export async function setupAction(fd: FormData) {
  const count = await prisma.user.count();
  if (count > 0) redirect("/login");

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!email || !name || password.length < 8) {
    redirect("/setup?error=invalid");
  }
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      isDeptAdmin: true,
    },
  });
  await audit(user.id, null, "setup.bootstrap", "user", user.id, { email });
  redirect("/login?setup=done");
}

/** 초대 수락: 신규 사용자는 계정 생성, 기존 사용자는 랩 소속만 추가 */
export async function acceptInviteAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");

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
    if (!name || password.length < 8) redirect(`/invite/${token}?error=invalid`);
    user = await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 12) },
    });
  } else if (!user.passwordHash) {
    // 시트/마이그레이션으로 만들어진 비밀번호 없는 계정: 초대 수락 시 비밀번호 설정
    if (password.length < 8) redirect(`/invite/${token}?error=invalid`);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), ...(name ? { name } : {}) },
    });
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
