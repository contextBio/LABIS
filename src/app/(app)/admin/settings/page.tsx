import { requireLab } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import {
  createLab, setLabStatus,
  inviteMember, cancelInvite, changeMemberRole, removeMember,
} from "@/lib/orgActions";
import { saveMenuPermissions } from "@/lib/permActions";
import { labMenuMatrix, LEVEL_LABEL } from "@/lib/perm";
import { ADJUSTABLE_MENUS } from "@/lib/menus";
import { MAX_LABS, LAB_LIMIT_MESSAGE } from "@/lib/labLimit";
import { SheetSyncSection } from "@/components/SheetSyncSection";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_KO: Record<string, string> = {
  PI: "연구책임자",
  LAB_MANAGER: "랩매니저",
  MEMBER: "연구원",
};

export default async function AdminSettingsPage() {
  // 팀 운영자(랩매니저 이상) 전용. 학과관리자는 소속이 없어도 PI 로 들어온다.
  const ctx = await requireLab("LAB_MANAGER");
  const isPI = ctx.role === "PI";
  const isDeptAdmin = ctx.user.isDeptAdmin;

  const [labs, members, invites, matrix] = await Promise.all([
    isDeptAdmin
      ? prisma.lab.findMany({
          include: { _count: { select: { memberships: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.membership.findMany({
      where: { labId: ctx.labId },
      include: { user: true },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    prisma.invitation.findMany({
      where: { labId: ctx.labId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    isPI ? labMenuMatrix(ctx.labId) : Promise.resolve([]),
  ]);
  const appUrl = process.env.APP_URL || "http://localhost:3100";
  // 상한은 운영·휴면만 센다 — 폐쇄가 자리를 비우는 유일한 길이다
  const usedSlots = labs.filter((l) => l.status !== "폐쇄").length;
  const labsFull = usedSlots >= MAX_LABS;

  return (
    <div>
      <PageHeader
        title={`관리자 설정 — ${ctx.labName}`}
        desc="연구실 · 팀원 · 팀원별 메뉴 접근 권한 · 구글시트 연동"
      />

      {/* ── 1. 연구실 ── */}
      {isDeptAdmin && (
        <Section title={`연구실 (${usedSlots}/${MAX_LABS}개 사용)`}>
          <table className="tbl mb-4">
            <thead>
              <tr><th>연구실명</th><th>PI</th><th>호실</th><th>구성원</th><th>상태</th></tr>
            </thead>
            <tbody>
              {labs.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.name}</td>
                  <td>{l.piName || "-"}</td>
                  <td className="text-xs text-slate-500">{l.room}</td>
                  <td>{l._count.memberships}명</td>
                  <td><Badge value={l.status} /></td>
                  <td className="whitespace-nowrap text-right">
                    <form action={setLabStatus} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={l.id} />
                      <select name="status" defaultValue={l.status} className="inp !w-auto !py-0.5 !text-xs">
                        <option>운영</option><option>휴면</option><option>폐쇄</option>
                      </select>
                      <button className="btn-ghost">변경</button>
                    </form>
                  </td>
                </tr>
              ))}
              {labs.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">등록된 연구실이 없습니다 — 아래에서 첫 연구실을 만드세요</td></tr>
              )}
            </tbody>
          </table>
          {labsFull ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{LAB_LIMIT_MESSAGE}</p>
          ) : (
            <form action={createLab} className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <input name="name" required placeholder="연구실명 *" className="inp" />
              <input name="pi_name" placeholder="PI 이름" className="inp" />
              <input name="room" placeholder="호실" className="inp" />
              <button className="btn justify-center">연구실 추가</button>
            </form>
          )}
          <p className="mt-2 text-xs text-slate-400">
            연구실은 최대 {MAX_LABS}개입니다 (폐쇄한 것은 세지 않습니다). 추가와 상태 변경은
            학과관리자만 할 수 있습니다. 쓰지 않는 연구실은 <b>폐쇄</b>로 바꾸세요 — 자료는
            그대로 남습니다 (삭제 기능은 두지 않습니다).
          </p>
        </Section>
      )}

      {/* ── 2. 팀원 ── */}
      <Section title={`팀원 (${members.length}명)`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>이름</th><th>이메일</th><th>역할</th><th>합류일</th><th></th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.user.name}</td>
                <td className="text-xs text-slate-500">{m.user.email}</td>
                <td>{ROLE_KO[m.role]}</td>
                <td className="whitespace-nowrap font-mono text-xs">
                  {m.joinedAt.toISOString().slice(0, 10)}
                </td>
                <td className="whitespace-nowrap text-right">
                  {isPI && m.userId !== ctx.user.id && (
                    <>
                      <form action={changeMemberRole} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={m.id} />
                        <select name="role" defaultValue={m.role} className="inp !w-auto !py-0.5 !text-xs">
                          <option value="MEMBER">연구원</option>
                          <option value="LAB_MANAGER">랩매니저</option>
                          <option value="PI">연구책임자</option>
                        </select>
                        <button className="btn-ghost">변경</button>
                      </form>{" "}
                      <form action={removeMember} className="inline">
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn-danger">삭제</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form action={inviteMember} className="grid gap-3 md:grid-cols-4">
          <textarea
            name="emails"
            required
            rows={3}
            placeholder={"이메일 * — 여러 명은 한 줄에 하나씩\nkim@example.com\n김승호 <seungho@example.com>"}
            className="inp md:col-span-3"
          />
          <div className="flex flex-col gap-3">
            <select name="role" className="inp">
              <option value="MEMBER">연구원</option>
              <option value="LAB_MANAGER">랩매니저</option>
              {isPI && <option value="PI">연구책임자</option>}
            </select>
            <button className="btn justify-center">팀원 추가</button>
          </div>
        </form>

        {invites.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">대기 중인 초대</h3>
            <table className="tbl">
              <thead>
                <tr><th>이메일</th><th>역할</th><th>초대 링크 (복사해서 전달)</th><th>만료</th><th></th></tr>
              </thead>
              <tbody>
                {invites.map((iv) => (
                  <tr key={iv.id}>
                    <td>{iv.email}</td>
                    <td>{ROLE_KO[iv.role]}</td>
                    <td>
                      <input
                        readOnly
                        value={`${appUrl}/invite/${iv.token}`}
                        className="inp !py-1 font-mono !text-[11px]"
                      />
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {iv.expiresAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="text-right">
                      <form action={cancelInvite} className="inline">
                        <input type="hidden" name="id" value={iv.id} />
                        <button className="btn-danger">취소</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="mt-3 text-xs text-slate-400">
          여러 명을 한 번에 넣을 수 있습니다 — 한 줄에 하나씩, <code className="rounded bg-slate-100 px-1">이름 &lt;메일&gt;</code> 형태도 됩니다.
          이미 contextBio 계정이 있으면 바로 배정되고, 없으면 초대 링크가 만들어집니다 (7일 유효).
          이미 대기 중인 초대는 건너뜁니다. 역할 변경·삭제는 연구책임자만 할 수 있습니다.
          <br />
          시트 가져오기는 <b>명부의 이름</b>으로 사람을 찾습니다 — 시트에 적힌 이름과 같아야 반영됩니다.
        </p>
      </Section>

      {/* ── 3. 팀원별 메뉴 접근 권한 ── */}
      {isPI && (
        <Section title="팀원별 메뉴 접근 권한">
          <table className="tbl">
            <thead>
              <tr>
                <th>팀원</th>
                {ADJUSTABLE_MENUS.map((m) => (
                  <th key={m.key} className="whitespace-nowrap">{m.label}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.userId}>
                  <td className="whitespace-nowrap">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {ROLE_KO[r.role] ?? r.role} · {r.email}
                    </div>
                  </td>
                  {r.adjustable ? (
                    <>
                      {ADJUSTABLE_MENUS.map((m) => (
                        <td key={m.key}>
                          <select
                            form={`perm-${r.userId}`}
                            name={`level_${m.key}`}
                            defaultValue={r.levels[m.key]}
                            className="inp !w-auto !py-0.5 !text-xs"
                          >
                            <option value="edit">편집</option>
                            <option value="view">읽기</option>
                            <option value="none">차단</option>
                          </select>
                        </td>
                      ))}
                      <td className="whitespace-nowrap text-right">
                        <form action={saveMenuPermissions} id={`perm-${r.userId}`}>
                          <input type="hidden" name="user_id" value={r.userId} />
                          <button className="btn">저장</button>
                        </form>
                      </td>
                    </>
                  ) : (
                    <td colSpan={ADJUSTABLE_MENUS.length + 1} className="text-xs text-slate-400">
                      연구책임자·학과관리자는 조정 대상이 아닙니다 (항상 전체 편집)
                    </td>
                  )}
                </tr>
              ))}
              {matrix.length === 0 && (
                <tr>
                  <td colSpan={ADJUSTABLE_MENUS.length + 2} className="py-6 text-center text-slate-400">
                    배정된 팀원이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            <li><b>{LEVEL_LABEL.edit}</b> — 역할이 허용하는 만큼 씁니다 (지금까지와 동일).</li>
            <li><b>{LEVEL_LABEL.view}</b> — 목록은 보지만 등록·수정·삭제가 막히고 입력 폼이 사라집니다.</li>
            <li><b>{LEVEL_LABEL.none}</b> — 사이드바에서 메뉴가 사라지고, 주소로 들어와도 홈으로 돌려보냅니다.</li>
          </ul>
        </Section>
      )}

      {/* ── 4. 구글시트 연동 ── */}
      {ctx.levels.sheets === "edit" && <SheetSyncSection labId={ctx.labId} />}
    </div>
  );
}
