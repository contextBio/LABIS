/**
 * MUSE 세션 SSO — 같은 호스트(c1.sysmed.kr)의 muse_session 쿠키가 유효하면
 * 해당 c1 계정으로 LABi 세션을 발급하고 앱으로 보낸다.
 * 실패하면 로그인 폼으로(sso=off — 자동 재시도 루프 방지).
 */
import { NextResponse, type NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { MUSE_COOKIE, verifyMuseToken, findOrCreateC1User } from "@/lib/muse";

const BASE = "/labi";
const SESSION_MAX_AGE = 12 * 3600; // MUSE 세션 TTL과 맞춘다

export async function GET(req: NextRequest) {
  const nextParam = req.nextUrl.searchParams.get("next") || "/";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const appUrl = process.env.APP_URL || `${BASE}`;

  const c1user = verifyMuseToken(req.cookies.get(MUSE_COOKIE)?.value);
  if (!c1user) {
    return NextResponse.redirect(new URL(`${appUrl}/login?sso=off`), { status: 302 });
  }

  const user = await findOrCreateC1User(c1user);
  const secure = appUrl.startsWith("https");
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await encode({
    token: {
      sub: user.id,
      uid: user.id,
      name: user.name,
      email: user.email,
      via: "muse-sso",
    },
    secret: process.env.AUTH_SECRET!,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  });

  const dest = new URL(
    safeNext.startsWith(BASE) ? safeNext : `${BASE}${safeNext === "/" ? "" : safeNext}` || BASE,
    appUrl
  );
  const res = NextResponse.redirect(dest, { status: 302 });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
