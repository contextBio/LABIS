/**
 * contextBio 공통 상단 바 — 다른 앱들이 통합 사이트 빌드에서 주입받는 상단 줄과
 * 같은 역할(브랜드 · 앱 메뉴 · 문서 · 계정)을 한다. LABIS 는 일체형(SSR, 다른
 * 오리진)이라 빌드 주입을 받을 수 없어 자기 레이아웃에 직접 얹는다.
 *
 * 링크의 기준 오리진은 CONTEXTBIO_SITE_URL — 운영은 contextbio.ai, 개발 미러는
 * dev-contextbio.web.app 를 가리키므로 형제 서비스 링크가 배포처를 따라간다.
 * 서비스 목록은 회사 사이트 info.md 의 products 와 같은 다섯이다 — 새 서비스가
 * 생기면 여기도 한 줄 늘린다 (일체형의 비용).
 */
const SERVICES: { key: string; name: string; path?: string }[] = [
  { key: "aurora", name: "AURORA", path: "/aurora" },
  { key: "cortex", name: "Cortex" }, // 준비중 — path 없음
  { key: "biowrit", name: "BioWrit", path: "/biowrit" },
  { key: "pepdesigner", name: "PepDesigner", path: "/pepdesigner" },
  { key: "labis", name: "LABIS", path: "" }, // 현재 앱
];

export default function ContextBioTopBar() {
  const site = (process.env.CONTEXTBIO_SITE_URL || "https://contextbio.ai").replace(/\/+$/, "");

  return (
    <div className="flex h-9 items-center gap-4 bg-slate-900 px-4 text-[12px] text-slate-300">
      <a
        href={`${site}/home`}
        className="font-semibold tracking-tight text-slate-100 hover:text-white"
      >
        contextBio
      </a>

      {/* 앱 메뉴 — CSS 만으로 여닫는 드롭다운 (details/summary) */}
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-2 py-1 hover:bg-slate-800 hover:text-white [&::-webkit-details-marker]:hidden">
          앱 <span className="text-[9px] opacity-70">▾</span>
        </summary>
        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-slate-700 bg-slate-900 py-1 shadow-lg">
          {SERVICES.map((s) =>
            s.key === "labis" ? (
              <span
                key={s.key}
                className="block px-3 py-1.5 font-semibold text-white"
              >
                {s.name} <span className="text-[10px] font-normal text-slate-400">— 현재</span>
              </span>
            ) : s.path ? (
              <a
                key={s.key}
                href={`${site}${s.path}`}
                className="block px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {s.name}
              </a>
            ) : (
              <span key={s.key} className="block px-3 py-1.5 text-slate-500">
                {s.name} <span className="text-[10px]">— 준비중</span>
              </span>
            )
          )}
        </div>
      </details>

      <div className="ml-auto flex items-center gap-3">
        <a href={`${site}/docs`} className="hover:text-white">
          문서
        </a>
        <a href={`${site}/login`} className="hover:text-white">
          계정
        </a>
      </div>
    </div>
  );
}
