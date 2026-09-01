/** SPA 프론트: 내 정보 + 소속 연구실 목록 (학과관리자는 전체 랩). */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, withCors, corsPreflight } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;

  const labs = user.isDeptAdmin
    ? (await prisma.lab.findMany({ orderBy: { name: "asc" } })).map((l) => ({
        labId: l.id,
        labName: l.name,
        role: "DEPT_ADMIN" as const,
      }))
    : user.memberships;

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
