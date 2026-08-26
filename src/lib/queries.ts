import "server-only";
import { prisma } from "./prisma";

/** 랩 구성원 (인사 명부 = User + Membership) */
export async function listLabUsers(labId: number) {
  const ms = await prisma.membership.findMany({
    where: { labId },
    include: { user: true },
    orderBy: [{ user: { workStatus: "asc" } }, { user: { hireDate: "asc" } }],
  });
  // 진행 중 과제 참여율 합계
  const efforts = await prisma.projectMember.groupBy({
    by: ["userId"],
    where: { project: { labId, status: "진행" } },
    _sum: { effortPct: true },
  });
  const effortMap = new Map(efforts.map((e) => [e.userId, e._sum.effortPct ?? 0]));
  return ms.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    position: m.user.position,
    phone: m.user.phone,
    hireDate: m.user.hireDate,
    workStatus: m.user.workStatus,
    labRole: m.role,
    totalEffort: effortMap.get(m.userId) ?? 0,
  }));
}

export type LabUser = Awaited<ReturnType<typeof listLabUsers>>[number];

export async function listLeaves(labId: number) {
  return prisma.leave.findMany({
    where: { labId },
    include: { user: { select: { name: true } } },
    orderBy: { startDate: "desc" },
    take: 100,
  });
}

export async function listProjects(labId: number) {
  const projects = await prisma.project.findMany({
    where: { labId },
    include: {
      pi: { select: { name: true } },
      budgetItems: { select: { amount: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
  });
  return projects.map((p) => ({
    ...p,
    piName: p.pi?.name ?? null,
    spent: p.budgetItems.reduce((s, b) => s + b.amount, 0),
    memberCount: p._count.members,
  }));
}

export async function getProject(labId: number, id: number) {
  const p = await prisma.project.findFirst({
    where: { id, labId },
    include: {
      pi: { select: { name: true } },
      budgetItems: { orderBy: { spentDate: "desc" } },
      milestones: { orderBy: { dueDate: "asc" } },
      members: {
        include: { user: { select: { name: true, position: true } } },
        orderBy: { role: "asc" },
      },
    },
  });
  if (!p) return null;
  return { ...p, piName: p.pi?.name ?? null, spent: p.budgetItems.reduce((s, b) => s + b.amount, 0) };
}

export async function upcomingMilestones(labId: number, limit = 6) {
  return prisma.milestone.findMany({
    where: { status: { not: "완료" }, project: { labId } },
    include: { project: { select: { id: true, code: true, title: true } } },
    orderBy: { dueDate: "asc" },
    take: limit,
  });
}

export async function listSamples(labId: number) {
  return prisma.sample.findMany({
    where: { labId },
    include: {
      project: { select: { id: true, code: true } },
      owner: { select: { name: true } },
    },
    orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
  });
}

export async function listExperiments(labId: number) {
  return prisma.experiment.findMany({
    where: { labId },
    include: {
      project: { select: { id: true, code: true } },
      sample: { select: { code: true } },
      assignee: { select: { name: true } },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
}

export async function listInstruments(labId: number) {
  return prisma.instrument.findMany({
    where: { labId },
    include: { manager: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}

export async function dashboardStats(labId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const [activeProjects, budgetAgg, spentAgg, members, samples, runningExperiments, brokenOrChecking, overdueCheck, pendingLeaves] =
    await Promise.all([
      prisma.project.count({ where: { labId, status: "진행" } }),
      prisma.project.aggregate({ where: { labId, status: "진행" }, _sum: { totalBudget: true } }),
      prisma.budgetItem.aggregate({ where: { project: { labId, status: "진행" } }, _sum: { amount: true } }),
      prisma.membership.count({ where: { labId, user: { workStatus: "재직" } } }),
      prisma.sample.count({ where: { labId, status: { in: ["보관", "사용중"] } } }),
      prisma.experiment.count({ where: { labId, status: "진행" } }),
      prisma.instrument.count({ where: { labId, status: { in: ["점검중", "고장"] } } }),
      prisma.instrument.count({
        where: { labId, status: "정상", nextCheckDate: { not: null, lte: today } },
      }),
      prisma.leave.count({ where: { labId, status: "신청" } }),
    ]);
  return {
    activeProjects,
    totalBudget: budgetAgg._sum.totalBudget ?? 0,
    totalSpent: spentAgg._sum.amount ?? 0,
    members,
    samples,
    runningExperiments,
    instrumentsNeedCheck: brokenOrChecking + overdueCheck,
    pendingLeaves,
  };
}

export async function recentExperiments(labId: number, limit = 5) {
  return prisma.experiment.findMany({
    where: { labId },
    include: { assignee: { select: { name: true } } },
    orderBy: { id: "desc" },
    take: limit,
  });
}
