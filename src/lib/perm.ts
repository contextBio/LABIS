/**
 * 메뉴별 사용자 권한 — 역할(PI/랩매니저/연구원) 위에 얹는 **좁히기 전용** 층.
 *
 * 설정이 없으면 'edit' = 기존 역할 규칙 그대로다(완전 하위호환). 조정은 권한을
 * 넓히지 못하고 좁히기만 한다 — edit 이어도 역할이 모자라면 여전히 막힌다.
 * 연구책임자·학과관리자는 조정 대상에서 빼 둔다(자기 자신을 잠그는 사고 방지).
 */
import { prisma } from "./prisma";
import { MENUS, ADJUSTABLE_MENUS, isMenuKey, type MenuKey } from "./menus";
import type { LabRole } from "@prisma/client";

export type MenuLevel = "none" | "view" | "edit";
export type MenuLevels = Record<MenuKey, MenuLevel>;

const ORDER: Record<MenuLevel, number> = { none: 0, view: 1, edit: 2 };

export const LEVEL_LABEL: Record<MenuLevel, string> = {
  edit: "편집 (기본)",
  view: "읽기 전용",
  none: "차단",
};

export function isMenuLevel(v: string): v is MenuLevel {
  return v === "none" || v === "view" || v === "edit";
}

export function atLeast(have: MenuLevel, need: MenuLevel): boolean {
  return ORDER[have] >= ORDER[need];
}

function allEdit(): MenuLevels {
  const out = {} as MenuLevels;
  for (const m of MENUS) out[m.key] = "edit";
  return out;
}

/** 조정 대상 — 연구책임자·학과관리자는 항상 전체 편집 */
export function isAdjustable(role: LabRole, isDeptAdmin: boolean): boolean {
  return !isDeptAdmin && role !== "PI";
}

/** 이 사용자의 랩 안 메뉴별 권한 (설정이 없는 메뉴는 edit) */
export async function menuLevels(
  labId: number,
  userId: string,
  role: LabRole,
  isDeptAdmin: boolean
): Promise<MenuLevels> {
  const levels = allEdit();
  if (!isAdjustable(role, isDeptAdmin)) return levels;
  const rows = await prisma.menuPermission.findMany({ where: { labId, userId } });
  for (const r of rows) {
    if (isMenuKey(r.menu) && isMenuLevel(r.level) && !MENUS.some((m) => m.key === r.menu && m.fixed)) {
      levels[r.menu] = r.level;
    }
  }
  return levels;
}

/** 팀관리자 화면용 — 랩 구성원 전원의 조정 가능한 메뉴 권한 */
export async function labMenuMatrix(labId: number) {
  const [members, rows] = await Promise.all([
    prisma.membership.findMany({
      where: { labId },
      include: { user: { select: { id: true, name: true, email: true, isDeptAdmin: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.menuPermission.findMany({ where: { labId } }),
  ]);
  const byUser = new Map<string, Record<string, MenuLevel>>();
  for (const r of rows) {
    if (!isMenuLevel(r.level)) continue;
    const cur = byUser.get(r.userId) ?? {};
    cur[r.menu] = r.level;
    byUser.set(r.userId, cur);
  }
  return members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    /** 연구책임자·학과관리자는 조정 대상이 아니다 */
    adjustable: isAdjustable(m.role, m.user.isDeptAdmin),
    levels: Object.fromEntries(
      ADJUSTABLE_MENUS.map((mm) => [mm.key, byUser.get(m.userId)?.[mm.key] ?? "edit"])
    ) as Record<string, MenuLevel>,
  }));
}

/** 한 사람의 한 메뉴 권한을 저장한다. edit(기본)이면 행을 지운다. */
export async function setMenuLevel(
  labId: number,
  userId: string,
  menu: MenuKey,
  level: MenuLevel
) {
  if (level === "edit") {
    await prisma.menuPermission.deleteMany({ where: { labId, userId, menu } });
    return;
  }
  await prisma.menuPermission.upsert({
    where: { labId_userId_menu: { labId, userId, menu } },
    create: { labId, userId, menu, level },
    update: { level },
  });
}
