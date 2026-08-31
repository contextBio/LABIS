import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// LABIS 의 정규 로그인은 contextBio 통합 계정이다 (2026-08-31 전환).
// MUSE(서버 사용자 관리)는 **별개 서비스**라 그 연동 — c1 계정 PAM 로그인과
// muse_session 자동 SSO — 은 그대로 둔다. 게이트 대상은 LABIS 자체의
// 이메일+비밀번호와 Google 뿐이다: 통합 계정이 동작하지 않을 때(Firebase 장애·
// 최초 구축 부트스트랩)만 LABIS_LOCAL_LOGIN=on 으로 켠다. UI 만 감추면
// /api/auth 콜백으로 여전히 뚫리므로 authorize 안에서도 함께 게이트한다.
const localLogin = (process.env.LABIS_LOCAL_LOGIN || "").toLowerCase() === "on";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "이메일 로그인",
    credentials: {
      email: { label: "이메일", type: "email" },
      password: { label: "비밀번호", type: "password" },
    },
    async authorize(credentials) {
      const login = String(credentials?.email ?? "").trim();
      const password = String(credentials?.password ?? "");
      if (!login || !password) return null;

      // '@' 없는 입력은 c1 리눅스 계정으로 간주 — MUSE와 같은 PAM 검증.
      // MUSE 는 별개 서비스라 이 경로는 통합 로그인 전환과 무관하게 항상 열려 있다.
      if (!login.includes("@")) {
        const { verifyC1Password, findOrCreateC1User } = await import("./muse");
        const ok = verifyC1Password(login, password);
        if (!ok) return null;
        const user = await findOrCreateC1User(login);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      }

      // 이메일+비밀번호는 비상 게이트 뒤 — 정규 경로는 contextBio SSO 다.
      if (!localLogin) return null;
      const user = await prisma.user.findUnique({ where: { email: login.toLowerCase() } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

// Google OAuth도 비상 게이트 안에서만 — 클라이언트 ID가 설정된 경우 (초대 기반: 기존 사용자만 통과)
if (localLogin && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  // Auth.js가 만드는 브라우저용 URL은 Next basePath(/labis)를 모른다 — 명시적으로 붙인다.
  // (내부 핸들러 경로는 basePath가 제거된 /api/auth 그대로가 맞다)
  pages: { signIn: `${process.env.NEXT_BASE_PATH || "/labis"}/login` },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        // 공개 가입 금지: 초대로 만들어진 계정만 구글 로그인 허용
        const existing = await prisma.user.findUnique({
          where: { email: (user.email ?? "").toLowerCase() },
        });
        return !!existing;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        // 최초 로그인 시 우리 DB의 사용자 id로 고정 (구글 로그인 포함)
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
