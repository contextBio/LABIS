import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { listPurchases, listProjects, listLabUsers } from "@/lib/queries";
import { createPurchase, setPurchaseStatus, deletePurchase } from "@/lib/actions";
import { Badge, PageHeader, Section, won } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const ctx = await requireLab();
  const [purchases, projects, users] = await Promise.all([
    listPurchases(ctx.labId),
    listProjects(ctx.labId),
    listLabUsers(ctx.labId),
  ]);
  const active = users.filter((u) => u.workStatus === "재직");
  const canManage = ctx.role === "PI" || ctx.role === "LAB_MANAGER";
  const total = purchases.filter((p) => p.status !== "취소").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader title={`구매 관리 — ${ctx.labName}`} desc={`시약·재료·비품 구매 (누계 ${won(total)})`} />

      <Section title={`구매 내역 (${purchases.length}건)`}>
        <table className="tbl">
          <thead>
            <tr><th>일자</th><th>품목</th><th>구입처</th><th>비목</th><th>금액</th><th>신청자</th><th>과제</th><th>상태</th><th></th></tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap font-mono text-xs">{p.orderDate}</td>
                <td className="font-medium">{p.item}</td>
                <td className="text-xs text-slate-500">{p.vendor}</td>
                <td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{p.category}</span></td>
                <td className="whitespace-nowrap">{p.amount.toLocaleString()}원</td>
                <td className="whitespace-nowrap">{p.requester?.name ?? "-"}</td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {p.project ? <Link href={`/projects/${p.projectId}`} className="text-sky-600 hover:underline">{p.project.code}</Link> : "-"}
                </td>
                <td><Badge value={p.status} /></td>
                <td className="whitespace-nowrap text-right">
                  <form action={setPurchaseStatus} className="inline-flex items-center gap-1">
                    <input type="hidden" name="id" value={p.id} />
                    <select name="status" defaultValue={p.status} className="inp !w-auto !py-0.5 !text-xs">
                      <option>신청</option><option>발주</option><option>입고</option><option>취소</option>
                    </select>
                    <button className="btn-ghost">변경</button>
                  </form>
                  {canManage && (
                    <>
                      {" "}
                      <form action={deletePurchase} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-danger">삭제</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-slate-400">구매 내역이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="구매 신청">
        <form action={createPurchase} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input name="item" required placeholder="품목 *" className="inp col-span-2" />
          <input name="vendor" placeholder="구입처" className="inp" />
          <select name="category" className="inp">
            <option>재료비</option><option>시약</option><option>소모품</option><option>비품</option><option>장비</option><option>기타</option>
          </select>
          <input name="amount" type="number" min="0" placeholder="금액 (원)" className="inp" />
          <input name="order_date" type="date" className="inp" />
          <select name="requester_id" defaultValue={ctx.user.id} className="inp">
            {active.map((u) => (
              <option key={u.userId} value={u.userId}>{u.name}</option>
            ))}
          </select>
          <select name="project_id" className="inp">
            <option value="">연계 과제 선택</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.title}</option>
            ))}
          </select>
          <input name="memo" placeholder="비고 (Cat#, 규격 등)" className="inp col-span-2 md:col-span-3" />
          <button className="btn justify-center">신청</button>
        </form>
      </Section>
    </div>
  );
}
