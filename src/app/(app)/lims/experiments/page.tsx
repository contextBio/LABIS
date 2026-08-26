import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { listExperiments, listProjects, listSamples, listLabUsers } from "@/lib/queries";
import { createExperiment, setExperimentStatus, deleteExperiment } from "@/lib/actions";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ExperimentsPage() {
  const ctx = await requireLab();
  const [experiments, projects, samples, users] = await Promise.all([
    listExperiments(ctx.labId),
    listProjects(ctx.labId),
    listSamples(ctx.labId),
    listLabUsers(ctx.labId),
  ]);
  const active = users.filter((u) => u.workStatus === "재직");
  const canDelete = ctx.role === "PI" || ctx.role === "LAB_MANAGER";

  return (
    <div>
      <PageHeader title={`실험 관리 (LIMS) — ${ctx.labName}`} desc="실험 기록 · 진행 상태 · 결과 요약" />

      <Section title={`실험 목록 (${experiments.length}건)`}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>실험번호</th><th>제목</th><th>과제</th><th>시료</th><th>담당</th><th>프로토콜</th><th>시작일</th><th>상태</th><th>결과</th><th></th></tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{e.code}</td>
                  <td className="font-medium">{e.title}</td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {e.project ? (
                      <Link href={`/projects/${e.project.id}`} className="text-sky-600 hover:underline">{e.project.code}</Link>
                    ) : "-"}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{e.sample?.code ?? "-"}</td>
                  <td className="whitespace-nowrap">{e.assignee?.name ?? "-"}</td>
                  <td className="text-xs text-slate-500">{e.protocol}</td>
                  <td className="whitespace-nowrap font-mono text-xs">{e.startDate}</td>
                  <td><Badge value={e.status} /></td>
                  <td className="max-w-48 truncate text-xs text-slate-500" title={e.resultSummary}>{e.resultSummary}</td>
                  <td className="whitespace-nowrap text-right">
                    <form action={setExperimentStatus} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={e.id} />
                      <select name="status" defaultValue={e.status} className="inp !w-auto !py-0.5 !text-xs">
                        <option>계획</option><option>진행</option><option>완료</option><option>보류</option>
                      </select>
                      <button className="btn-ghost">변경</button>
                    </form>
                    {canDelete && (
                      <>
                        {" "}
                        <form action={deleteExperiment} className="inline">
                          <input type="hidden" name="id" value={e.id} />
                          <button className="btn-danger">삭제</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {experiments.length === 0 && (
                <tr><td colSpan={10} className="py-6 text-center text-slate-400">등록된 실험이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="실험 등록">
        <form action={createExperiment} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input name="code" required placeholder="실험번호 * (예: E-2026-0008)" className="inp" />
          <input name="title" required placeholder="실험 제목 *" className="inp col-span-2" />
          <select name="assignee_id" className="inp">
            <option value="">담당자 선택</option>
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
          <select name="sample_id" className="inp">
            <option value="">연계 시료 선택</option>
            {samples.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.code} — {sp.name}</option>
            ))}
          </select>
          <input name="protocol" placeholder="프로토콜" className="inp" />
          <input name="start_date" type="date" className="inp" />
          <input name="result_summary" placeholder="결과 요약 (완료 시)" className="inp col-span-2 md:col-span-3" />
          <button className="btn justify-center">등록</button>
        </form>
      </Section>
    </div>
  );
}
