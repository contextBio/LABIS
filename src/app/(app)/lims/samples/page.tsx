import Link from "next/link";
import { listSamples, listProjects, listMembers } from "@/lib/queries";
import { createSample, setSampleStatus, deleteSample } from "@/lib/actions";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SamplesPage() {
  const samples = listSamples();
  const projects = listProjects();
  const members = listMembers().filter((m) => m.status === "재직");

  return (
    <div>
      <PageHeader title="시료 관리 (LIMS)" desc="시료 등록 · 보관 위치 · 상태 추적" />

      <Section title={`시료 목록 (${samples.length}건)`}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>시료번호</th><th>시료명</th><th>유형</th><th>출처</th><th>과제</th><th>담당</th><th>보관 위치</th><th>수령일</th><th>상태</th><th></th></tr>
            </thead>
            <tbody>
              {samples.map((sp) => (
                <tr key={sp.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{sp.code}</td>
                  <td className="font-medium">{sp.name}</td>
                  <td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{sp.type}</span></td>
                  <td className="text-xs text-slate-500">{sp.source}</td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {sp.project_id ? (
                      <Link href={`/projects/${sp.project_id}`} className="text-sky-600 hover:underline">{sp.project_code}</Link>
                    ) : "-"}
                  </td>
                  <td className="whitespace-nowrap">{sp.owner_name ?? "-"}</td>
                  <td className="text-xs">{sp.storage_location}</td>
                  <td className="whitespace-nowrap font-mono text-xs">{sp.received_date}</td>
                  <td><Badge value={sp.status} /></td>
                  <td className="whitespace-nowrap text-right">
                    <form action={setSampleStatus} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={sp.id} />
                      <select name="status" defaultValue={sp.status} className="inp !w-auto !py-0.5 !text-xs">
                        <option>보관</option><option>사용중</option><option>소진</option><option>폐기</option>
                      </select>
                      <button className="btn-ghost">변경</button>
                    </form>{" "}
                    <form action={deleteSample} className="inline">
                      <input type="hidden" name="id" value={sp.id} />
                      <button className="btn-danger">삭제</button>
                    </form>
                  </td>
                </tr>
              ))}
              {samples.length === 0 && (
                <tr><td colSpan={10} className="py-6 text-center text-slate-400">등록된 시료가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="시료 등록">
        <form action={createSample} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input name="code" required placeholder="시료번호 * (예: S-2026-0004)" className="inp" />
          <input name="name" required placeholder="시료명 *" className="inp" />
          <select name="type" className="inp">
            <option>혈액</option><option>조직</option><option>세포</option><option>DNA</option><option>RNA</option><option>단백질</option><option>기타</option>
          </select>
          <input name="source" placeholder="출처 (기관/환자 등)" className="inp" />
          <select name="project_id" className="inp">
            <option value="">연계 과제 선택</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.title}</option>
            ))}
          </select>
          <select name="owner_id" className="inp">
            <option value="">담당자 선택</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <input name="storage_location" placeholder="보관 위치 (예: 냉동고 A-2-13)" className="inp" />
          <input name="received_date" type="date" className="inp" />
          <input name="memo" placeholder="비고" className="inp col-span-2 md:col-span-3" />
          <button className="btn justify-center">등록</button>
        </form>
      </Section>
    </div>
  );
}
