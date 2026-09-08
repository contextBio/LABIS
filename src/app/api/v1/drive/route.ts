/** SPA 프론트: 대시보드에 띄우는 구글 드라이브 폴더의 스프레드시트 목록.
 *
 *   GET  /api/v1/drive?lab=N          → {folder: {url, files[], error} | null}  (랩 구성원)
 *   POST /api/v1/drive?lab=N {folder} → 폴더 주소 저장 (운영자 + 시트 권한)
 *
 * 목록은 읽기 전용이라 구성원 누구나 본다 — 폴더를 정하는 것만 운영자 몫이다.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  apiUser, apiLab, apiRank, apiMenuAllowed, menuForbidden, withCors, corsPreflight,
} from "@/lib/apiGuard";
import { labDriveSheets, setDriveFolder, getDriveFolderRaw } from "@/lib/sheetItems";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  return withCors(
    req,
    NextResponse.json({
      ok: true,
      folder: await labDriveSheets(labId),
      raw: apiRank(user, labId) >= 2 ? await getDriveFolderRaw(labId) : "",
    })
  );
}

export async function POST(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (apiRank(user, labId) < 2) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }
  if (!(await apiMenuAllowed(user, labId, "sheets", "edit"))) return menuForbidden(req);

  const body = (await req.json().catch(() => ({}))) as { folder?: string };
  await setDriveFolder(labId, user.id, String(body.folder ?? ""));
  return withCors(
    req,
    NextResponse.json({ ok: true, folder: await labDriveSheets(labId), raw: await getDriveFolderRaw(labId) })
  );
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
