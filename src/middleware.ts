import { NextResponse, type NextRequest } from "next/server";

// 가벼운 1차 관문: 세션 쿠키가 없으면 로그인으로.
// 실제 검증·권한 확인은 서버 컴포넌트/액션의 guard(requireUser 등)에서 수행한다.
// /enter 는 프론트 페이지의 입장 지점 — 자기 라우트가 로그인 여부를 직접 다루며
// lab 파라미터를 next 에 온전히 실어 보낸다(여기서 가로채면 lab 이 유실된다).
// /api/labs 는 공개 목록 — 가로채면 프론트의 fetch 가 로그인 HTML 을 받는다.
// /api/v1 은 SPA 프론트용 REST — 세션 쿠키가 아니라 Bearer 토큰이라 apiGuard 가
// 요청마다 직접 검증한다.
const PUBLIC_PREFIXES = ["/login", "/setup", "/invite", "/api/auth", "/api/sso", "/api/labs", "/api/v1", "/enter"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSession =
    req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
