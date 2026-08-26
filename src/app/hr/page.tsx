import { listMembers, listLeaves } from "@/lib/queries";
import { createMember, updateMemberStatus, deleteMember, createLeave, setLeaveStatus } from "@/lib/actions";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function HrPage() {
  const members = listMembers();
  const leaves = listLeaves();

  return (
    <div>
      <PageHeader title="인사관리" desc="연구원 명부 · 과제 참여율 · 휴가" />

      <Section title={`연구원 명부 (${members.length}명)`}>
        <table className="tbl">
          <thead>
            <tr><th>이름</th><th>직급</th><th>부서</th><th>이메일</th><th>입사일</th><th>참여율 합계</th><th>상태</th><th></th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.name}</td>
                <td>{m.position}</td>
                <td>{m.department}</td>
                <td className="text-xs text-slate-500">{m.email}</td>
                <td className="whitespace-nowrap font-mono text-xs">{m.hire_date}</td>
                <td>
                  <span className={m.total_effort > 100 ? "font-semibold text-red-600" : ""}>
                    {m.total_effort}%
                  </span>
                </td>
                <td><Badge value={m.status} /></td>
                <td className="whitespace-nowrap text-right">
                  <form action={updateMemberStatus} className="inline-flex items-center gap-1">
                    <input type="hidden" name="id" value={m.id} />
                    <select name="status" defaultValue={m.status} className="inp !w-auto !py-0.5 !text-xs">
                      <option>재직</option><option>휴직</option><option>퇴직</option>
                    </select>
                    <button className="btn-ghost">변경</button>
                  </form>{" "}
                  <form action={deleteMember} className="inline">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn-danger">삭제</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="연구원 등록">
        <form action={createMember} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input name="name" required placeholder="이름 *" className="inp" />
          <input name="position" placeholder="직급 (기본: 연구원)" className="inp" />
          <input name="department" placeholder="부서" className="inp" />
          <input name="email" type="email" placeholder="이메일" className="inp" />
          <input name="phone" placeholder="연락처" className="inp" />
          <input name="hire_date" type="date" className="inp" />
          <div />
          <button className="btn justify-center">등록</button>
        </form>
      </Section>

      <Section title="휴가 관리">
        <form action={createLeave} className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <select name="member_id" required className="inp">
            <option value="">구성원 선택 *</option>
            {members.filter((m) => m.status === "재직").map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select name="type" className="inp">
            <option>연차</option><option>병가</option><option>공가</option><option>기타</option>
          </select>
          <input name="start_date" type="date" required className="inp" />
          <input name="end_date" type="date" className="inp" />
          <input name="days" type="number" step="0.5" min="0.5" placeholder="일수" className="inp" />
          <button className="btn justify-center">신청</button>
        </form>
        <table className="tbl">
          <thead>
            <tr><th>이름</th><th>구분</th><th>기간</th><th>일수</th><th>상태</th><th></th></tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id}>
                <td>{l.member_name}</td>
                <td>{l.type}</td>
                <td className="whitespace-nowrap font-mono text-xs">{l.start_date} ~ {l.end_date}</td>
                <td>{l.days}일</td>
                <td><Badge value={l.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {l.status === "신청" && (
                    <>
                      <form action={setLeaveStatus} className="inline">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="status" value="승인" />
                        <button className="btn-ghost">승인</button>
                      </form>{" "}
                      <form action={setLeaveStatus} className="inline">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="status" value="반려" />
                        <button className="btn-danger">반려</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">휴가 기록이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
