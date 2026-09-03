import fs from "node:fs";
import path from "node:path";
import { JWT } from "google-auth-library";
import { prisma } from "./prisma";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

// ---------- 랩별 설정 저장 ----------

export async function getLabSetting(labId: number, key: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { scope_labId_key: { scope: "lab", labId, key } },
  });
  return row?.value ?? "";
}

export async function setLabSetting(labId: number, key: string, value: string) {
  await prisma.setting.upsert({
    where: { scope_labId_key: { scope: "lab", labId, key } },
    create: { scope: "lab", labId, key, value },
    update: { value },
  });
}

// ---------- 서비스 계정 ----------

export type ServiceAccount = { client_email: string; private_key: string };

export function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      return JSON.parse(inline) as ServiceAccount;
    } catch {
      return null;
    }
  }
  const candidates = [
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
    path.join(process.cwd(), "data", "service-account.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as ServiceAccount;
    } catch {
      // 잘못된 파일은 무시
    }
  }
  return null;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("구글 액세스 토큰 발급 실패");
  return token;
}

async function api(
  sa: ServiceAccount,
  method: string,
  url: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const token = await accessToken(sa);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function readTab(
  sa: ServiceAccount,
  spreadsheetId: string,
  tab: string
): Promise<string[][]> {
  const data = await api(
    sa,
    "GET",
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`'${tab}'!A1:Z10000`)}?majorDimension=ROWS`
  );
  return (data.values as string[][] | undefined) ?? [];
}

export async function ensureTab(sa: ServiceAccount, spreadsheetId: string, tab: string) {
  const meta = await api(
    sa,
    "GET",
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`
  );
  const titles = ((meta.sheets as { properties: { title: string } }[]) ?? []).map(
    (s) => s.properties.title
  );
  if (!titles.includes(tab)) {
    await api(sa, "POST", `${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: tab } } }],
    });
  }
}

export async function writeTab(
  sa: ServiceAccount,
  spreadsheetId: string,
  tab: string,
  rows: (string | number | null)[][]
) {
  await ensureTab(sa, spreadsheetId, tab);
  await api(
    sa,
    "POST",
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`'${tab}'!A1:Z10000`)}:clear`
  );
  await api(
    sa,
    "PUT",
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`'${tab}'!A1`)}?valueInputOption=RAW`,
    { values: rows.map((r) => r.map((c) => (c === null ? "" : c))) }
  );
}

// ---------- 공개 시트 CSV (읽기 전용 대체 경로) ----------

export async function readPublicTab(spreadsheetId: string, tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    throw new Error(
      `공개 시트를 읽을 수 없습니다 (탭: ${tab}). 시트가 '링크가 있는 모든 사용자'에게 공유되어 있는지 확인하세요.`
    );
  }
  return parseCsv(text);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function extractSpreadsheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

// ---------- 항목별 시트 참조 (URL → 스프레드시트 ID + 워크시트 gid) ----------

/** 항목마다 따로 붙이는 시트 주소. gid 가 있으면 워크시트까지 특정한다. */
export type SheetRef = { id: string; gid: string | null };

export function parseSheetRef(input: string): SheetRef {
  const s = (input ?? "").trim();
  if (!s) return { id: "", gid: null };
  const m = s.match(/[#?&]gid=([0-9]+)/);
  return { id: extractSpreadsheetId(s), gid: m ? m[1] : null };
}

export function sheetRefUrl(ref: SheetRef): string {
  return `https://docs.google.com/spreadsheets/d/${ref.id}${ref.gid ? `/edit#gid=${ref.gid}` : ""}`;
}

export type SheetInfo = { gid: string; title: string };

export async function listSheets(sa: ServiceAccount, spreadsheetId: string): Promise<SheetInfo[]> {
  const meta = await api(
    sa,
    "GET",
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`
  );
  return ((meta.sheets as { properties: { sheetId: number; title: string } }[]) ?? []).map((s) => ({
    gid: String(s.properties.sheetId),
    title: s.properties.title,
  }));
}

/** 공개 시트 CSV — 워크시트를 gid 또는 탭 이름으로 고르고, 둘 다 없으면 첫 시트. */
export async function readPublicSheet(
  spreadsheetId: string,
  opts: { tab?: string; gid?: string | null } = {}
): Promise<string[][]> {
  const qs = opts.gid
    ? `&gid=${encodeURIComponent(opts.gid)}`
    : opts.tab
      ? `&sheet=${encodeURIComponent(opts.tab)}`
      : "";
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${qs}`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    throw new Error(
      "공개 시트를 읽을 수 없습니다. 시트가 '링크가 있는 모든 사용자'에게 공유되어 있는지 확인하세요."
    );
  }
  return parseCsv(text);
}

/**
 * 워크시트 하나를 고른다.
 * 1) URL 에 gid 가 있으면 그 워크시트  2) 없으면 항목 이름과 같은 탭  3) 시트가 하나뿐이면 그 시트
 */
function pickSheet(sheets: SheetInfo[], ref: SheetRef, preferTitle: string): SheetInfo | null {
  if (ref.gid) {
    const byGid = sheets.find((s) => s.gid === ref.gid);
    if (byGid) return byGid;
  }
  const byTitle = sheets.find((s) => s.title === preferTitle);
  if (byTitle) return byTitle;
  return sheets.length === 1 ? sheets[0] : null;
}

/** 시트 주소가 가리키는 워크시트를 읽는다. 서비스 계정이 없으면 공개 CSV 로 대체. */
export async function readSheetRows(
  sa: ServiceAccount | null,
  ref: SheetRef,
  preferTitle: string
): Promise<{ rows: string[][]; sheetTitle: string }> {
  if (sa) {
    const sheets = await listSheets(sa, ref.id);
    if (sheets.length === 0) throw new Error("워크시트가 없는 스프레드시트입니다.");
    const picked = pickSheet(sheets, ref, preferTitle);
    if (!picked) {
      throw new Error(
        `'${preferTitle}' 워크시트를 찾을 수 없습니다. 시트 탭 이름을 '${preferTitle}' 로 하거나, 주소 끝의 #gid= 까지 포함해 붙여넣으세요.`
      );
    }
    return { rows: await readTab(sa, ref.id, picked.title), sheetTitle: picked.title };
  }
  if (ref.gid) {
    return { rows: await readPublicSheet(ref.id, { gid: ref.gid }), sheetTitle: `gid=${ref.gid}` };
  }
  try {
    return { rows: await readPublicSheet(ref.id, { tab: preferTitle }), sheetTitle: preferTitle };
  } catch {
    return { rows: await readPublicSheet(ref.id, {}), sheetTitle: "첫 번째 시트" };
  }
}

/** 시트 주소가 가리키는 워크시트에 쓴다 (없으면 preferTitle 로 탭 생성). */
export async function writeSheetRows(
  sa: ServiceAccount,
  ref: SheetRef,
  preferTitle: string,
  rows: (string | number | null)[][]
): Promise<string> {
  const sheets = await listSheets(sa, ref.id);
  const title = pickSheet(sheets, ref, preferTitle)?.title ?? preferTitle;
  await writeTab(sa, ref.id, title, rows);
  return title;
}
