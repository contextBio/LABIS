/** SPA 프론트: 내 정보 + 소속 연구실 목록 (학과관리자는 전체 랩) + 랩별 메뉴 권한. */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, withCors, corsPreflight } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { menuLevels } from "@/lib/perm";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;

  const all = user.isDeptAdmin
    ? (await prisma.lab.findMany({ orderBy: { name: "asc" } })).map((l) => ({
        labId: l.id,
        labName: l.name,
        labStatus: l.status,
        role: "DEPT_ADMIN" as const,
      }))
    : user.memberships;

  // 폐쇄된 연구실은 목록에서 감춘다. 다만 전부 폐쇄면 감출 곳이 없으니 그대로 둔다
  // (숨김 때문에 아무 데도 못 들어가는 상황을 만들지 않는다).
  const open = all.filter((l) => l.labStatus !== "폐쇄");
  const base = open.length > 0 ? open : all;

  // 팀관리자가 조정한 메뉴별 권한을 같이 내려 사이드바가 잠긴 메뉴를 감추게 한다
  const labs = await Promise.all(
    base.map(async (l) => ({
      ...l,
      levels: await menuLevels(
        l.labId,
        user.id,
        l.role === "DEPT_ADMIN" ? "PI" : l.role,
        user.isDeptAdmin
      ),
    }))
  );

  return withCors(
    req,
    NextResponse.json({
      ok: true,
      user: { name: user.name, email: user.email, isDeptAdmin: user.isDeptAdmin },
      labs,
    })
  );
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
