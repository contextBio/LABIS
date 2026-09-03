/** 새 연구실 개설 — 입장 화면의 "신규 개설".
 *
 * 통합계정으로 로그인만 되어 있으면 누구나 자기 연구실을 열 수 있다 — 기존
 * 연구실 접근이 초대 기반인 것과 별개로, 새 공간을 여는 일은 셀프서비스다.
 * 개설자는 그 연구실의 연구책임자(PI, 팀 운영자)가 된다. 계정(User)이 아직
 * 없으면 여기서 만든다 — 그래서 apiUser(초대 필수)를 쓰지 않고 토큰을 직접
 * 검증한다(폐기·클레임 포함). 감사 로그에 개설자가 남는다.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyContextBioTokenCached, mayUseLabis } from "@/lib/contextbio";
import { withCors, corsPreflight } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/guard";

function fail(req: NextRequest, status: number, error: string) {
  return withCors(req, NextResponse.json({ ok: false, error }, { status }));
}

export async function POST(req: NextRequest) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!m) return fail(req, 401, "missing_token");
  const ident = await verifyContextBioTokenCached(m[1].trim());
  if (!ident) return fail(req, 401, "invalid_token");
  if (!ident.emailVerified) return fail(req, 403, "email_unverified");
  if (!mayUseLabis(ident)) return fail(req, 403, "service_not_allowed");

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const room = String(body.room ?? "").trim();
  if (!name || name.length > 60) return fail(req, 400, "name_invalid");

  let user = await prisma.user.findUnique({ where: { email: ident.email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: ident.email, name: ident.name || ident.email.split("@")[0] },
    });
  }

  let lab;
  try {
    lab = await prisma.lab.create({
      data: { name, piName: user.name, room },
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return fail(req, 400, "name_taken");
    }
    throw e;
  }
  await prisma.membership.create({
    data: { userId: user.id, labId: lab.id, role: "PI" },
  });
  await audit(user.id, lab.id, "lab.create_self", "lab", lab.id, { name });

  return withCors(req, NextResponse.json({ ok: true, labId: lab.id, labName: lab.name }));
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
