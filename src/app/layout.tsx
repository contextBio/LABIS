import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LABi — Lab intelligence",
  description: "연구소 운영 시스템: LIMS · 과제관리 · 인사관리",
};

const NAV = [
  { href: "/", label: "대시보드", icon: "◧" },
  { href: "/projects", label: "과제관리", icon: "▤" },
  { href: "/lims/samples", label: "시료 (LIMS)", icon: "⬡" },
  { href: "/lims/experiments", label: "실험 (LIMS)", icon: "⚗" },
  { href: "/lims/instruments", label: "장비 (LIMS)", icon: "⚙" },
  { href: "/hr", label: "인사관리", icon: "◉" },
  { href: "/sync", label: "구글시트 연동", icon: "⇄" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-52 shrink-0 border-r border-slate-200 bg-white">
            <div className="px-5 py-5">
              <Link href="/" className="block">
                <div className="text-lg font-black tracking-tight text-sky-700">LABi</div>
                <div className="text-[11px] text-slate-400">Lab intelligence</div>
              </Link>
            </div>
            <nav className="px-2">
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
            </nav>
          </aside>
          <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
