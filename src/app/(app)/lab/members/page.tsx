import { requireLab } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { inviteMember, cancelInvite, changeMemberRole, removeMember } from "@/lib/orgActions";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_KO: Record<string, string> = {
  PI: "연구책임자",
  LAB_MANAGER: "랩매니저",
  MEMBER: "연구원",
};

export default async function LabMembersPage() {
  const ctx = await requireLab("LAB_MANAGER");
  const members = await prisma.membership.findMany({
    where: { labId: ctx.labId },
    include: { user: true },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  const invites = await prisma.invitation.findMany({
    where: { labId: ctx.labId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const appUrl = process.env.APP_URL || "http://localhost:3100";
  const isPI = ctx.role === "PI";

  return (
    <div>
      <PageHeader title={`랩 구성원 관리 — ${ctx.labName}`} desc="구성원 · 역할 · 초대" />

      <Section title={`구성원 (${members.length}명)`}>
        <table className="tbl">
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
                        <button className="btn-danger">제외</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="구성원 초대">
        <form action={inviteMember} className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <input name="email" type="email" required placeholder="이메일 *" className="inp" />
          <select name="role" className="inp">
            <option value="MEMBER">연구원</option>
            <option value="LAB_MANAGER">랩매니저</option>
            {isPI && <option value="PI">연구책임자</option>}
          </select>
          <button className="btn justify-center">초대 링크 생성</button>
        </form>
        {invites.length > 0 && (
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
        )}
        <p className="mt-3 text-xs text-slate-400">
          초대 링크는 7일간 유효합니다. 메일 자동 발송은 추후 지원 예정 — 링크를 복사해 직접 전달하세요.
        </p>
      </Section>
    </div>
  );
}
