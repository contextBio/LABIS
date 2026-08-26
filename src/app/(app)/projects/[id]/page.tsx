import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLab } from "@/lib/guard";
import { getProject, listLabUsers } from "@/lib/queries";
import {
  updateProjectStatus, deleteProject, addProjectMember, removeProjectMember,
  addMilestone, setMilestoneStatus, deleteMilestone, addBudgetItem, deleteBudgetItem,
} from "@/lib/actions";
import { Badge, PageHeader, Section, won } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLab();
  const { id } = await params;
  const project = await getProject(ctx.labId, Number(id));
  if (!project) notFound();

  const users = (await listLabUsers(ctx.labId)).filter((u) => u.workStatus === "재직");
  const canManage = ctx.role === "PI" || ctx.role === "LAB_MANAGER";
  const isPI = ctx.role === "PI";
  const pct = project.totalBudget > 0 ? Math.min(100, Math.round((project.spent / project.totalBudget) * 100)) : 0;

  return (
    <div>
      <div className="mb-2 text-xs">
        <Link href="/projects" className="text-slate-400 hover:text-sky-600">← 과제 목록</Link>
      </div>
      <PageHeader title={`${project.code} · ${project.title}`} desc={`${project.sponsor}${project.program ? ` · ${project.program}` : ""}`} />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs text-slate-500">연구책임자</div>
          <div className="mt-1 font-semibold">{project.piName ?? "-"}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500">기간</div>
          <div className="mt-1 font-semibold">{project.startDate} ~ {project.endDate}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500">연구비 집행</div>
          <div className="mt-1 font-semibold">{won(project.spent)} / {won(project.totalBudget)} ({pct}%)</div>
        </div>
        <div className="card">
          <div className="mb-1 text-xs text-slate-500">상태</div>
          <div className="flex items-center gap-2">
            <Badge value={project.status} />
            {canManage && (
              <form action={updateProjectStatus} className="inline-flex items-center gap-1">
                <input type="hidden" name="id" value={project.id} />
                <select name="status" defaultValue={project.status} className="inp !w-auto !py-0.5 !text-xs">
                  <option>계획</option><option>진행</option><option>종료</option><option>중단</option>
                </select>
                <button className="btn-ghost">변경</button>
              </form>
            )}
          </div>
        </div>
      </div>

      <Section title={`참여연구원 (${project.members.length}명)`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>이름</th><th>직급</th><th>역할</th><th>참여율</th>{canManage && <th></th>}</tr>
          </thead>
          <tbody>
            {project.members.map((pm) => (
              <tr key={pm.id}>
                <td className="font-medium">{pm.user.name}</td>
                <td>{pm.user.position}</td>
                <td>{pm.role}</td>
                <td>{pm.effortPct}%</td>
                {canManage && (
                  <td className="text-right">
                    <form action={removeProjectMember} className="inline">
                      <input type="hidden" name="id" value={pm.id} />
                      <input type="hidden" name="project_id" value={project.id} />
                      <button className="btn-danger">제외</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canManage && (
          <form action={addProjectMember} className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <input type="hidden" name="project_id" value={project.id} />
            <select name="user_id" required className="inp">
              <option value="">구성원 선택 *</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>{u.name} ({u.position})</option>
              ))}
            </select>
            <select name="role" className="inp">
              <option>참여연구원</option><option>연구책임자</option><option>연구보조원</option>
            </select>
            <input name="effort_pct" type="number" min="0" max="100" placeholder="참여율 %" className="inp" />
            <button className="btn justify-center">추가/수정</button>
          </form>
        )}
      </Section>

      <Section title="마일스톤">
        <table className="tbl mb-4">
          <thead>
            <tr><th>기한</th><th>내용</th><th>상태</th>{canManage && <th></th>}</tr>
          </thead>
          <tbody>
            {project.milestones.map((ms) => (
              <tr key={ms.id}>
                <td className="whitespace-nowrap font-mono text-xs">{ms.dueDate}</td>
                <td>{ms.title}</td>
                <td><Badge value={ms.status} /></td>
                {canManage && (
                  <td className="whitespace-nowrap text-right">
                    <form action={setMilestoneStatus} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={ms.id} />
                      <input type="hidden" name="project_id" value={project.id} />
                      <select name="status" defaultValue={ms.status} className="inp !w-auto !py-0.5 !text-xs">
                        <option>예정</option><option>진행</option><option>완료</option><option>지연</option>
                      </select>
                      <button className="btn-ghost">변경</button>
                    </form>{" "}
                    <form action={deleteMilestone} className="inline">
                      <input type="hidden" name="id" value={ms.id} />
                      <input type="hidden" name="project_id" value={project.id} />
                      <button className="btn-danger">삭제</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {project.milestones.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-slate-400">마일스톤이 없습니다</td></tr>
            )}
          </tbody>
        </table>
        {canManage && (
          <form action={addMilestone} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="project_id" value={project.id} />
            <input name="title" required placeholder="마일스톤 내용 *" className="inp col-span-2" />
            <input name="due_date" type="date" required className="inp" />
            <button className="btn justify-center">추가</button>
          </form>
        )}
      </Section>

      <Section title={`예산 집행 내역 (합계 ${won(project.spent)})`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>일자</th><th>비목</th><th>내역</th><th>금액</th>{canManage && <th></th>}</tr>
          </thead>
          <tbody>
            {project.budgetItems.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap font-mono text-xs">{b.spentDate}</td>
                <td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{b.category}</span></td>
                <td>{b.item}</td>
                <td className="whitespace-nowrap">{b.amount.toLocaleString()}원</td>
                {canManage && (
                  <td className="text-right">
                    <form action={deleteBudgetItem} className="inline">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="project_id" value={project.id} />
                      <button className="btn-danger">삭제</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {project.budgetItems.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-slate-400">집행 내역이 없습니다</td></tr>
            )}
          </tbody>
        </table>
        {canManage && (
          <form action={addBudgetItem} className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <input type="hidden" name="project_id" value={project.id} />
            <select name="category" className="inp">
              <option>인건비</option><option>재료비</option><option>장비비</option><option>여비</option><option>기타</option>
            </select>
            <input name="item" required placeholder="집행 내역 *" className="inp" />
            <input name="amount" type="number" min="0" required placeholder="금액 (원) *" className="inp" />
            <input name="spent_date" type="date" className="inp" />
            <button className="btn justify-center">추가</button>
          </form>
        )}
      </Section>

      {isPI && (
        <div className="mt-8 border-t border-slate-200 pt-4">
          <form action={deleteProject}>
            <input type="hidden" name="id" value={project.id} />
            <button className="btn-danger">과제 삭제 (참여연구원·마일스톤·예산 내역 포함)</button>
          </form>
        </div>
      )}
    </div>
  );
}
