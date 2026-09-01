import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { financeSummary, listFundIncomes, listProjects } from "@/lib/queries";
import { createFundIncome, deleteFundIncome } from "@/lib/actions";
import { SheetSources } from "@/components/SheetSources";
import { Badge, PageHeader, Section, won } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const ctx = await requireLab();
  const [summary, incomes, projects] = await Promise.all([
    financeSummary(ctx.labId),
    listFundIncomes(ctx.labId),
    listProjects(ctx.labId),
  ]);
  const canManage = ctx.role === "PI" || ctx.role === "LAB_MANAGER";

  const totals = summary.rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.totalBudget,
      income: acc.income + r.income,
      spent: acc.spent + r.spent,
    }),
    { budget: 0, income: 0, spent: 0 }
  );
  totals.income += summary.unassigned.income;
  totals.spent += summary.unassigned.spentPurchase;
  const balance = totals.income - totals.spent;

  return (
    <div>
      <PageHeader title={`연구비 관리 — ${ctx.labName}`} desc="수입 · 지출 · 과제별 수지 분석" />

      {canManage && (
        <SheetSources labId={ctx.labId} tabs={["연구비수입", "예산집행"]} from="/finance" />
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs text-slate-500">총 협약 연구비</div>
          <div className="mt-1 text-xl font-bold">{won(totals.budget)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500">수입 누계 (입금)</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{won(totals.income)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500">지출 누계 (집행+구매)</div>
          <div className="mt-1 text-xl font-bold text-red-600">{won(totals.spent)}</div>
        </div>
        <div className={`card ${balance < 0 ? "border-red-300 bg-red-50" : ""}`}>
          <div className="text-xs text-slate-500">수지 (수입−지출)</div>
          <div className={`mt-1 text-xl font-bold ${balance < 0 ? "text-red-600" : "text-slate-900"}`}>
            {balance < 0 ? "−" : ""}{won(Math.abs(balance))}
          </div>
        </div>
      </div>

      <Section title="과제별 수지">
        <table className="tbl">
          <thead>
            <tr><th>과제</th><th>상태</th><th>협약 연구비</th><th>수입 (입금)</th><th>지출 (집행)</th><th>지출 (구매)</th><th>수지</th><th>집행률</th></tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => {
              const pct = r.totalBudget > 0 ? Math.min(100, Math.round((r.spent / r.totalBudget) * 100)) : 0;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/projects/${r.id}`} className="font-mono text-xs text-sky-600 hover:underline">{r.code}</Link>
                    <div className="text-xs text-slate-500">{r.title}</div>
                  </td>
                  <td><Badge value={r.status} /></td>
                  <td className="whitespace-nowrap">{won(r.totalBudget)}</td>
                  <td className="whitespace-nowrap text-emerald-700">{won(r.income)}</td>
                  <td className="whitespace-nowrap">{won(r.spentBudget)}</td>
                  <td className="whitespace-nowrap">{won(r.spentPurchase)}</td>
                  <td className={`whitespace-nowrap font-semibold ${r.balance < 0 ? "text-red-600" : "text-slate-800"}`}>
                    {r.balance < 0 ? "−" : ""}{won(Math.abs(r.balance))}
                  </td>
                  <td className="w-36">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${pct > 90 ? "bg-red-400" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(summary.unassigned.income > 0 || summary.unassigned.spentPurchase > 0) && (
              <tr className="text-slate-500">
                <td className="text-xs">과제 미지정</td>
                <td></td>
                <td>-</td>
                <td className="whitespace-nowrap">{won(summary.unassigned.income)}</td>
                <td>-</td>
                <td className="whitespace-nowrap">{won(summary.unassigned.spentPurchase)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
            {summary.rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-400">과제가 없습니다</td></tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-400">
          지출(집행)은 과제 상세의 예산 집행 내역, 지출(구매)은 구매 관리의 취소 제외 합계입니다.
        </p>
      </Section>

      <Section title={`수입 (입금) 기록 (${incomes.length}건)`}>
        {canManage && (
          <form action={createFundIncome} className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <select name="project_id" className="inp">
              <option value="">과제 선택 (미지정 가능)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.title}</option>
              ))}
            </select>
            <input name="amount" type="number" min="0" required placeholder="입금액 (원) *" className="inp" />
            <input name="date" type="date" className="inp" />
            <input name="note" placeholder="내용 (예: 1차년도 연구비)" className="inp" />
            <button className="btn justify-center">입금 기록</button>
          </form>
        )}
        <table className="tbl">
          <thead>
            <tr><th>일자</th><th>과제</th><th>내용</th><th>금액</th><th></th></tr>
          </thead>
          <tbody>
            {incomes.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap font-mono text-xs">{i.date}</td>
                <td className="whitespace-nowrap font-mono text-xs">{i.project?.code ?? "미지정"}</td>
                <td>{i.note}</td>
                <td className="whitespace-nowrap">{i.amount.toLocaleString()}원</td>
                <td className="text-right">
                  {canManage && (
                    <form action={deleteFundIncome} className="inline">
                      <input type="hidden" name="id" value={i.id} />
                      <button className="btn-danger">삭제</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {incomes.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">입금 기록이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
