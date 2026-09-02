import { requireDeptAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { toggleDeptAdmin, setUsername } from "@/lib/orgActions";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminLabsPage() {
  const admin = await requireDeptAdmin();
  const users = await prisma.user.findMany({
    include: { memberships: { include: { lab: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader title="사용자 관리" desc="전체 계정 · c1 연결 · 학과관리자 지정 (연구실·팀원은 관리자 설정에서)" />

      <Section title={`사용자 (${users.length}명)`}>
        <table className="tbl">
          <thead>
            <tr><th>이름</th><th>이메일</th><th>c1 계정 (MUSE 로그인)</th><th>소속 랩 (역할)</th><th>학과관리자</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-xs text-slate-500">{u.email}</td>
                <td>
                  <form action={setUsername} className="inline-flex items-center gap-1">
                    <input type="hidden" name="user_id" value={u.id} />
                    <input
                      name="username"
                      defaultValue={u.username ?? ""}
                      placeholder="미연결"
                      className="inp !w-24 !py-0.5 font-mono !text-xs"
                    />
                    <button className="btn-ghost">저장</button>
                  </form>
                </td>
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
