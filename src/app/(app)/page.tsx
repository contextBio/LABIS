import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { dashboardStats, upcomingMilestones, recentExperiments, listProjects } from "@/lib/queries";
import { labDriveSheets } from "@/lib/sheetItems";
import { Badge, PageHeader, Section, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const ctx = await requireLab();
  const [stats, milestones, experiments, allProjects, drive] = await Promise.all([
    dashboardStats(ctx.labId),
    upcomingMilestones(ctx.labId),
    recentExperiments(ctx.labId),
    listProjects(ctx.labId),
    labDriveSheets(ctx.labId),
  ]);
  const projects = allProjects.filter((p) => p.status === "진행").slice(0, 5);

  return (
    <div>
      <PageHeader title={`대시보드 — ${ctx.labName}`} desc="연구실 운영 현황 한눈에 보기" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="진행 중 과제" value={`${stats.activeProjects}건`} href="/projects" />
        <StatCard label="보유 시료" value={`${stats.samples}건`} href="/lims/samples" />
        <StatCard label="진행 중 실험" value={`${stats.runningExperiments}건`} href="/lims/experiments" />
        <StatCard label="재직 인원" value={`${stats.members}명`} href="/hr" />
        <StatCard label="올해 논문" value={`${stats.pubsThisYear}편`} href="/outcomes" />
        <StatCard label="구매 진행 중" value={`${stats.pendingPurchases}건`} href="/purchases" accent={stats.pendingPurchases > 0} />
        <StatCard label="휴가 승인 대기" value={`${stats.pendingLeaves}건`} href="/hr" accent={stats.pendingLeaves > 0} />
        <StatCard label="점검 필요 장비" value={`${stats.instrumentsNeedCheck}대`} href="/lims/instruments" accent={stats.instrumentsNeedCheck > 0} />
      </div>

      {drive && (
        <Section
          title={`구글 드라이브 시트 (${drive.files.length}개)`}
          right={
            <a href={drive.url} target="_blank" rel="noreferrer" className="btn-ghost">
              폴더 열기 ↗
            </a>
          }
        >
          {drive.error ? (
            <p className="text-sm text-amber-600">{drive.error}</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>파일명</th><th>최근 수정</th><th>시트 주소 (항목 연동에 붙여넣기)</th></tr>
              </thead>
              <tbody>
                {drive.files.map((f) => (
                  <tr key={f.id}>
                    <td className="font-medium">
                      <a href={f.url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                        {f.name}
                      </a>
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-slate-500">
                      {f.modifiedTime.slice(0, 10)}
                    </td>
                    <td>
                      <input
                        readOnly
                        value={`https://docs.google.com/spreadsheets/d/${f.id}`}
                        className="inp !py-1 font-mono !text-[11px]"
                      />
                    </td>
                  </tr>
                ))}
                {drive.files.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">폴더에 스프레드시트가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Section>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="다가오는 마일스톤">
          <table className="tbl">
            <thead>
              <tr><th>기한</th><th>과제</th><th>내용</th><th>상태</th></tr>
            </thead>
            <tbody>
              {milestones.map((ms) => (
                <tr key={ms.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{ms.dueDate}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    <Link href={`/projects/${ms.project.id}`} className="hover:text-sky-600">{ms.project.code}</Link>
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
                  <td className="whitespace-nowrap">{e.assignee?.name ?? "-"}</td>
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
            <tr><th>과제번호</th><th>과제명</th><th>책임자</th><th>기간</th><th>상태</th></tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap font-mono text-xs">
                  <Link href={`/projects/${p.id}`} className="text-sky-600 hover:underline">{p.code}</Link>
                </td>
                <td>{p.title}</td>
                <td className="whitespace-nowrap">{p.piName ?? "-"}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{p.startDate} ~ {p.endDate}</td>
                <td><Badge value={p.status} /></td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">진행 중인 과제가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
