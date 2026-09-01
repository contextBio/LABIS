/**
 * SPA 프론트용 REST(/api/v1) 인증 가드 — BioWrit 모델.
 *
 * 세션 쿠키가 아니라 **Authorization: Bearer <contextBio ID 토큰>** 을 요청마다
 * 검증한다(폐기·클레임 포함, 5분 캐시). 프론트는 회사 사이트 오리진에서 서빙되고
 * 쿠키를 쓰지 않으므로 CSRF 표면이 없다 — 함대 공통 규약의 기본 전송 방식이다.
 *
 * 권한: 초대된 User 여야 하고, lab 지정 요청은 소속(또는 학과관리자)을 검증한다 —
 * 화면 쪽 가드(requireLab)와 같은 규칙이다.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyContextBioTokenCached, mayUseLabis } from "./contextbio";
import { prisma } from "./prisma";
import type { LabRole } from "@prisma/client";

const ALLOWED_ORIGINS = new Set([
  "https://contextbio.ai",
  "https://www.contextbio.ai",
  "https://dev-contextbio.web.app",
]);

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export function corsPreflight(req: NextRequest): NextResponse {
  return withCors(
    req,
    new NextResponse(null, {
      status: 204,
      headers: { "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
    })
  );
}

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  isDeptAdmin: boolean;
  memberships: { labId: number; labName: string; role: LabRole }[];
};

function fail(req: NextRequest, status: number, error: string): NextResponse {
  return withCors(req, NextResponse.json({ ok: false, error }, { status }));
}

/** Bearer 토큰 → 초대된 사용자. 실패하면 NextResponse(401/403)를 돌려준다. */
export async function apiUser(req: NextRequest): Promise<ApiUser | NextResponse> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!m) return fail(req, 401, "missing_token");
  const ident = await verifyContextBioTokenCached(m[1].trim());
  if (!ident) return fail(req, 401, "invalid_token");
  if (!ident.emailVerified) return fail(req, 403, "email_unverified");
  if (!mayUseLabis(ident)) return fail(req, 403, "service_not_allowed");

  const user = await prisma.user.findUnique({
    where: { email: ident.email },
    include: { memberships: { include: { lab: true }, orderBy: { lab: { name: "asc" } } } },
  });
  if (!user) return fail(req, 403, "not_invited");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isDeptAdmin: user.isDeptAdmin,
    memberships: user.memberships.map((mb) => ({
      labId: mb.labId,
      labName: mb.lab.name,
      role: mb.role,
    })),
  };
}

/** ?lab=N 검증 — 소속이거나 학과관리자만. 실패하면 NextResponse(400/403). */
export function apiLab(req: NextRequest, user: ApiUser): number | NextResponse {
  const labId = Number(req.nextUrl.searchParams.get("lab"));
  if (!Number.isFinite(labId) || labId <= 0) return fail(req, 400, "lab_required");
  const allowed = user.isDeptAdmin || user.memberships.some((m) => m.labId === labId);
  if (!allowed) return fail(req, 403, "lab_forbidden");
  return labId;
}
