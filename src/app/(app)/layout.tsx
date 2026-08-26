import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser, ACTIVE_LAB_COOKIE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { logoutAction, switchLabAction } from "@/lib/authActions";

const NAV = [
  { href: "/", label: "대시보드", icon: "◧" },
  { href: "/projects", label: "과제관리", icon: "▤" },
  { href: "/lims/samples", label: "시료 (LIMS)", icon: "⬡" },
  { href: "/lims/experiments", label: "실험 (LIMS)", icon: "⚗" },
  { href: "/lims/instruments", label: "장비 (LIMS)", icon: "⚙" },
  { href: "/hr", label: "인사관리", icon: "◉" },
  { href: "/sync", label: "구글시트 연동", icon: "⇄" },
];

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

  const canManageLab =
    user.isDeptAdmin || user.memberships.some((m) => m.role === "PI" || m.role === "LAB_MANAGER");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <Link href="/" className="block">
            <div className="text-lg font-black tracking-tight text-sky-700">LABi</div>
            <div className="text-[11px] text-slate-400">Lab intelligence</div>
          </Link>
        </div>

        {labs.length > 0 && (
          <div className="px-4 pb-3">
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
          </div>
        )}

        <nav className="flex-1 px-2">
          {NAV.map((item) => (
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
            <div className="mt-3 border-t border-slate-100 pt-3">
              {canManageLab && (
                <Link
                  href="/lab/members"
                  className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                >
                  <span className="w-4 text-center text-slate-400">☰</span>
                  랩 구성원 관리
                </Link>
              )}
              {user.isDeptAdmin && (
                <Link
                  href="/admin/labs"
                  className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                >
                  <span className="w-4 text-center text-slate-400">★</span>
                  학과 관리
                </Link>
              )}
            </div>
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
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
