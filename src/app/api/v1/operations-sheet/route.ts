import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, apiMenuAllowed, menuForbidden, withCors, corsPreflight } from "@/lib/apiGuard";
import { extractSpreadsheetId, getLabSetting, loadServiceAccount, listSheets, readTab } from "@/lib/google";
import { parseOperationsRows } from "@/lib/operationsSheet";
export const dynamic = "force-dynamic";
const ID = "1R4QhAQ3g8VdZKeRE8jM20NXNAnnRHqvqhohOekODjXc";
const GID = "124640725";
// This companion workbook belongs to the lab with the existing finance workbook.
const LAB_WORKBOOK = "13mBXeGufBOwAfd-Ve1emXGMqrNfvbcIOd5TfM7Nn6NE";
export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (!(await apiMenuAllowed(user, labId, "dashboard", "view")) || !(await apiMenuAllowed(user, labId, "hr", "view"))) return menuForbidden(req);
  const reply = (body: unknown, status = 200) => withCors(req, NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (extractSpreadsheetId(await getLabSetting(labId, "spreadsheet_id")) !== LAB_WORKBOOK) return reply({ ok: true, sheet: null });
  try {
    const sa = loadServiceAccount();
    if (!sa) throw new Error("service_account_missing");
    const tab = (await listSheets(sa, ID)).find(s => s.gid === GID);
    if (!tab) throw new Error("sheet_missing");
    // Read only approved columns; never fetch the credentials in H.
    const [rows, reviews] = await Promise.all([readTab(sa, ID, tab.title, "A:G"), readTab(sa, ID, tab.title, "I:I")]);
    return reply({ ok: true, sheet: { title: tab.title, url: `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=${GID}`, ...parseOperationsRows(rows, reviews), fetchedAt: new Date().toISOString() } });
  } catch {
    return reply({ ok: false, error: "연구실 운영관리 시트를 불러오지 못했습니다." }, 502);
  }
}
export function OPTIONS(req: NextRequest) { return corsPreflight(req); }
