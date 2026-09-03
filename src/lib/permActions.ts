"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireLab, audit } from "./guard";
import { setMenuLevel, isMenuLevel, isAdjustable } from "./perm";
import { ADJUSTABLE_MENUS } from "./menus";

/** 구성원 한 명의 메뉴별 권한을 한 번에 저장한다 — 팀관리자(연구책임자) 전용. */
export async function saveMenuPermissions(fd: FormData) {
  const ctx = await requireLab("PI");
  const userId = String(fd.get("user_id") ?? "");
  const member = await prisma.membership.findFirst({
    where: { labId: ctx.labId, userId },
    include: { user: { select: { isDeptAdmin: true } } },
  });
  // 연구책임자·학과관리자는 조정 대상이 아니다 (자기 자신을 잠그는 사고 방지)
  if (!member || !isAdjustable(member.role, member.user.isDeptAdmin)) return;

  const changed: Record<string, string> = {};
  for (const m of ADJUSTABLE_MENUS) {
    const v = String(fd.get(`level_${m.key}`) ?? "edit");
    if (!isMenuLevel(v)) continue;
    await setMenuLevel(ctx.labId, userId, m.key, v);
    if (v !== "edit") changed[m.key] = v;
  }
  await audit(ctx.user.id, ctx.labId, "perm.menu", "user", userId, changed);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}
