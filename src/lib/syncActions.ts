"use server";

import { revalidatePath } from "next/cache";
import { setLabSetting, extractSpreadsheetId } from "./google";
import { exportAll, importAll, TABS, type TabName } from "./sheetSync";
import { requireLab, audit } from "./guard";

function stamp(lines: string[]): string {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  return JSON.stringify({ at: now, lines });
}

export async function saveSpreadsheet(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const id = extractSpreadsheetId(String(fd.get("spreadsheet") ?? ""));
  await setLabSetting(ctx.labId, "spreadsheet_id", id);
  await setLabSetting(
    ctx.labId,
    "sync_log",
    stamp([id ? `스프레드시트 연결: ${id}` : "스프레드시트 연결 해제"])
  );
  await audit(ctx.user.id, ctx.labId, "sync.spreadsheet", "setting", "spreadsheet_id", { id });
  revalidatePath("/sync");
}

export async function runExport() {
  const ctx = await requireLab("LAB_MANAGER");
  try {
    const log = await exportAll(ctx.labId);
    await setLabSetting(ctx.labId, "sync_log", stamp(["✅ 내보내기 (LABi → 구글시트) 완료", ...log]));
    await audit(ctx.user.id, ctx.labId, "sync.export", "sheet", "", { lines: log.length });
  } catch (e) {
    await setLabSetting(
      ctx.labId,
      "sync_log",
      stamp([`❌ 내보내기 실패: ${e instanceof Error ? e.message : String(e)}`])
    );
  }
  revalidatePath("/sync");
}

export async function runImport(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const tab = String(fd.get("tab") ?? "");
  const tabs = (TABS as readonly string[]).includes(tab) ? [tab as TabName] : undefined;
  try {
    const log = await importAll(ctx.labId, tabs);
    await setLabSetting(
      ctx.labId,
      "sync_log",
      stamp([`✅ 가져오기 (구글시트 → LABi) 완료${tabs ? ` — ${tab}` : ""}`, ...log])
    );
    await audit(ctx.user.id, ctx.labId, "sync.import", "sheet", tab || "all");
  } catch (e) {
    await setLabSetting(
      ctx.labId,
      "sync_log",
      stamp([`❌ 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`])
    );
  }
  revalidatePath("/sync");
  revalidatePath("/");
}
