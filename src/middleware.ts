import { NextResponse, type NextRequest } from "next/server";

// 가벼운 1차 관문: 세션 쿠키가 없으면 로그인으로.
// 실제 검증·권한 확인은 서버 컴포넌트/액션의 guard(requireUser 등)에서 수행한다.
const PUBLIC_PREFIXES = ["/login", "/setup", "/invite", "/api/auth"];

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
