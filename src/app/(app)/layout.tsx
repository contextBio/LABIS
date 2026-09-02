import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser, ACTIVE_LAB_COOKIE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { logoutAction, switchLabAction } from "@/lib/authActions";
import { MENUS } from "@/lib/menus";
import { menuLevels } from "@/lib/perm";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await cookies();
  const activeLabId = Number(store.get(ACTIVE_LAB_COOKIE)?.value ?? NaN);

  // 전환 가능한 랩: 소속 랩 (학과관리자는 전체 랩)
  const labs = user.isDeptAdmin
    ? (await prisma.lab.findMany({ orderBy: { name: "asc" } })).map((l) => ({
        labId: l.id,
        labName: l.name,
      }))
    : user.memberships;

  const currentLab =
    labs.find((l) => l.labId === activeLabId)?.labName ?? labs[0]?.labName ?? "";

  const canManageLab =
    user.isDeptAdmin || user.memberships.some((m) => m.role === "PI" || m.role === "LAB_MANAGER");
  // 팀관리자가 잠근 메뉴는 사이드바에서 감춘다 (경로 접근은 서버 가드가 막는다)
  const activeLab = labs.find((l) => l.labId === activeLabId) ?? labs[0];
  const activeRole =
    user.memberships.find((m) => m.labId === activeLab?.labId)?.role ??
    (user.isDeptAdmin ? "PI" : null);
  const levels = activeLab && activeRole
    ? await menuLevels(activeLab.labId, user.id, activeRole, user.isDeptAdmin)
    : null;
  const nav = MENUS.filter((m) => !levels || levels[m.key] !== "none");

  const labSwitcher = labs.length > 0 && (
    <form action={switchLabAction}>
      <select
        name="lab_id"
        defaultValue={Number.isFinite(activeLabId) ? activeLabId : labs[0]?.labId}
        className="inp !text-xs"
      >
        {labs.map((l) => (
          <option key={l.labId} value={l.labId}>{l.labName}</option>
        ))}
      </select>
      <button className="btn-ghost mt-1.5 w-full justify-center">랩 전환</button>
    </form>
  );

  const manageLinks = (
    <>
      {canManageLab && (
        <Link
          href="/admin/settings"
          className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
        >
          <span className="w-4 text-center text-slate-400">⚿</span>
          관리자 설정
        </Link>
      )}
      {user.isDeptAdmin && (
        <Link
          href="/admin/labs"
          className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
        >
          <span className="w-4 text-center text-slate-400">★</span>
          사용자 관리
        </Link>
      )}
    </>
  );

  return (
    <div className="flex min-h-[calc(100vh-2.25rem)] flex-col lg:flex-row">
      {/* 데스크톱 사이드바 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5">
          <Link href="/" className="block">
            <div className="text-lg font-black tracking-tight text-sky-700">LABIS</div>
            <div className="text-[11px] text-slate-400">Lab Intelligence System</div>
          </Link>
        </div>

        {labs.length > 0 && <div className="px-4 pb-3">{labSwitcher}</div>}

        <nav className="flex-1 px-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
            >
              <span className="w-4 text-center text-slate-400">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {(canManageLab || user.isDeptAdmin) && (
            <div className="mt-3 border-t border-slate-100 pt-3">{manageLinks}</div>
          )}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <Link href="/account" className="mb-1 block truncate text-sm font-medium text-slate-700 hover:text-sky-700">
            {user.name}
          </Link>
          <div className="mb-2 truncate text-[11px] text-slate-400">
            {user.email}
            {user.isDeptAdmin && " · 학과관리자"}
          </div>
          <form action={logoutAction}>
            <button className="btn-ghost w-full justify-center">로그아웃</button>
          </form>
        </div>
      </aside>

      {/* 모바일 상단 바 */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight text-sky-700">LABIS</span>
            {currentLab && <span className="max-w-40 truncate text-xs text-slate-400">{currentLab}</span>}
          </Link>
          <details className="relative">
            <summary className="btn-ghost cursor-pointer list-none px-3 py-1.5">
              {user.name} ▾
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              <div className="mb-2 truncate text-[11px] text-slate-400">
                {user.email}
                {user.isDeptAdmin && " · 학과관리자"}
              </div>
              {labs.length > 0 && <div className="mb-3">{labSwitcher}</div>}
              {(canManageLab || user.isDeptAdmin) && (
                <div className="mb-2 border-t border-slate-100 pt-2">{manageLinks}</div>
              )}
              <Link
                href="/account"
                className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
              >
                <span className="w-4 text-center text-slate-400">◐</span>
                내 계정
              </Link>
              <form action={logoutAction} className="mt-1 border-t border-slate-100 pt-2">
                <button className="btn-ghost w-full justify-center">로그아웃</button>
              </form>
            </div>
          </details>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-4 lg:px-8 lg:py-6">{children}</main>
    </div>
  );
}
