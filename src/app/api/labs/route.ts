/**
 * 연구실 목록 (공개) — contextbio.ai/labis 정적 프론트 페이지의 선택창이 부른다.
 *
 * 이름·id 만 내준다 — 연구실 이름은 회사 소개에도 실리는 수준의 정보다.
 * 구성원·과제 등 실데이터는 전부 로그인 뒤(requireLab)에만 나온다.
 * CORS 는 회사 사이트 오리진만 반사한다 (쿠키 없는 공개 GET 이라 credentials 불필요).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGINS = new Set([
  "https://contextbio.ai",
  "https://www.contextbio.ai",
  "https://dev-contextbio.web.app",
]);

function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export async function GET(req: NextRequest) {
  const labs = await prisma.lab.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return withCors(req, NextResponse.json({ labs }));
}

export async function OPTIONS(req: NextRequest) {
  return withCors(
    req,
    new NextResponse(null, {
      status: 204,
      headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" },
    })
  );
}
