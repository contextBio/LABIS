import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { loginAction, googleLoginAction } from "@/lib/authActions";
import { MUSE_COOKIE, verifyMuseToken } from "@/lib/muse";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/setup");
  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const next = sp.next ?? "/";

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
            이메일 또는 비밀번호가 올바르지 않습니다.
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
            초대를 수락했습니다. 로그인하세요.
          </p>
        )}

        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="text" required placeholder="이메일 또는 c1 계정명" className="inp" />
          <input name="password" type="password" required placeholder="비밀번호" className="inp" />
          <button className="btn w-full justify-center">로그인</button>
        </form>

        {googleEnabled && (
          <form action={googleLoginAction} className="mt-3">
            <input type="hidden" name="next" value={next} />
            <button className="btn-ghost w-full justify-center !py-2">Google 계정으로 로그인</button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          c1 서버(MUSE) 계정으로도 로그인할 수 있습니다.
          <br />
          이메일 계정은 초대를 통해서만 만들 수 있습니다.
        </p>
      </div>
    </div>
  );
}
