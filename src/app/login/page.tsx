import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

  // LABIS 의 로그인은 contextBio 통합 계정 하나다 — 다른 앱들과 동일한 방식
  // (2026-08-31, 자체 로그인 삭제). 접근 권한은 관리자의 초대(User 레코드)로
  // 부여되고, /api/sso/contextbio 가 초대된 이메일만 통과시킨다.
  const next = sp.next ?? "/";
  // APP_URL 은 기본 경로까지 포함한다(운영 …/labis, 개발 …/labis-dev) — 여기에
  // /labis 를 또 붙이면 개발에서만 어긋난다.
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const basePath = process.env.NEXT_BASE_PATH || "/labis";
  const contextBio = process.env.CONTEXTBIO_FIREBASE_API_KEY
    ? contextBioLoginUrl(`${appUrl}/login?next=${encodeURIComponent(next)}`)
    : "";

  return (
    <div className="flex min-h-[calc(100vh-2.25rem)] items-center justify-center bg-slate-50 px-4">
      {/* 토큰 릴레이(#token=)로 온 경우: 로그인 폼이 한 프레임 비쳤다 사라지는
          깜빡임을 없앤다 — 폼 대신 "입장 중" 스플래시를 즉시 띄우고, 소비는
          ContextBioSignIn 이 한다(실패하면 그쪽에서 폼을 되살린다). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "if(/(^|[#&])token=/.test(location.hash))document.documentElement.setAttribute('data-sso','1');",
        }}
      />
      <style>{`html[data-sso] .card{visibility:hidden}
html[data-sso] .sso-splash{display:flex!important}`}</style>
      <div
        className="sso-splash"
        style={{ display: "none", position: "fixed", top: 0, left: 0,
                 width: "100vw", height: "100vh", zIndex: 50,
                 alignItems: "center", justifyContent: "center",
                 flexDirection: "column", gap: 8, background: "#f8fafc" }}
      >
        <div style={{ fontSize: 24, fontWeight: 900, color: "#0369a1" }}>LABIS</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>입장 중…</div>
      </div>
      <div className="card w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black tracking-tight text-sky-700">LABIS</div>
          <div className="text-xs text-slate-400">Lab Intelligence System — 연구소 운영 시스템</div>
        </div>

        {sp.error === "invite" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            초대 링크가 유효하지 않거나 만료되었습니다. 관리자에게 재발급을 요청하세요.
          </p>
        )}
        {sp.setup === "done" && (
          <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            관리자 계정이 생성되었습니다. contextBio 계정으로 로그인하세요.
          </p>
        )}
        {sp.invited === "done" && (
          <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            초대를 수락했습니다. contextBio 계정으로 로그인하세요.
          </p>
        )}

        {contextBio ? (
          <ContextBioSignIn
            loginUrl={contextBio}
            next={next}
            postUrl={`${basePath}/api/sso/contextbio`}
            primary
          />
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            통합 계정 설정(CONTEXTBIO_FIREBASE_API_KEY)이 없어 로그인할 수 없습니다.
            관리자에게 문의하세요.
          </p>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          LABIS 는 contextBio 통합 계정으로 로그인합니다.
          <br />
          접근 권한은 관리자의 초대로 부여됩니다.
        </p>
      </div>
    </div>
  );
}
