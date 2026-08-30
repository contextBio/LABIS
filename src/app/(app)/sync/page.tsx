import { requireLab } from "@/lib/guard";
import { getLabSetting, loadServiceAccount } from "@/lib/google";
import { TABS } from "@/lib/sheetSync";
import { saveSpreadsheet, runExport, runImport } from "@/lib/syncActions";
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
        desc="이 랩의 자료를 구글 스프레드시트로 가져오기 · 내보내기"
      />

      <Section title="연결 상태">
        <div className="mb-4 space-y-2 text-sm">
          <div>
            <span className="mr-2 text-slate-500">스프레드시트:</span>
            {spreadsheetId ? (
              <a
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-sky-600 hover:underline"
              >
                {spreadsheetId}
              </a>
            ) : (
              <span className="text-amber-600">미설정 — 랩마다 별도 시트를 사용합니다</span>
            )}
          </div>
          <div>
            <span className="mr-2 text-slate-500">인증:</span>
            {sa ? (
              <span className="text-emerald-700">
                서비스 계정 <span className="font-mono text-xs">{sa.client_email}</span> (양방향 동기화 가능)
              </span>
            ) : (
              <span className="text-amber-600">
                서비스 계정 없음 — 링크 공유된 시트의 <b>가져오기만</b> 가능합니다. 양방향 동기화를 쓰려면{" "}
                <code className="rounded bg-slate-100 px-1">data/service-account.json</code>에 서비스 계정 키를 두고,
                시트를 해당 계정 이메일에 편집자로 공유하세요.
              </span>
            )}
          </div>
        </div>
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

      <Section title="동기화 실행">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form action={runImport}>
            <button className="btn">⬇ 전체 가져오기 (시트 → LABIS)</button>
          </form>
          <form action={runExport}>
            <button className="btn" disabled={!sa}>⬆ 전체 내보내기 (LABIS → 시트)</button>
          </form>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TABS.filter((t) => t !== "인원").map((t) => (
            <form key={t} action={runImport} className="inline">
              <input type="hidden" name="tab" value={t} />
              <button className="btn-ghost">⬇ {t}</button>
            </form>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          가져오기 방식 — 과제·시료·실험·장비: 키(번호/시리얼) 기준 <b>갱신/추가</b> ·{" "}
          참여연구원·마일스톤·예산집행·휴가·논문·특허·기술이전·구매·연구비수입: 탭 내용으로 <b>전체 교체</b> ·{" "}
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

      <Section title="시트 양식 안내">
        <p className="mb-2 text-sm text-slate-600">
          아래 탭 이름과 1행 헤더를 그대로 사용하면 됩니다. <b>전체 내보내기</b>를 한 번 실행하면 현재
          데이터로 모든 탭이 자동 생성되므로, 그 양식 위에서 수정하는 방법을 권장합니다.
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
      </Section>
    </div>
  );
}
