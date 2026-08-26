import Link from "next/link";
import { dashboardStats, upcomingMilestones, recentExperiments, listProjects } from "@/lib/queries";
import { Badge, PageHeader, Section, StatCard, won } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const stats = dashboardStats();
  const milestones = upcomingMilestones();
  const experiments = recentExperiments();
  const projects = listProjects().filter((p) => p.status === "진행").slice(0, 5);

  return (
    <div>
      <PageHeader title="대시보드" desc="연구소 운영 현황 한눈에 보기" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="진행 중 과제" value={`${stats.activeProjects}건`} href="/projects" />
        <StatCard label="진행 과제 연구비 (집행/총액)" value={`${won(stats.totalSpent)} / ${won(stats.totalBudget)}`} href="/projects" />
        <StatCard label="보유 시료" value={`${stats.samples}건`} href="/lims/samples" />
        <StatCard label="진행 중 실험" value={`${stats.runningExperiments}건`} href="/lims/experiments" />
        <StatCard label="재직 인원" value={`${stats.members}명`} href="/hr" />
        <StatCard label="휴가 승인 대기" value={`${stats.pendingLeaves}건`} href="/hr" accent={stats.pendingLeaves > 0} />
        <StatCard label="점검 필요 장비" value={`${stats.instrumentsNeedCheck}대`} href="/lims/instruments" accent={stats.instrumentsNeedCheck > 0} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="다가오는 마일스톤">
          <table className="tbl">
            <thead>
              <tr><th>기한</th><th>과제</th><th>내용</th><th>상태</th></tr>
            </thead>
            <tbody>
              {milestones.map((ms) => (
                <tr key={ms.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{ms.due_date}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    <Link href={`/projects/${ms.project_id}`} className="hover:text-sky-600">{ms.project_code}</Link>
                  </td>
                  <td>{ms.title}</td>
                  <td><Badge value={ms.status} /></td>
                </tr>
              ))}
              {milestones.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">예정된 마일스톤이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </Section>

        <Section title="최근 실험">
          <table className="tbl">
            <thead>
              <tr><th>실험번호</th><th>제목</th><th>담당</th><th>상태</th></tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{e.code}</td>
                  <td>{e.title}</td>
                  <td className="whitespace-nowrap">{e.assignee_name ?? "-"}</td>
                  <td><Badge value={e.status} /></td>
                </tr>
              ))}
              {experiments.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">등록된 실험이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="진행 중 과제">
        <table className="tbl">
          <thead>
            <tr><th>과제번호</th><th>과제명</th><th>책임자</th><th>기간</th><th>연구비 집행</th></tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const pct = p.total_budget > 0 ? Math.min(100, Math.round((p.spent / p.total_budget) * 100)) : 0;
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/projects/${p.id}`} className="text-sky-600 hover:underline">{p.code}</Link>
                  </td>
                  <td>{p.title}</td>
                  <td className="whitespace-nowrap">{p.pi_name ?? "-"}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{p.start_date} ~ {p.end_date}</td>
                  <td className="w-48">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">진행 중인 과제가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
