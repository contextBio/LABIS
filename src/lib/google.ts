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

type ServiceAccount = { client_email: string; private_key: string };

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
