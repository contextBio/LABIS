import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./prisma";
import type { LabRole } from "@prisma/client";

export const ACTIVE_LAB_COOKIE = "labi-active-lab";

const ROLE_RANK: Record<LabRole, number> = { MEMBER: 1, LAB_MANAGER: 2, PI: 3 };

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isDeptAdmin: boolean;
  memberships: { labId: number; labName: string; role: LabRole }[];
};

/** 로그인 필수. 세션을 검증하고 DB에서 최신 사용자·소속 정보를 가져온다. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { include: { lab: true }, orderBy: { lab: { name: "asc" } } } },
  });
  if (!user) redirect("/login");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isDeptAdmin: user.isDeptAdmin,
    memberships: user.memberships.map((m) => ({
      labId: m.labId,
      labName: m.lab.name,
      role: m.role,
    })),
  };
}

/** 학과관리자 전용. */
export async function requireDeptAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isDeptAdmin) redirect("/");
  return user;
}

export type LabContext = {
  user: CurrentUser;
  labId: number;
  labName: string;
  /** 학과관리자는 소속이 없어도 PI 권한으로 취급 */
  role: LabRole;
};

/**
 * 활성 랩 컨텍스트. 쿠키의 랩 선택을 실제 소속(또는 학과관리자 권한)으로 검증한다.
 * minRole 지정 시 해당 권한 미만이면 홈으로 돌려보낸다.
 */
export async function requireLab(minRole: LabRole = "MEMBER"): Promise<LabContext> {
  const user = await requireUser();
  const store = await cookies();
  const raw = store.get(ACTIVE_LAB_COOKIE)?.value;
  const wanted = raw ? Number(raw) : NaN;

  let labId: number | null = null;
  let role: LabRole | null = null;

  const mine = user.memberships.find((m) => m.labId === wanted);
  if (mine) {
    labId = mine.labId;
    role = mine.role;
  } else if (user.isDeptAdmin && Number.isFinite(wanted)) {
    const lab = await prisma.lab.findUnique({ where: { id: wanted } });
    if (lab) {
      labId = lab.id;
      role = "PI";
    }
  }

  // 쿠키가 없거나 무효하면 첫 소속 랩으로
  if (labId === null) {
    if (user.memberships.length > 0) {
      labId = user.memberships[0].labId;
      role = user.memberships[0].role;
    } else if (user.isDeptAdmin) {
      const lab = await prisma.lab.findFirst({ orderBy: { id: "asc" } });
      if (lab) {
        labId = lab.id;
        role = "PI";
      }
    }
  }

  if (labId === null || role === null) redirect("/no-lab");
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) redirect("/");

  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) redirect("/no-lab");
  return { user, labId, labName: lab.name, role };
}

export async function audit(
  userId: string | null,
  labId: number | null,
  action: string,
  entity: string,
  entityId: string | number = "",
  detail?: unknown
) {
  await prisma.auditLog.create({
    data: {
      userId,
      labId,
      action,
      entity,
      entityId: String(entityId),
      detail: detail === undefined ? undefined : JSON.parse(JSON.stringify(detail)),
    },
  });
}
