import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, apiMenuAllowed, menuForbidden, withCors, corsPreflight } from "@/lib/apiGuard";
import { extractSpreadsheetId, getLabSetting, loadServiceAccount, listSheets, readTab } from "@/lib/google";

export const dynamic = "force-dynamic";
const SPREADSHEET_ID = "13mBXeGufBOwAfd-Ve1emXGMqrNfvbcIOd5TfM7Nn6NE";
const GID = "925054191";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (!(await apiMenuAllowed(user, labId, "finance", "view")) ||
      !(await apiMenuAllowed(user, labId, "dashboard", "view"))) return menuForbidden(req);
  const reply = (body: unknown, status = 200) => withCors(req, NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  }));
  // Only the lab already linked to this workbook may see its financial data.
  if (extractSpreadsheetId(await getLabSetting(labId, "spreadsheet_id")) !== SPREADSHEET_ID) {
    return reply({ ok: true, sheet: null });
  }
  try {
    const sa = loadServiceAccount();
    if (!sa) throw new Error("service_account_missing");
    const tab = (await listSheets(sa, SPREADSHEET_ID)).find(s => s.gid === GID);
    if (!tab) throw new Error("sheet_missing");
    const rows = await readTab(sa, SPREADSHEET_ID, tab.title, "A:J");
    while (rows.length && !rows[rows.length - 1].some(cell => String(cell).trim())) rows.pop();
    return reply({ ok: true, sheet: {
      title: tab.title,
      url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${GID}`,
      rows: rows.map(row => Array.from({ length: 10 }, (_, i) => String(row[i] ?? ""))),
      fetchedAt: new Date().toISOString(),
    } });
  } catch {
    return reply({ ok: false, error: "연구비 시트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
  }
}

export function OPTIONS(req: NextRequest) { return corsPreflight(req); }
