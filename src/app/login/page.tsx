import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { loginAction, googleLoginAction } from "@/lib/authActions";
import { MUSE_COOKIE, verifyMuseToken } from "@/lib/muse";
import { contextBioLoginUrl } from "@/lib/contextbio";
import ContextBioSignIn from "@/components/ContextBioSignIn";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/setup");

  // LABIS 의 정규 로그인은 contextBio 통합 계정이다 (2026-08-31 전환).
  // MUSE(서버 사용자 관리)는 별개 서비스라 그 연동(c1 계정 폼·자동 SSO)은 그대로다.
  // LABIS 자체 이메일+비밀번호·Google 만 비상 게이트(LABIS_LOCAL_LOGIN=on) 뒤에
  // 있다 — auth.ts 의 authorize 게이트와 짝이다(UI 만 감추면 콜백으로 뚫린다).
  // 통합 계정 키가 아예 없으면 이메일 폼도 함께 낸다 — 로그인 수단이 좁아진
  // 화면보다 낫다.
  const localLogin = (process.env.LABIS_LOCAL_LOGIN || "").toLowerCase() === "on";
  const googleEnabled =
    localLogin && !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const next = sp.next ?? "/";
  // APP_URL 은 기본 경로까지 포함한다(운영 …/labis, 개발 …/labis-dev) — 여기에
  // /labis 를 또 붙이면 개발에서만 어긋난다.
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const basePath = process.env.NEXT_BASE_PATH || "/labis";
  const contextBio = process.env.CONTEXTBIO_FIREBASE_API_KEY
    ? contextBioLoginUrl(`${appUrl}/login?next=${encodeURIComponent(next)}`)
    : "";
  const emailLogin = localLogin || !contextBio;

  // MUSE 세션 SSO: 같은 호스트의 muse_session 쿠키가 유효하면 자동 로그인.
  // 로그아웃 직후(sso=off)나 오류 표시 중에는 건너뛴다.
  const museUser =
    sp.sso === "off" || sp.error
      ? null
      : verifyMuseToken((await cookies()).get(MUSE_COOKIE)?.value);
  if (museUser) {
    redirect(`/api/sso/muse?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black tracking-tight text-sky-700">LABIS</div>
          <div className="text-xs text-slate-400">Lab Intelligence System — 연구소 운영 시스템</div>
        </div>

        {(sp.error === "1" || sp.error === "CredentialsSignin") && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            계정 또는 비밀번호가 올바르지 않습니다.
          </p>
        )}
        {sp.error === "invite" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            초대 링크가 유효하지 않거나 만료되었습니다. 관리자에게 재발급을 요청하세요.
          </p>
        )}
        {sp.setup === "done" && (
          <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            관리자 계정이 생성되었습니다. 로그인하세요.
          </p>
        )}
        {sp.invited === "done" && (
          <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            초대를 수락했습니다. contextBio 계정으로 로그인하세요.
          </p>
        )}

        {contextBio && (
          <ContextBioSignIn
            loginUrl={contextBio}
            next={next}
            postUrl={`${basePath}/api/sso/contextbio`}
            primary
          />
        )}

        {/* MUSE(서버 사용자 관리)는 별개 서비스 — c1 계정 로그인은 항상 열려 있다.
            비상 게이트가 켜지면 같은 폼이 이메일+비밀번호도 받는다. */}
        <form action={loginAction} className={`space-y-3 ${contextBio ? "mt-4" : ""}`}>
          <input type="hidden" name="next" value={next} />
          <input name="email" type="text" required
                 placeholder={emailLogin ? "이메일 또는 c1 계정명" : "c1 계정명 (MUSE)"}
                 className="inp" />
          <input name="password" type="password" required placeholder="비밀번호" className="inp" />
          <button className="btn-ghost w-full justify-center">
            {emailLogin ? "로컬 계정으로 로그인" : "c1 서버 계정으로 로그인 (MUSE)"}
          </button>
        </form>

        {googleEnabled && (
          <form action={googleLoginAction} className="mt-3">
            <input type="hidden" name="next" value={next} />
            <button className="btn-ghost w-full justify-center !py-2">Google 계정으로 로그인</button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          LABIS 는 contextBio 통합 계정으로 로그인합니다. 접근 권한은 관리자의
          초대로 부여됩니다.
          <br />
          c1 서버(MUSE) 계정으로도 로그인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
