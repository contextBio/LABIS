/**
 * 항목별 구글시트 연동의 공통 알맹이.
 *
 * 기존 화면(서버 액션 syncActions.ts)과 새 화면(REST /api/v1/sheet)이 **같은 함수**를
 * 쓴다 — 주소 저장·가져오기·결과 로그가 두 화면에서 갈라지지 않도록.
 */
import { getLabSetting, setLabSetting, parseSheetRef, loadServiceAccount } from "./google";
import {
  importTab, importAll, exportAll, itemSrcKey, itemLogKey,
  ITEM_TABS, TABS, SPECS, type TabName,
} from "./sheetSync";
import { audit } from "./guard";

export type ItemLog = { at: string; lines: string[] };
export type ItemStatus = {
  tab: TabName;
  url: string;
  id: string;
  gid: string | null;
  log: ItemLog | null;
};

export function isItemTab(v: string): v is TabName {
  return (ITEM_TABS as readonly string[]).includes(v);
}

/** 쉼표로 넘어온 항목 목록 → 유효한 항목만. 비어 있으면 전체. */
export function parseTabs(csv: string): TabName[] {
  const picked = csv.split(",").map((t) => t.trim()).filter(isItemTab);
  return picked.length ? picked : [...ITEM_TABS];
}

async function writeItemLog(labId: number, tab: TabName, lines: string[]): Promise<ItemLog> {
  const log: ItemLog = {
    at: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    lines,
  };
  await setLabSetting(labId, itemLogKey(tab), JSON.stringify(log));
  return log;
}

export async function readItemLog(labId: number, tab: TabName): Promise<ItemLog | null> {
  const raw = await getLabSetting(labId, itemLogKey(tab));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ItemLog;
  } catch {
    return null;
  }
}

/** 연결된 시트를 읽어 항목 DB에 반영한다. 실패해도 던지지 않고 로그로 남긴다. */
export async function importItemSheet(
  labId: number,
  userId: string,
  tab: TabName
): Promise<ItemLog> {
  try {
    const lines = await importTab(labId, tab);
    await audit(userId, labId, "sync.import", "sheet", tab, { lines: lines.length });
    return await writeItemLog(labId, tab, ["✅ 가져오기 완료", ...lines]);
  } catch (e) {
    return await writeItemLog(labId, tab, [
      `❌ 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }
}

/** 시트 주소를 저장하고, 주소가 있으면 그 자리에서 가져온다. */
export async function saveItemSheet(
  labId: number,
  userId: string,
  tab: TabName,
  url: string
): Promise<ItemLog> {
  const raw = (url ?? "").trim();
  const ref = parseSheetRef(raw);
  await setLabSetting(labId, itemSrcKey(tab), ref.id ? raw : "");
  await audit(userId, labId, "sync.itemSheet", "setting", itemSrcKey(tab), {
    id: ref.id,
    gid: ref.gid,
  });
  if (!ref.id) return writeItemLog(labId, tab, ["연결 해제됨"]);
  return importItemSheet(labId, userId, tab);
}

export async function itemStatus(
  labId: number,
  tabs: readonly TabName[]
): Promise<ItemStatus[]> {
  return Promise.all(
    tabs.map(async (tab) => {
      const url = await getLabSetting(labId, itemSrcKey(tab));
      const ref = parseSheetRef(url);
      return { tab, url, id: ref.id, gid: ref.gid, log: await readItemLog(labId, tab) };
    })
  );
}

// ---------- 랩 전체 (한 번에 실행) ----------

const SYNC_LOG_KEY = "sync_log";

export function serviceAccountEmail(): string | null {
  const sa = loadServiceAccount();
  return sa ? sa.client_email : null;
}

/** 시트 양식 안내 — 항목별 1행 헤더와 가져오기 가능 여부. */
export function sheetGuide() {
  return TABS.map((tab) => ({
    tab,
    headers: SPECS[tab].headers,
    importable: SPECS[tab].importRows !== null,
  }));
}

export async function readSyncLog(labId: number): Promise<ItemLog | null> {
  const raw = await getLabSetting(labId, SYNC_LOG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ItemLog;
  } catch {
    return null;
  }
}

async function writeSyncLog(labId: number, lines: string[]): Promise<ItemLog> {
  const log: ItemLog = {
    at: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    lines,
  };
  await setLabSetting(labId, SYNC_LOG_KEY, JSON.stringify(log));
  return log;
}

export async function runImportAll(
  labId: number,
  userId: string,
  tabs?: TabName[]
): Promise<ItemLog> {
  try {
    const lines = await importAll(labId, tabs);
    await audit(userId, labId, "sync.import", "sheet", tabs?.join(",") || "all");
    return await writeSyncLog(labId, [
      `✅ 가져오기 (구글시트 → LABIS) 완료${tabs ? ` — ${tabs.join(", ")}` : ""}`,
      ...lines,
    ]);
  } catch (e) {
    return await writeSyncLog(labId, [
      `❌ 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }
}

export async function runExportAll(labId: number, userId: string): Promise<ItemLog> {
  try {
    const lines = await exportAll(labId);
    await audit(userId, labId, "sync.export", "sheet", "", { lines: lines.length });
    return await writeSyncLog(labId, ["✅ 내보내기 (LABIS → 구글시트) 완료", ...lines]);
  } catch (e) {
    return await writeSyncLog(labId, [
      `❌ 내보내기 실패: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }
}
