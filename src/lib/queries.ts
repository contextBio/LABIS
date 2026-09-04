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

export async function listPublications(labId: number) {
  return prisma.publication.findMany({
    where: { labId },
    include: { project: { select: { code: true } } },
    orderBy: [{ year: "desc" }, { id: "desc" }],
  });
}

export async function listPatents(labId: number) {
  return prisma.patent.findMany({
    where: { labId },
    include: { project: { select: { code: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function listTechTransfers(labId: number) {
  return prisma.techTransfer.findMany({
    where: { labId },
    include: { project: { select: { code: true } } },
    orderBy: [{ contractDate: "desc" }, { id: "desc" }],
  });
}

export async function listPurchases(labId: number) {
  return prisma.purchase.findMany({
    where: { labId },
    include: {
      project: { select: { code: true } },
      requester: { select: { name: true } },
    },
    orderBy: [{ orderDate: "desc" }, { id: "desc" }],
  });
}

/** 연구 프로젝트 — 수주 과제와 별개인 랩 내부 연구 단위 */
export async function listResearchProjects(labId: number) {
  return prisma.researchProject.findMany({
    where: { labId },
    include: {
      leader: { select: { name: true } },
      project: { select: { code: true, title: true } },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }, { id: "desc" }],
  });
}

export async function listFundIncomes(labId: number) {
  return prisma.fundIncome.findMany({
    where: { labId },
    include: { project: { select: { code: true, title: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

/** 과제별 수지 분석 — 수입(입금 누계) vs 지출(예산 집행 + 구매) */
export async function financeSummary(labId: number) {
  const projects = await prisma.project.findMany({
    where: { labId },
    include: {
      budgetItems: { select: { amount: true } },
      purchases: { select: { amount: true, status: true } },
      fundIncomes: { select: { amount: true } },
    },
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
  });
  // 과제 미지정 항목
  const [unassignedIncome, unassignedPurchases] = await Promise.all([
    prisma.fundIncome.aggregate({ where: { labId, projectId: null }, _sum: { amount: true } }),
    prisma.purchase.aggregate({
      where: { labId, projectId: null, status: { not: "취소" } },
      _sum: { amount: true },
    }),
  ]);
  const rows = projects.map((p) => {
    const income = p.fundIncomes.reduce((s, x) => s + x.amount, 0);
    const spentBudget = p.budgetItems.reduce((s, x) => s + x.amount, 0);
    const spentPurchase = p.purchases
      .filter((x) => x.status !== "취소")
      .reduce((s, x) => s + x.amount, 0);
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      status: p.status,
      totalBudget: p.totalBudget,
      income,
      spent: spentBudget + spentPurchase,
      spentBudget,
      spentPurchase,
      balance: income - (spentBudget + spentPurchase),
    };
  });
  return {
    rows,
    unassigned: {
      income: unassignedIncome._sum.amount ?? 0,
      spentPurchase: unassignedPurchases._sum.amount ?? 0,
    },
  };
}

export async function dashboardStats(labId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const year = String(new Date().getFullYear());
  const [activeProjects, budgetAgg, spentAgg, members, samples, runningExperiments, brokenOrChecking, overdueCheck, pendingLeaves, pubsThisYear, pendingPurchases] =
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
      prisma.publication.count({ where: { labId, year } }),
      prisma.purchase.count({ where: { labId, status: { in: ["신청", "발주"] } } }),
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
    pubsThisYear,
    pendingPurchases,
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
