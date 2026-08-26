import Link from "next/link";
import type { ReactNode } from "react";

const BADGE_COLORS: Record<string, string> = {
  // 공통/과제
  진행: "bg-sky-100 text-sky-700",
  계획: "bg-slate-100 text-slate-600",
  예정: "bg-slate-100 text-slate-600",
  완료: "bg-emerald-100 text-emerald-700",
  종료: "bg-slate-200 text-slate-600",
  중단: "bg-red-100 text-red-700",
  지연: "bg-amber-100 text-amber-700",
  보류: "bg-amber-100 text-amber-700",
  // 인사
  재직: "bg-emerald-100 text-emerald-700",
  휴직: "bg-amber-100 text-amber-700",
  퇴직: "bg-slate-200 text-slate-600",
  신청: "bg-amber-100 text-amber-700",
  승인: "bg-emerald-100 text-emerald-700",
  반려: "bg-red-100 text-red-700",
  // LIMS
  보관: "bg-sky-100 text-sky-700",
  사용중: "bg-violet-100 text-violet-700",
  소진: "bg-slate-200 text-slate-600",
  폐기: "bg-slate-200 text-slate-500",
  정상: "bg-emerald-100 text-emerald-700",
  점검중: "bg-amber-100 text-amber-700",
  고장: "bg-red-100 text-red-700",
};

export function Badge({ value }: { value: string }) {
  const cls = BADGE_COLORS[value] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

export function PageHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, href, accent }: { label: string; value: string; href?: string; accent?: boolean }) {
  const body = (
    <div className={`card ${accent ? "border-amber-300 bg-amber-50" : ""} hover:shadow-md transition-shadow`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function won(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(v % 100000000 === 0 ? 0 : 1)}억원`;
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}
