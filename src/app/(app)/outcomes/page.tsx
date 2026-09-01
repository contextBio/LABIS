import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { listPublications, listPatents, listTechTransfers, listProjects } from "@/lib/queries";
import {
  createPublication, deletePublication, createPatent, setPatentStatus, deletePatent,
  createTechTransfer, deleteTechTransfer,
} from "@/lib/actions";
import { SheetSources } from "@/components/SheetSources";
import { Badge, PageHeader, Section, won } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  const ctx = await requireLab("MEMBER", "outcomes", "view");
  const [pubs, patents, transfers, projects] = await Promise.all([
    listPublications(ctx.labId),
    listPatents(ctx.labId),
    listTechTransfers(ctx.labId),
    listProjects(ctx.labId),
  ]);
  const canEdit = ctx.level === "edit";
  const canManage = canEdit && (ctx.role === "PI" || ctx.role === "LAB_MANAGER");

  const projectSelect = (
    <select name="project_id" className="inp">
      <option value="">연계 과제 선택</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.code} — {p.title}</option>
      ))}
    </select>
  );

  return (
    <div>
      <PageHeader title={`성과 관리 — ${ctx.labName}`} desc="논문 · 특허 · 기술이전" />

      {canManage && (
        <SheetSources labId={ctx.labId} tabs={["논문", "특허", "기술이전"]} from="/outcomes" />
      )}

      <Section title={`논문 (${pubs.length}편)`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>연도</th><th>제목</th><th>저널</th><th>저자</th><th>DOI</th><th>과제</th><th></th></tr>
          </thead>
          <tbody>
            {pubs.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap font-mono text-xs">{p.year}</td>
                <td className="font-medium">{p.title}</td>
                <td className="text-xs text-slate-500">{p.journal}</td>
                <td className="max-w-48 truncate text-xs text-slate-500" title={p.authors}>{p.authors}</td>
                <td className="text-xs">
                  {p.doi && (
                    <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">{p.doi}</a>
                  )}
                </td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {p.project ? <Link href={`/projects/${p.projectId}`} className="text-sky-600 hover:underline">{p.project.code}</Link> : "-"}
                </td>
                <td className="text-right">
                  {canManage && (
                    <form action={deletePublication} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn-danger">삭제</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {pubs.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-slate-400">등록된 논문이 없습니다</td></tr>
            )}
          </tbody>
        </table>
        {canEdit && (
          <form action={createPublication} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input name="title" required placeholder="논문 제목 *" className="inp col-span-2" />
            <input name="journal" placeholder="저널명" className="inp" />
            <input name="year" placeholder="연도 (예: 2026)" className="inp" />
            <input name="authors" placeholder="저자 (교신·1저자 표기 자유)" className="inp col-span-2" />
            <input name="doi" placeholder="DOI" className="inp" />
            {projectSelect}
            <button className="btn justify-center">논문 추가</button>
          </form>
        )}
      </Section>

      <Section title={`특허 (${patents.length}건)`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>일자</th><th>발명 명칭</th><th>출원번호</th><th>등록번호</th><th>발명자</th><th>상태</th><th>과제</th><th></th></tr>
          </thead>
          <tbody>
            {patents.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap font-mono text-xs">{p.date}</td>
                <td className="font-medium">{p.title}</td>
                <td className="font-mono text-xs">{p.applicationNo}</td>
                <td className="font-mono text-xs">{p.registrationNo}</td>
                <td className="text-xs text-slate-500">{p.inventors}</td>
                <td><Badge value={p.status} /></td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {p.project ? <Link href={`/projects/${p.projectId}`} className="text-sky-600 hover:underline">{p.project.code}</Link> : "-"}
                </td>
                <td className="whitespace-nowrap text-right">
                  {canEdit && (
                    <form action={setPatentStatus} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <select name="status" defaultValue={p.status} className="inp !w-auto !py-0.5 !text-xs">
                        <option>출원</option><option>등록</option><option>거절</option><option>포기</option>
                      </select>
                      <button className="btn-ghost">변경</button>
                    </form>
                  )}
                  {canManage && (
                    <>
                      {" "}
                      <form action={deletePatent} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-danger">삭제</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {patents.length === 0 && (
              <tr><td colSpan={8} className="py-4 text-center text-slate-400">등록된 특허가 없습니다</td></tr>
            )}
          </tbody>
        </table>
        {canEdit && (
          <form action={createPatent} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input name="title" required placeholder="발명 명칭 *" className="inp col-span-2" />
            <input name="application_no" placeholder="출원번호" className="inp" />
            <input name="registration_no" placeholder="등록번호" className="inp" />
            <input name="inventors" placeholder="발명자" className="inp" />
            <input name="date" type="date" className="inp" />
            <select name="status" className="inp">
              <option>출원</option><option>등록</option>
            </select>
            {projectSelect}
            <button className="btn justify-center md:col-start-4">특허 추가</button>
          </form>
        )}
      </Section>

      <Section title={`기술이전 (${transfers.length}건 · 기술료 합계 ${won(transfers.reduce((s, t) => s + t.amount, 0))})`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>계약일</th><th>기술명</th><th>이전 대상</th><th>기술료</th><th>과제</th><th></th></tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap font-mono text-xs">{t.contractDate}</td>
                <td className="font-medium">{t.title}</td>
                <td>{t.licensee}</td>
                <td className="whitespace-nowrap">{t.amount.toLocaleString()}원</td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {t.project ? <Link href={`/projects/${t.projectId}`} className="text-sky-600 hover:underline">{t.project.code}</Link> : "-"}
                </td>
                <td className="text-right">
                  {canManage && (
                    <form action={deleteTechTransfer} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn-danger">삭제</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-slate-400">기술이전 실적이 없습니다</td></tr>
            )}
          </tbody>
        </table>
        {canManage && (
          <form action={createTechTransfer} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input name="title" required placeholder="기술명 *" className="inp col-span-2" />
            <input name="licensee" placeholder="이전 대상 (기업/기관)" className="inp" />
            <input name="amount" type="number" min="0" placeholder="기술료 (원)" className="inp" />
            <input name="contract_date" type="date" className="inp" />
            {projectSelect}
            <button className="btn justify-center">기술이전 추가</button>
          </form>
        )}
      </Section>
    </div>
  );
}
