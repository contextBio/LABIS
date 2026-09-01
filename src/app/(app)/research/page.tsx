import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { listResearchProjects, listProjects, listLabUsers } from "@/lib/queries";
import {
  createResearchProject, setResearchProjectStatus, deleteResearchProject,
} from "@/lib/actions";
import { SheetSources } from "@/components/SheetSources";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const ctx = await requireLab("MEMBER", "research", "view");
  const [research, projects, users] = await Promise.all([
    listResearchProjects(ctx.labId),
    listProjects(ctx.labId),
    listLabUsers(ctx.labId),
  ]);
  const active = users.filter((u) => u.workStatus === "재직");
  const canEdit = ctx.level === "edit";
  const canManage = canEdit && (ctx.role === "PI" || ctx.role === "LAB_MANAGER");
  const running = research.filter((r) => r.status === "진행").length;

  return (
    <div>
      <PageHeader
        title={`프로젝트 — ${ctx.labName}`}
        desc={`연구 프로젝트 — 수주 과제와 별개인 랩 내부 연구 단위 (진행 ${running}건)`}
      />

      {canManage && (
        <SheetSources labId={ctx.labId} tabs={["프로젝트"]} from="/research" />
      )}

      <Section title={`프로젝트 목록 (${research.length}건)`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>코드</th><th>프로젝트명</th><th>목표</th><th>책임자</th>
              <th>연계 과제</th><th>기간</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {research.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap font-mono text-xs">{r.code}</td>
                <td className="font-medium">{r.title}</td>
                <td className="text-xs text-slate-500">{r.goal || "-"}</td>
                <td className="whitespace-nowrap">{r.leader?.name ?? "-"}</td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {r.project ? (
                    <Link href={`/projects/${r.projectId}`} className="text-sky-600 hover:underline">
                      {r.project.code}
                    </Link>
                  ) : "-"}
                </td>
                <td className="whitespace-nowrap font-mono text-xs text-slate-500">
                  {r.startDate || "-"}{r.endDate ? ` ~ ${r.endDate}` : ""}
                </td>
                <td><Badge value={r.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {canEdit && (
                    <form action={setResearchProjectStatus} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="status" defaultValue={r.status} className="inp !w-auto !py-0.5 !text-xs">
                        <option>계획</option><option>진행</option><option>완료</option><option>보류</option><option>중단</option>
                      </select>
                      <button className="btn-ghost">변경</button>
                    </form>
                  )}
                  {canManage && (
                    <>
                      {" "}
                      <form action={deleteResearchProject} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn-danger">삭제</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {research.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-400">등록된 프로젝트가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {canManage && (
        <Section title="프로젝트 등록">
          <form action={createResearchProject} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input name="code" required placeholder="프로젝트 코드 *" className="inp" />
            <input name="title" required placeholder="프로젝트명 *" className="inp col-span-2" />
            <select name="leader_id" className="inp">
              <option value="">책임자 선택</option>
              {active.map((u) => (
                <option key={u.userId} value={u.userId}>{u.name}</option>
              ))}
            </select>
            <select name="project_id" className="inp col-span-2">
              <option value="">연계 과제 — 없음</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.title}</option>
              ))}
            </select>
            <input name="start_date" type="date" className="inp" />
            <input name="end_date" type="date" className="inp" />
            <input name="goal" placeholder="목표 · 한 줄 요약" className="inp col-span-2 md:col-span-3" />
            <select name="status" defaultValue="진행" className="inp">
              <option>계획</option><option>진행</option><option>완료</option><option>보류</option><option>중단</option>
            </select>
            <input name="memo" placeholder="비고" className="inp col-span-2 md:col-span-3" />
            <button className="btn justify-center">등록</button>
          </form>
        </Section>
      )}
    </div>
  );
}
