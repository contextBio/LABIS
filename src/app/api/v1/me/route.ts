/** SPA 프론트: 내 정보 + 소속 연구실 목록 (학과관리자는 전체 랩) + 랩별 메뉴 권한. */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, withCors, corsPreflight } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { menuLevels } from "@/lib/perm";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;

  const base = user.isDeptAdmin
    ? (await prisma.lab.findMany({ orderBy: { name: "asc" } })).map((l) => ({
        labId: l.id,
        labName: l.name,
        role: "DEPT_ADMIN" as const,
      }))
    : user.memberships;

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
