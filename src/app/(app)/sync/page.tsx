import { requireLab } from "@/lib/guard";
import { getLabSetting, loadServiceAccount } from "@/lib/google";
import { TABS, ITEM_TABS } from "@/lib/sheetSync";
import { saveSpreadsheet, runExport, runImport } from "@/lib/syncActions";
import { SheetSources } from "@/components/SheetSources";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const ctx = await requireLab("LAB_MANAGER");
  const spreadsheetId = await getLabSetting(ctx.labId, "spreadsheet_id");
  const sa = loadServiceAccount();
  let log: { at: string; lines: string[] } | null = null;
  try {
    const raw = await getLabSetting(ctx.labId, "sync_log");
    if (raw) log = JSON.parse(raw);
  } catch {
    log = null;
  }

  return (
    <div>
      <PageHeader
        title={`구글시트 연동 — ${ctx.labName}`}
        desc="항목마다 구글시트 주소를 넣으면, 저장하는 즉시 시트 내용을 읽어 해당 항목 DB에 반영합니다"
      />

      <SheetSources
        labId={ctx.labId}
        tabs={ITEM_TABS}
        from="/sync"
        title="항목별 시트 주소"
        defaultOpen
      />

      <Section title="인증 상태">
        <div className="text-sm">
          {sa ? (
            <span className="text-emerald-700">
              서비스 계정 <span className="font-mono text-xs">{sa.client_email}</span> — 비공개 시트도 읽고 쓸 수
              있습니다. 각 시트를 이 계정 이메일에 <b>편집자</b>로 공유하세요.
            </span>
          ) : (
            <span className="text-amber-600">
              서비스 계정 없음 — <b>링크가 있는 모든 사용자</b>로 공유된 시트의 <b>가져오기만</b> 됩니다.
              양방향으로 쓰려면 <code className="rounded bg-slate-100 px-1">data/service-account.json</code>에
              서비스 계정 키를 두세요.
            </span>
          )}
        </div>
      </Section>

      <Section title="한 번에 실행">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form action={runImport}>
            <button className="btn">⬇ 연결된 항목 전부 가져오기 (시트 → LABIS)</button>
          </form>
          <form action={runExport}>
            <button className="btn" disabled={!sa}>⬆ 전부 내보내기 (LABIS → 시트)</button>
          </form>
        </div>
        <p className="text-xs text-slate-400">
          가져오기 방식 — 과제·시료·실험·장비: 키(번호/시리얼) 기준 <b>갱신/추가</b> ·{" "}
          참여연구원·마일스톤·예산집행·휴가·논문·특허·기술이전·구매·연구비수입: 시트 내용으로 <b>전체 교체</b> ·{" "}
          인원: 계정과 결합되어 있어 <b>내보내기 전용</b> (구성원 추가는 초대로)
        </p>
      </Section>

      {log && (
        <Section title={`최근 실행 결과 (${log.at})`}>
          <ul className="space-y-1 text-sm">
            {log.lines.map((line, i) => (
              <li key={i} className={line.startsWith("⚠") ? "text-amber-600" : line.startsWith("❌") ? "text-red-600" : ""}>
                {line}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="랩 통합 스프레드시트 (선택)">
        <p className="mb-3 text-sm text-slate-600">
          항목별 주소를 따로 넣지 않은 항목은 여기 지정한 스프레드시트에서 <b>항목 이름과 같은 탭</b>을 찾아 읽고
          씁니다. 항목별 주소가 있으면 그쪽이 우선입니다.
        </p>
        <form action={saveSpreadsheet} className="flex gap-2">
          <input
            name="spreadsheet"
            defaultValue={spreadsheetId}
            placeholder="스프레드시트 URL 또는 ID 붙여넣기"
            className="inp max-w-xl"
          />
          <button className="btn">저장</button>
        </form>
      </Section>

      <Section title="시트 양식 안내">
        <p className="mb-2 text-sm text-slate-600">
          시트 <b>1행은 헤더</b>여야 하고, 아래 열 이름을 그대로 씁니다. 순서는 상관없고 없는 열은 비워집니다.
          워크시트가 여럿인 파일은 주소를 <b>#gid= 까지 포함</b>해 붙여넣거나, 탭 이름을 항목 이름과 같게 하세요.
        </p>
        <ul className="grid gap-1 text-xs text-slate-500 md:grid-cols-2">
          <li><b>인원</b> (내보내기 전용) — 이름, 직급, 랩역할, 이메일, 연락처, 입사일, 상태</li>
          <li><b>과제</b> — 과제번호, 과제명, 발주처, 사업명, 연구책임자, 시작일, 종료일, 총연구비, 상태, 비고</li>
          <li><b>참여연구원</b> — 과제번호, 이름, 역할, 참여율</li>
          <li><b>마일스톤</b> — 과제번호, 내용, 기한, 상태, 비고</li>
          <li><b>예산집행</b> — 과제번호, 비목, 내역, 금액, 집행일, 비고</li>
          <li><b>시료</b> — 시료번호, 시료명, 유형, 출처, 과제번호, 담당자, 보관위치, 수령일, 상태, 비고</li>
          <li><b>실험</b> — 실험번호, 제목, 과제번호, 시료번호, 담당자, 프로토콜, 시작일, 종료일, 상태, 결과요약</li>
          <li><b>장비</b> — 장비명, 모델, 시리얼번호, 관리자, 위치, 구입일, 최근점검일, 다음점검일, 상태, 비고</li>
          <li><b>휴가</b> — 이름, 구분, 시작일, 종료일, 일수, 사유, 상태</li>
          <li><b>논문</b> — 연도, 제목, 저널, 저자, DOI, 과제번호, 비고</li>
          <li><b>특허</b> — 일자, 발명명칭, 출원번호, 등록번호, 발명자, 상태, 과제번호, 비고</li>
          <li><b>기술이전</b> — 계약일, 기술명, 이전대상, 기술료, 과제번호, 비고</li>
          <li><b>구매</b> — 일자, 품목, 구입처, 비목, 금액, 신청자, 과제번호, 상태, 비고</li>
          <li><b>연구비수입</b> — 일자, 과제번호, 내용, 금액</li>
        </ul>
        <p className="mt-2 text-xs text-slate-400">전체 항목: {TABS.join(" · ")}</p>
      </Section>
    </div>
  );
}
