import { requireDeptAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createLab, setLabStatus, deleteLab, toggleDeptAdmin } from "@/lib/orgActions";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminLabsPage() {
  const admin = await requireDeptAdmin();
  const labs = await prisma.lab.findMany({
    include: { _count: { select: { memberships: true } } },
    orderBy: { name: "asc" },
  });
  const users = await prisma.user.findMany({
    include: { memberships: { include: { lab: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader title="학과 관리" desc="연구실 · 사용자 · 권한" />

      <Section title={`연구실 (${labs.length}개)`}>
        <table className="tbl mb-4">
          <thead>
            <tr><th>연구실명</th><th>PI</th><th>호실</th><th>구성원</th><th>상태</th><th></th></tr>
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
                  </form>{" "}
                  <form action={deleteLab} className="inline">
                    <input type="hidden" name="id" value={l.id} />
                    <button className="btn-danger">삭제</button>
                  </form>
                </td>
              </tr>
            ))}
            {labs.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">등록된 연구실이 없습니다 — 아래에서 첫 연구실을 만드세요</td></tr>
            )}
          </tbody>
        </table>
        <form action={createLab} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input name="name" required placeholder="연구실명 *" className="inp" />
          <input name="pi_name" placeholder="PI 이름" className="inp" />
          <input name="room" placeholder="호실" className="inp" />
          <button className="btn justify-center">연구실 생성</button>
        </form>
      </Section>

      <Section title={`사용자 (${users.length}명)`}>
        <table className="tbl">
          <thead>
            <tr><th>이름</th><th>이메일</th><th>소속 랩 (역할)</th><th>학과관리자</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-xs text-slate-500">{u.email}</td>
                <td className="text-xs">
                  {u.memberships.length > 0
                    ? u.memberships.map((m) => `${m.lab.name} (${m.role})`).join(", ")
                    : "-"}
                </td>
                <td>{u.isDeptAdmin ? <Badge value="승인" /> : ""}</td>
                <td className="text-right">
                  {u.id !== admin.id && (
                    <form action={toggleDeptAdmin} className="inline">
                      <input type="hidden" name="user_id" value={u.id} />
                      <button className="btn-ghost">
                        {u.isDeptAdmin ? "관리자 해제" : "관리자 지정"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
