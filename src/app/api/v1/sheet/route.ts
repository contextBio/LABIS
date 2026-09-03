/** SPA 프론트: 항목별 구글시트 연동 — 기존 화면의 /sync 와 같은 알맹이(sheetItems.ts).
 *
 *   GET  /api/v1/sheet?lab=N&tabs=과제,예산집행   → 항목별 주소·최근 결과
 *   GET  /api/v1/sheet?lab=N&full=1                 → + 인증 상태·전체 실행 로그·시트 양식
 *   POST /api/v1/sheet?lab=N  {op:"save", tab, url}  → 주소 저장 + 곧바로 가져오기
 *   POST /api/v1/sheet?lab=N  {op:"import", tab}     → 연결된 시트 다시 가져오기
 *   POST /api/v1/sheet?lab=N  {op:"import_all"|"export_all"} → 랩 전체 한 번에
 *
 * 운영자(랩매니저) 이상만. 시트 읽기·DB 반영이 오래 걸릴 수 있어 정적 최적화를 끈다.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  apiUser, apiLab, apiRank, apiMenuAllowed, menuForbidden, withCors, corsPreflight,
} from "@/lib/apiGuard";
import {
  parseTabs, isItemTab, itemStatus, importItemSheet, saveItemSheet,
  runImportAll, runExportAll, readSyncLog, serviceAccountEmail, sheetGuide,
} from "@/lib/sheetItems";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIN_RANK = 2;

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (apiRank(user, labId) < MIN_RANK) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }
  if (!(await apiMenuAllowed(user, labId, "sheets", "edit"))) return menuForbidden(req);
  const tabs = parseTabs(req.nextUrl.searchParams.get("tabs") || "");
  const rows = await itemStatus(labId, tabs);
  // 전용 화면(구글시트 연동)만 부가 정보까지 — 메뉴 안 패널은 목록만 받는다
  if (req.nextUrl.searchParams.get("full") !== "1") {
    return withCors(req, NextResponse.json({ ok: true, rows }));
  }
  return withCors(
    req,
    NextResponse.json({
      ok: true,
      rows,
      account: serviceAccountEmail(),
      syncLog: await readSyncLog(labId),
      guide: sheetGuide(),
    })
  );
}

export async function POST(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (apiRank(user, labId) < MIN_RANK) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }
  if (!(await apiMenuAllowed(user, labId, "sheets", "edit"))) return menuForbidden(req);

  const body = (await req.json().catch(() => ({}))) as { op?: string; tab?: string; url?: string };

  if (body.op === "import_all" || body.op === "export_all") {
    const log = body.op === "import_all"
      ? await runImportAll(labId, user.id)
      : await runExportAll(labId, user.id);
    return withCors(req, NextResponse.json({ ok: true, log }));
  }

  const tab = String(body.tab ?? "");
  if (!isItemTab(tab)) {
    return withCors(req, NextResponse.json({ ok: false, error: "unknown_tab" }, { status: 400 }));
  }

  const log =
    body.op === "save"
      ? await saveItemSheet(labId, user.id, tab, String(body.url ?? ""))
      : body.op === "import"
        ? await importItemSheet(labId, user.id, tab)
        : null;
  if (!log) {
    return withCors(req, NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 }));
  }
  const rows = await itemStatus(labId, [tab]);
  return withCors(req, NextResponse.json({ ok: true, log, row: rows[0] }));
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
