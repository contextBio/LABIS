import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { listProjects, listLabUsers } from "@/lib/queries";
import { createProject } from "@/lib/actions";
import { SheetSources } from "@/components/SheetSources";
import { Badge, PageHeader, Section, won } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const ctx = await requireLab("MEMBER", "projects", "view");
  const projects = await listProjects(ctx.labId);
  const users = (await listLabUsers(ctx.labId)).filter((u) => u.workStatus === "재직");
  const canEdit = ctx.level === "edit";
  const canManage = canEdit && (ctx.role === "PI" || ctx.role === "LAB_MANAGER");

  return (
    <div>
      <PageHeader title={`과제관리 — ${ctx.labName}`} desc="연구과제 · 참여연구원 · 마일스톤 · 예산" />

      {canManage && (
        <SheetSources labId={ctx.labId} tabs={["과제", "참여연구원", "마일스톤", "예산집행"]} from="/projects" />
      )}

      <Section title={`과제 목록 (${projects.length}건)`}>
        <table className="tbl">
          <thead>
            <tr><th>과제번호</th><th>과제명</th><th>발주처</th><th>책임자</th><th>기간</th><th>총 연구비</th><th>집행률</th><th>상태</th></tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const pct = p.totalBudget > 0 ? Math.min(100, Math.round((p.spent / p.totalBudget) * 100)) : 0;
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/projects/${p.id}`} className="text-sky-600 hover:underline">{p.code}</Link>
                  </td>
                  <td>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-sky-600">{p.title}</Link>
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{p.sponsor}</td>
                  <td className="whitespace-nowrap">{p.piName ?? "-"}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{p.startDate} ~ {p.endDate}</td>
                  <td className="whitespace-nowrap">{won(p.totalBudget)}</td>
                  <td>{pct}%</td>
                  <td><Badge value={p.status} /></td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-400">등록된 과제가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {canManage && (
        <Section title="신규 과제 등록">
          <form action={createProject} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input name="code" required placeholder="과제번호 *" className="inp" />
            <input name="title" required placeholder="과제명 *" className="inp col-span-2" />
            <input name="sponsor" placeholder="발주처" className="inp" />
            <input name="program" placeholder="사업명" className="inp" />
            <select name="pi_id" className="inp">
              <option value="">연구책임자 선택</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>{u.name} ({u.position})</option>
              ))}
            </select>
            <input name="start_date" type="date" required className="inp" />
            <input name="end_date" type="date" required className="inp" />
            <input name="total_budget" type="number" min="0" step="1000000" placeholder="총 연구비 (원)" className="inp" />
            <select name="status" className="inp">
              <option>진행</option><option>계획</option><option>종료</option><option>중단</option>
            </select>
            <input name="memo" placeholder="비고" className="inp" />
            <button className="btn justify-center">등록</button>
          </form>
        </Section>
      )}
    </div>
  );
}
