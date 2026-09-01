import { requireLab } from "@/lib/guard";
import { listInstruments, listLabUsers } from "@/lib/queries";
import { createInstrument, setInstrumentStatus, markInstrumentChecked, deleteInstrument } from "@/lib/actions";
import { SheetSources } from "@/components/SheetSources";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InstrumentsPage() {
  const ctx = await requireLab("MEMBER", "instruments", "view");
  const [instruments, users] = await Promise.all([
    listInstruments(ctx.labId),
    listLabUsers(ctx.labId),
  ]);
  const active = users.filter((u) => u.workStatus === "재직");
  const canEdit = ctx.level === "edit";
  const canManage = canEdit && (ctx.role === "PI" || ctx.role === "LAB_MANAGER");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title={`장비 관리 (LIMS) — ${ctx.labName}`} desc="장비 현황 · 점검 일정 · 관리자" />

      {canManage && (
        <SheetSources labId={ctx.labId} tabs={["장비"]} from="/lims/instruments" />
      )}

      <Section title={`장비 목록 (${instruments.length}대)`}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>장비명</th><th>모델</th><th>관리자</th><th>위치</th><th>최근 점검</th><th>다음 점검</th><th>상태</th><th></th></tr>
            </thead>
            <tbody>
              {instruments.map((it) => {
                const overdue = it.nextCheckDate != null && it.nextCheckDate <= today;
                return (
                  <tr key={it.id}>
                    <td className="font-medium">{it.name}</td>
                    <td className="text-xs text-slate-500">{it.model}</td>
                    <td className="whitespace-nowrap">{it.manager?.name ?? "-"}</td>
                    <td className="text-xs">{it.location}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{it.lastCheckDate ?? "-"}</td>
                    <td className={`whitespace-nowrap font-mono text-xs ${overdue ? "font-bold text-red-600" : ""}`}>
                      {it.nextCheckDate ?? "-"}{overdue && " ⚠"}
                    </td>
                    <td><Badge value={it.status} /></td>
                    <td className="whitespace-nowrap text-right">
                      {canEdit && (
                        <>
                          <form action={markInstrumentChecked} className="inline">
                            <input type="hidden" name="id" value={it.id} />
                            <button className="btn-ghost">점검 완료</button>
                          </form>{" "}
                          <form action={setInstrumentStatus} className="inline-flex items-center gap-1">
                            <input type="hidden" name="id" value={it.id} />
                            <select name="status" defaultValue={it.status} className="inp !w-auto !py-0.5 !text-xs">
                              <option>정상</option><option>점검중</option><option>고장</option><option>폐기</option>
                            </select>
                            <button className="btn-ghost">변경</button>
                          </form>
                        </>
                      )}
                      {canManage && (
                        <>
                          {" "}
                          <form action={deleteInstrument} className="inline">
                            <input type="hidden" name="id" value={it.id} />
                            <button className="btn-danger">삭제</button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {instruments.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-slate-400">등록된 장비가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {canManage && (
        <Section title="장비 등록">
          <form action={createInstrument} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input name="name" required placeholder="장비명 *" className="inp" />
            <input name="model" placeholder="모델명" className="inp" />
            <input name="serial_no" placeholder="시리얼 번호" className="inp" />
            <select name="manager_id" className="inp">
              <option value="">관리자 선택</option>
              {active.map((u) => (
                <option key={u.userId} value={u.userId}>{u.name}</option>
              ))}
            </select>
            <input name="location" placeholder="설치 위치" className="inp" />
            <label className="text-xs text-slate-500">
              구입일
              <input name="purchase_date" type="date" className="inp mt-0.5" />
            </label>
            <label className="text-xs text-slate-500">
              최근 점검일
              <input name="last_check_date" type="date" className="inp mt-0.5" />
            </label>
            <label className="text-xs text-slate-500">
              다음 점검일
              <input name="next_check_date" type="date" className="inp mt-0.5" />
            </label>
            <input name="memo" placeholder="비고" className="inp col-span-2 md:col-span-3" />
            <button className="btn justify-center">등록</button>
          </form>
        </Section>
      )}
    </div>
  );
}
