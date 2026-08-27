import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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

      // '@' 없는 입력은 c1 리눅스 계정으로 간주 — MUSE와 같은 PAM 검증
      if (!login.includes("@")) {
        const { verifyC1Password, findOrCreateC1User } = await import("./muse");
        const ok = verifyC1Password(login, password);
        if (!ok) return null;
        const user = await findOrCreateC1User(login);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      }

      const user = await prisma.user.findUnique({ where: { email: login.toLowerCase() } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

// Google OAuth는 클라이언트 ID가 설정된 경우에만 활성화 (초대 기반: 기존 사용자만 통과)
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  // Auth.js가 만드는 브라우저용 URL은 Next basePath(/labi)를 모른다 — 명시적으로 붙인다.
  // (내부 핸들러 경로는 basePath가 제거된 /api/auth 그대로가 맞다)
  pages: { signIn: "/labi/login" },
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
