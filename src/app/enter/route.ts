/**
 * 프론트 페이지에서 들어오는 입장 지점 — /enter?lab=<id>
 *
 * contextbio.ai/labis 의 정적 프론트에서 연구실을 골라 제출하면 여기로 온다.
 * 미로그인 → 로그인 화면(?next=/enter?lab=N)으로 보냈다가 되돌아오고,
 * 로그인 → 소속(또는 학과관리자) 검증 뒤 활성 랩 쿠키를 심고 대시보드로 간다.
 * 소속이 아니면 쿠키를 건드리지 않고 대시보드로만 보낸다 — 선택창은 안내일 뿐
 * 권한은 언제나 서버 가드(requireLab)가 정한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_LAB_COOKIE } from "@/lib/guard";

// 리다이렉트는 절대주소로 — Next 의 basePath(/labis·/labis-dev)는 라우트 핸들러가
// 만드는 URL 에 자동으로 붙지 않는다 (authActions 의 BASE 와 같은 이유).
const APP = (process.env.APP_URL || "").replace(/\/+$/, "");
const BASE = process.env.NEXT_BASE_PATH || "/labis";

function to(path: string, req: NextRequest): URL {
  return APP ? new URL(`${APP}${path}`) : new URL(`${BASE}${path}`, req.nextUrl);
}

export async function GET(req: NextRequest) {
  const labRaw = req.nextUrl.searchParams.get("lab") ?? "";
  const labId = Number(labRaw);

  const session = await auth();
  if (!session?.user?.id) {
    const next = `/enter${labRaw ? `?lab=${encodeURIComponent(labRaw)}` : ""}`;
    return NextResponse.redirect(to(`/login?next=${encodeURIComponent(next)}`, req));
  }

  const res = NextResponse.redirect(to("/", req));
  if (Number.isFinite(labId) && labId > 0) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: true },
    });
    const allowed =
      !!user &&
      (user.isDeptAdmin || user.memberships.some((m) => m.labId === labId));
    if (allowed) {
      res.cookies.set(ACTIVE_LAB_COOKIE, String(labId), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }
  return res;
}
