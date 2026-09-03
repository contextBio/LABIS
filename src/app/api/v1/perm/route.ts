/** SPA 프론트: 메뉴별 사용자 권한 (팀관리자 = 연구책임자·학과관리자 전용).
 *
 *   GET  /api/v1/perm?lab=N                        → 조정 대상 메뉴 + 구성원별 현재 권한
 *   POST /api/v1/perm?lab=N  {userId, levels:{…}}  → 한 구성원의 권한 저장
 *
 * 화면 쪽 /lab/permissions 와 같은 규칙(perm.ts)을 쓴다.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, apiRank, withCors, corsPreflight } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/guard";
import { labMenuMatrix, setMenuLevel, isMenuLevel, isAdjustable } from "@/lib/perm";
import { ADJUSTABLE_MENUS, isMenuKey } from "@/lib/menus";

export const dynamic = "force-dynamic";

const TEAM_ADMIN = 3; // 연구책임자 이상

const MENUS_OUT = ADJUSTABLE_MENUS.map((m) => ({ key: m.key, label: m.label }));

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (apiRank(user, labId) < TEAM_ADMIN) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }
  return withCors(
    req,
    NextResponse.json({ ok: true, menus: MENUS_OUT, rows: await labMenuMatrix(labId) })
  );
}

export async function POST(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;
  if (apiRank(user, labId) < TEAM_ADMIN) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    levels?: Record<string, string>;
  };
  const userId = String(body.userId ?? "");
  const member = await prisma.membership.findFirst({
    where: { labId, userId },
    include: { user: { select: { isDeptAdmin: true } } },
  });
  if (!member || !isAdjustable(member.role, member.user.isDeptAdmin)) {
    return withCors(req, NextResponse.json({ ok: false, error: "not_adjustable" }, { status: 400 }));
  }

  const levels = body.levels ?? {};
  const changed: Record<string, string> = {};
  for (const [menu, level] of Object.entries(levels)) {
    if (!isMenuKey(menu) || !isMenuLevel(level)) continue;
    if (!ADJUSTABLE_MENUS.some((m) => m.key === menu)) continue;
    await setMenuLevel(labId, userId, menu, level);
    if (level !== "edit") changed[menu] = level;
  }
  await audit(user.id, labId, "perm.menu", "user", userId, changed);
  return withCors(req, NextResponse.json({ ok: true, rows: await labMenuMatrix(labId) }));
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
