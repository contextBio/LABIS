/**
 * contextBio 통합 계정 SSO.
 *
 * contextbio.ai 의 로그인 화면이 ID 토큰을 **프래그먼트**(#token=)로 건네준다.
 * 프래그먼트는 서버로 가지 않아 접근 로그·Referer 에 남지 않으므로, 브라우저가
 * 그것을 읽어 여기로 POST 한다. 이 라우트는 토큰을 검증하고 **우리 세션 쿠키**를
 * 발급한다 — MUSE SSO 와 같은 구조다.
 *
 * 공개 가입은 열지 않는다. contextBio 계정이 있다는 것과 이 연구실 자료를 볼 자격이
 * 있다는 것은 다른 말이고, LABIS 가 담는 것은 인사·연구비 기록이다. 구글 로그인과
 * 같은 규칙으로, **초대로 이미 만들어진 계정**만 통과시킨다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { verifyContextBioToken } from "@/lib/contextbio";

const BASE = process.env.NEXT_BASE_PATH || "/labis";
const SESSION_MAX_AGE = 12 * 3600;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    idToken?: string;
    next?: string;
  };
  const ident = await verifyContextBioToken(String(body.idToken ?? ""));
  if (!ident) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }
  // 메일 확인을 마치지 않은 계정은 그 주소의 주인이라는 근거가 없다 — 초대는
  // 주소로 나가므로, 확인 없이 통과시키면 남의 초대를 가로챌 수 있다.
  if (!ident.emailVerified) {
    return NextResponse.json({ ok: false, error: "email_unverified" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email: ident.email } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "not_invited" }, { status: 403 });
  }

  const appUrl = process.env.APP_URL || BASE;
  const secure = appUrl.startsWith("https");
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await encode({
    token: {
      sub: user.id,
      uid: user.id,
      name: user.name,
      email: user.email,
      via: "contextbio-sso",
    },
    secret: process.env.AUTH_SECRET!,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  });

  // 돌아갈 곳은 **우리 안의 경로만** 허용한다 — 바깥 주소를 그대로 따르면 로그인
  // 직후의 사용자를 아무 데로나 보내는 문이 된다.
  const raw = String(body.next ?? "/");
  const safe = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const dest = safe.startsWith(BASE) ? safe : `${BASE}${safe === "/" ? "" : safe}`;

  const res = NextResponse.json({ ok: true, next: dest });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
