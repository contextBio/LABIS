"use server";

import { revalidatePath } from "next/cache";
import { setLabSetting, extractSpreadsheetId } from "./google";
import { TABS, type TabName } from "./sheetSync";
import {
  isItemTab, importItemSheet, saveItemSheet as saveItemSheetFor,
  runImportAll, runExportAll,
} from "./sheetItems";
import { requireLab, audit } from "./guard";

/** 항목별 입력창이 어느 메뉴에서 제출됐는지 — 그 경로만 재검증한다. */
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;

function revalidateFrom(fd: FormData) {
  const from = String(fd.get("from") ?? "");
  if (from && from !== "/sync" && SAFE_PATH.test(from)) revalidatePath(from);
  revalidatePath("/sync");
  revalidatePath("/");
}

// ---------- 항목별 시트 ----------

/** 시트 주소를 저장하고, 곧바로 그 항목을 DB로 가져온다. */
export async function saveItemSheet(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const tab = String(fd.get("tab") ?? "");
  if (!isItemTab(tab)) return;
  await saveItemSheetFor(ctx.labId, ctx.user.id, tab, String(fd.get("url") ?? ""));
  revalidateFrom(fd);
}

/** 이미 연결된 시트를 다시 읽어 반영한다. */
export async function runItemImport(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const tab = String(fd.get("tab") ?? "");
  if (!isItemTab(tab)) return;
  await importItemSheet(ctx.labId, ctx.user.id, tab);
  revalidateFrom(fd);
}

// ---------- 랩 통합 스프레드시트 (항목별 주소가 없을 때의 기본값) ----------

export async function saveSpreadsheet(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const id = extractSpreadsheetId(String(fd.get("spreadsheet") ?? ""));
  await setLabSetting(ctx.labId, "spreadsheet_id", id);
  await audit(ctx.user.id, ctx.labId, "sync.spreadsheet", "setting", "spreadsheet_id", { id });
  revalidatePath("/sync");
}

export async function runExport() {
  const ctx = await requireLab("LAB_MANAGER");
  await runExportAll(ctx.labId, ctx.user.id);
  revalidatePath("/sync");
}

export async function runImport(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER");
  const tab = String(fd.get("tab") ?? "");
  const tabs = (TABS as readonly string[]).includes(tab) ? [tab as TabName] : undefined;
  await runImportAll(ctx.labId, ctx.user.id, tabs);
  revalidatePath("/sync");
  revalidatePath("/");
}
