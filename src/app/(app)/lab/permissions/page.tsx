import { requireLab } from "@/lib/guard";
import { labMenuMatrix, LEVEL_LABEL } from "@/lib/perm";
import { ADJUSTABLE_MENUS } from "@/lib/menus";
import { saveMenuPermissions } from "@/lib/permActions";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_KO: Record<string, string> = {
  PI: "연구책임자",
  LAB_MANAGER: "랩매니저",
  MEMBER: "연구원",
};

export default async function MenuPermissionsPage() {
  const ctx = await requireLab("PI");
  const rows = await labMenuMatrix(ctx.labId);

  return (
    <div>
      <PageHeader
        title={`메뉴 권한 — ${ctx.labName}`}
        desc="팀관리자가 구성원별로 메뉴 접근을 조정합니다 — 편집 / 읽기 전용 / 차단"
      />

      <Section title={`구성원 ${rows.length}명`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>구성원</th>
              {ADJUSTABLE_MENUS.map((m) => (
                <th key={m.key} className="whitespace-nowrap">{m.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={ADJUSTABLE_MENUS.length + 2} className="py-6 text-center text-slate-400">
                  배정된 구성원이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="권한이 하는 일">
        <ul className="space-y-1 text-sm text-slate-600">
          <li><b>{LEVEL_LABEL.edit}</b> — 지금까지와 같습니다. 역할(연구책임자·랩매니저·연구원)이 허용하는 만큼 씁니다.</li>
          <li><b>{LEVEL_LABEL.view}</b> — 목록은 보지만 등록·수정·삭제는 막힙니다. 화면에서도 입력 폼이 사라집니다.</li>
          <li><b>{LEVEL_LABEL.none}</b> — 사이드바에서 메뉴가 사라지고, 주소로 직접 들어와도 홈으로 돌려보냅니다.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          권한은 <b>좁히기만</b> 합니다 — 편집으로 두어도 역할이 모자라면 여전히 막힙니다.
          예: 연구원에게 과제를 편집으로 둬도 과제 등록은 랩매니저 이상만 할 수 있습니다.
        </p>
      </Section>
    </div>
  );
}
