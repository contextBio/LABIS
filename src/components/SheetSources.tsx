import { getLabSetting, parseSheetRef, sheetRefUrl } from "@/lib/google";
import { itemSrcKey, itemLogKey, type TabName } from "@/lib/sheetSync";
import { saveItemSheet, runItemImport } from "@/lib/syncActions";

type Log = { at: string; lines: string[] };

function parseLog(raw: string): Log | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Log;
  } catch {
    return null;
  }
}

function tone(lines: string[]): string {
  if (lines.some((l) => l.startsWith("❌"))) return "text-red-600";
  if (lines.some((l) => l.startsWith("⚠"))) return "text-amber-600";
  return "text-slate-500";
}

/**
 * 항목별 구글시트 입력창.
 * 주소를 저장하면 그 즉시 시트를 읽어 해당 항목 DB에 반영한다.
 * 시트 선택 규칙 — URL 의 #gid= 로 지정한 워크시트 > 항목 이름과 같은 탭 > 시트가 하나면 그 시트.
 */
export async function SheetSources({
  labId,
  tabs,
  from,
  title = "구글시트 연동",
  defaultOpen = false,
}: {
  labId: number;
  tabs: readonly TabName[];
  /** 제출한 메뉴 경로 — 저장 후 이 화면을 갱신한다 */
  from: string;
  title?: string;
  defaultOpen?: boolean;
}) {
  const rows = await Promise.all(
    tabs.map(async (tab) => ({
      tab,
      url: await getLabSetting(labId, itemSrcKey(tab)),
      log: parseLog(await getLabSetting(labId, itemLogKey(tab))),
    }))
  );
  const linked = rows.filter((r) => r.url).length;

  return (
    <details open={defaultOpen} className="card mb-5">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 marker:text-slate-400">
        <span className="mr-1">📊</span>
        {title}
        <span className="ml-2 font-normal text-xs text-slate-400">
          {linked > 0 ? `${linked}/${rows.length}개 항목 연결됨` : "시트 주소를 입력하면 자동으로 가져옵니다"}
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        {rows.map(({ tab, url, log }) => {
          const ref = parseSheetRef(url);
          return (
            <div key={tab} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <form action={saveItemSheet} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="tab" value={tab} />
                <input type="hidden" name="from" value={from} />
                <label className="w-20 shrink-0 text-sm font-medium text-slate-700">{tab}</label>
                <input
                  name="url"
                  defaultValue={url}
                  placeholder="구글시트 주소 붙여넣기 (예: https://docs.google.com/spreadsheets/d/…#gid=0)"
                  className="inp min-w-[16rem] flex-1"
                />
                <button className="btn">저장 · 가져오기</button>
                <button className="btn-ghost" formAction={runItemImport} disabled={!ref.id}>
                  ↻ 다시 가져오기
                </button>
              </form>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[5.5rem] text-xs">
                {ref.id && (
                  <a
                    href={sheetRefUrl(ref)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    시트 열기 ↗
                  </a>
                )}
                {log && (
                  <span className={tone(log.lines)}>
                    {log.at} · {log.lines.join(" / ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
