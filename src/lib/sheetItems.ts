/**
 * 항목별 구글시트 연동의 공통 알맹이.
 *
 * 기존 화면(서버 액션 syncActions.ts)과 새 화면(REST /api/v1/sheet)이 **같은 함수**를
 * 쓴다 — 주소 저장·가져오기·결과 로그가 두 화면에서 갈라지지 않도록.
 */
import {
  getLabSetting, setLabSetting, parseSheetRef, loadServiceAccount,
  extractFolderId, listDriveSheets, type DriveSheet,
} from "./google";
import {
  importTab, importAll, exportAll, itemSrcKey, itemLogKey,
  ITEM_TABS, TABS, SPECS, type TabName,
} from "./sheetSync";
// guard 가 아니라 audit.ts 에서 가져온다 — 이 모듈은 에이전트(tsx)도 쓴다
import { audit } from "./audit";

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

function stamp(): string {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

async function writeItemLog(labId: number, tab: TabName, lines: string[]): Promise<ItemLog> {
  const log: ItemLog = { at: stamp(), lines };
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
  userId: string | null,
  tab: TabName,
  opts: { changedOnly?: boolean } = {}
): Promise<ItemLog> {
  try {
    const { lines, changed } = await importTab(labId, tab, opts);
    // 주기 실행이 '변경 없음' 으로 지난 반영 내역을 덮지 않게 한다
    if (!changed && opts.changedOnly) {
      return (await readItemLog(labId, tab)) ?? { at: stamp(), lines };
    }
    await audit(userId, labId, "sync.import", "sheet", tab, { lines: lines.length });
    return await writeItemLog(labId, tab, ["✅ 가져오기 완료", ...lines]);
  } catch (e) {
    return await writeItemLog(labId, tab, [
      `❌ 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }
}

/**
 * 에이전트용 가져오기 — 사람이 누른 것과 구분해서 다룬다.
 *
 * 시트 내용이 그대로면 DB·로그를 아예 건드리지 않는다(changed=false). 반영했거나
 * 실패했을 때만 항목 로그를 남겨, 화면에서도 마지막 결과를 그대로 볼 수 있게 한다.
 */
export async function syncItem(
  labId: number,
  tab: TabName,
  opts: { changedOnly?: boolean } = {}
): Promise<{ changed: boolean; lines: string[] }> {
  try {
    const { lines, changed } = await importTab(labId, tab, opts);
    if (changed) {
      await audit(null, labId, "sync.agent", "sheet", tab, { lines: lines.length });
      await writeItemLog(labId, tab, ["✅ 에이전트 가져오기", ...lines]);
    }
    return { changed, lines };
  } catch (e) {
    const msg = `❌ 에이전트 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`;
    await writeItemLog(labId, tab, [msg]);
    return { changed: false, lines: [msg] };
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
  const log: ItemLog = { at: stamp(), lines };
  await setLabSetting(labId, SYNC_LOG_KEY, JSON.stringify(log));
  return log;
}

export async function runImportAll(
  labId: number,
  userId: string | null,
  tabs?: TabName[],
  opts: { changedOnly?: boolean } = {}
): Promise<ItemLog> {
  try {
    const { lines, changed } = await importAll(labId, tabs, opts);
    if (!changed && opts.changedOnly) {
      return (await readSyncLog(labId)) ?? { at: stamp(), lines };
    }
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

// ---------- 구글 드라이브 폴더 (대시보드에 시트 목록을 띄운다) ----------

const DRIVE_KEY = "drive_folder";

export type DriveFolderView = {
  folderId: string;
  url: string;
  files: DriveSheet[];
  /** 읽지 못했으면 이유 — 화면에 그대로 보여 준다 */
  error: string | null;
};

/** 대시보드가 매번 드라이브를 두드리지 않도록 잠깐 담아 둔다 */
const driveCache = new Map<string, { at: number; files: DriveSheet[] }>();
const DRIVE_TTL_MS = 60_000;

export function getDriveFolderRaw(labId: number) {
  return getLabSetting(labId, DRIVE_KEY);
}

export async function setDriveFolder(labId: number, userId: string, raw: string) {
  const id = extractFolderId(raw);
  await setLabSetting(labId, DRIVE_KEY, id);
  driveCache.delete(id);
  await audit(userId, labId, "drive.folder", "setting", DRIVE_KEY, { id });
}

/** 폴더가 설정돼 있으면 그 안의 스프레드시트 목록. 설정 전이면 null. */
export async function labDriveSheets(labId: number): Promise<DriveFolderView | null> {
  const folderId = extractFolderId(await getLabSetting(labId, DRIVE_KEY));
  if (!folderId) return null;
  const url = `https://drive.google.com/drive/folders/${folderId}`;

  const sa = loadServiceAccount();
  if (!sa) {
    return { folderId, url, files: [], error: "서비스 계정이 없어 드라이브 폴더를 읽을 수 없습니다." };
  }
  const hit = driveCache.get(folderId);
  if (hit && Date.now() - hit.at < DRIVE_TTL_MS) {
    return { folderId, url, files: hit.files, error: null };
  }
  try {
    const files = await listDriveSheets(sa, folderId);
    driveCache.set(folderId, { at: Date.now(), files });
    return { folderId, url, files, error: null };
  } catch (e) {
    return { folderId, url, files: [], error: e instanceof Error ? e.message : String(e) };
  }
}
