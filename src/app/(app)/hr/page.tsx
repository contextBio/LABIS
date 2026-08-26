import Link from "next/link";
import { requireLab } from "@/lib/guard";
import { listLabUsers, listLeaves } from "@/lib/queries";
import { updateProfile, createLeave, setLeaveStatus } from "@/lib/actions";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_KO: Record<string, string> = {
  PI: "연구책임자",
  LAB_MANAGER: "랩매니저",
  MEMBER: "연구원",
};

export default async function HrPage() {
  const ctx = await requireLab();
  const users = await listLabUsers(ctx.labId);
  const leaves = await listLeaves(ctx.labId);
  const canManage = ctx.role === "PI" || ctx.role === "LAB_MANAGER";
  const active = users.filter((u) => u.workStatus === "재직");

  return (
    <div>
      <PageHeader title={`인사관리 — ${ctx.labName}`} desc="구성원 명부 · 과제 참여율 · 휴가" />

      <Section
        title={`구성원 명부 (${users.length}명)`}
        right={
          canManage ? (
            <Link href="/lab/members" className="btn-ghost">초대·역할 관리 →</Link>
          ) : undefined
        }
      >
        <table className="tbl">
          <thead>
            <tr><th>이름</th><th>직급</th><th>랩 역할</th><th>이메일</th><th>입사일</th><th>참여율 합계</th><th>상태</th>{canManage && <th></th>}</tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.membershipId}>
                <td className="font-medium">{u.name}</td>
                <td>{u.position}</td>
                <td className="text-xs text-slate-500">{ROLE_KO[u.labRole]}</td>
                <td className="text-xs text-slate-500">{u.email}</td>
                <td className="whitespace-nowrap font-mono text-xs">{u.hireDate || "-"}</td>
                <td>
                  <span className={u.totalEffort > 100 ? "font-semibold text-red-600" : ""}>
                    {u.totalEffort}%
                  </span>
                </td>
                <td><Badge value={u.workStatus} /></td>
                {canManage && (
                  <td className="whitespace-nowrap text-right">
                    <details className="inline-block text-left">
                      <summary className="btn-ghost cursor-pointer list-none">프로필 수정</summary>
                      <form
                        action={updateProfile}
                        className="absolute z-10 mt-1 grid w-64 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
                      >
                        <input type="hidden" name="user_id" value={u.userId} />
                        <input name="position" defaultValue={u.position} placeholder="직급" className="inp" />
                        <input name="phone" defaultValue={u.phone} placeholder="연락처" className="inp" />
                        <input name="hire_date" type="date" defaultValue={u.hireDate} className="inp" />
                        <select name="work_status" defaultValue={u.workStatus} className="inp">
                          <option>재직</option><option>휴직</option><option>퇴직</option>
                        </select>
                        <button className="btn justify-center">저장</button>
                      </form>
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-400">
          구성원 추가는 <b>초대</b>로 이루어집니다 (랩 구성원 관리 → 초대 링크 생성).
        </p>
      </Section>

      <Section title="휴가 관리">
        <form action={createLeave} className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          {canManage ? (
            <select name="user_id" className="inp">
              <option value={ctx.user.id}>본인 ({ctx.user.name})</option>
              {active
                .filter((u) => u.userId !== ctx.user.id)
                .map((u) => (
                  <option key={u.userId} value={u.userId}>{u.name}</option>
                ))}
            </select>
          ) : (
            <div className="inp flex items-center bg-slate-50 text-slate-500">{ctx.user.name}</div>
          )}
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
                <td>{l.user.name}</td>
                <td>{l.type}</td>
                <td className="whitespace-nowrap font-mono text-xs">{l.startDate} ~ {l.endDate}</td>
                <td>{l.days}일</td>
                <td><Badge value={l.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {canManage && l.status === "신청" && (
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
