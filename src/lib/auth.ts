import NextAuth, { type NextAuthConfig } from "next-auth";
import { prisma } from "./prisma";

// LABIS 의 로그인은 contextBio 통합 계정 하나다 — 다른 앱들과 동일한 방식
// (2026-08-31, 자체 로그인 삭제). 세션 발급은 /api/sso/contextbio 가 ID 토큰을
// 검증한 뒤 Auth.js JWT 를 직접 굽는 방식이라, 프로바이더 목록이 비어 있다 —
// Auth.js 는 세션 검증(auth())과 로그아웃(signOut)만 맡는다.
// MUSE(c1 서버 사용자 관리)는 별개 서비스다 — LABIS 의 로그인 수단이 아니다.
const providers: NextAuthConfig["providers"] = [];

export const { handlers, auth, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  // Auth.js가 만드는 브라우저용 URL은 Next basePath(/labis)를 모른다 — 명시적으로 붙인다.
  // (내부 핸들러 경로는 basePath가 제거된 /api/auth 그대로가 맞다)
  pages: { signIn: `${process.env.NEXT_BASE_PATH || "/labis"}/login` },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // 최초 로그인 시 우리 DB의 사용자 id로 고정
        const dbUser = await prisma.user.findUnique({
          where: { email: (user.email ?? "").toLowerCase() },
        });
        if (dbUser) {
          token.uid = dbUser.id;
          token.name = dbUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});
