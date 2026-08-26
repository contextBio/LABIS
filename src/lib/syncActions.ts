"use server";

import { revalidatePath } from "next/cache";
import { setSetting, extractSpreadsheetId } from "./google";
import { exportAll, importAll, TABS, type TabName } from "./sheetSync";

function stamp(lines: string[]): string {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  return JSON.stringify({ at: now, lines });
}

export async function saveSpreadsheet(fd: FormData) {
  const id = extractSpreadsheetId(String(fd.get("spreadsheet") ?? ""));
  setSetting("spreadsheet_id", id);
  setSetting("sync_log", stamp([id ? `스프레드시트 연결: ${id}` : "스프레드시트 연결 해제"]));
  revalidatePath("/sync");
}

export async function runExport() {
  try {
    const log = await exportAll();
    setSetting("sync_log", stamp(["✅ 내보내기 (LABi → 구글시트) 완료", ...log]));
  } catch (e) {
    setSetting("sync_log", stamp([`❌ 내보내기 실패: ${e instanceof Error ? e.message : String(e)}`]));
  }
  revalidatePath("/sync");
}

export async function runImport(fd: FormData) {
  const tab = String(fd.get("tab") ?? "");
  const tabs = (TABS as readonly string[]).includes(tab) ? [tab as TabName] : undefined;
  try {
    const log = await importAll(tabs);
    setSetting("sync_log", stamp([`✅ 가져오기 (구글시트 → LABi) 완료${tabs ? ` — ${tab}` : ""}`, ...log]));
  } catch (e) {
    setSetting("sync_log", stamp([`❌ 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`]));
  }
  revalidatePath("/sync");
  revalidatePath("/");
}
