"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { requireLab, audit } from "./guard";

function s(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function n(fd: FormData, key: string): number {
  const v = Number(fd.get(key) ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function nid(fd: FormData, key: string): number | null {
  const v = s(fd, key);
  return v ? Number(v) : null;
}
function sid(fd: FormData, key: string): string | null {
  const v = s(fd, key);
  return v || null;
}
const today = () => new Date().toISOString().slice(0, 10);

/** 해당 유저가 이 랩 소속인지 확인 (외부 id 주입 방지) */
async function assertLabUser(labId: number, userId: string | null) {
  if (!userId) return null;
  const m = await prisma.membership.findFirst({ where: { labId, userId } });
  return m ? userId : null;
}

// ---------- 인사관리 ----------

export async function updateProfile(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "hr", "edit");
  const userId = s(fd, "user_id");
  if (!(await assertLabUser(ctx.labId, userId))) return;
  await prisma.user.update({
    where: { id: userId },
    data: {
      position: s(fd, "position") || "연구원",
      phone: s(fd, "phone"),
      hireDate: s(fd, "hire_date"),
      workStatus: s(fd, "work_status") || "재직",
    },
  });
  await audit(ctx.user.id, ctx.labId, "hr.profile_update", "user", userId);
  revalidatePath("/hr");
}

export async function createLeave(fd: FormData) {
  const ctx = await requireLab("MEMBER", "hr", "edit");
  // 일반 구성원은 본인 휴가만 신청, 매니저 이상은 대리 신청 가능
  let userId = s(fd, "user_id") || ctx.user.id;
  if (ctx.role === "MEMBER") userId = ctx.user.id;
  if (!(await assertLabUser(ctx.labId, userId))) return;
  await prisma.leave.create({
    data: {
      labId: ctx.labId,
      userId,
      type: s(fd, "type") || "연차",
      startDate: s(fd, "start_date"),
      endDate: s(fd, "end_date") || s(fd, "start_date"),
      days: n(fd, "days") || 1,
      reason: s(fd, "reason"),
    },
  });
  revalidatePath("/hr");
}

export async function setLeaveStatus(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "hr", "edit");
  const id = n(fd, "id");
  const status = s(fd, "status");
  await prisma.leave.updateMany({ where: { id, labId: ctx.labId }, data: { status } });
  await audit(ctx.user.id, ctx.labId, "hr.leave_status", "leave", id, { status });
  revalidatePath("/hr");
}

// ---------- 과제관리 ----------

export async function createProject(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const piId = await assertLabUser(ctx.labId, sid(fd, "pi_id"));
  const project = await prisma.project.create({
    data: {
      labId: ctx.labId,
      code: s(fd, "code"),
      title: s(fd, "title"),
      sponsor: s(fd, "sponsor"),
      program: s(fd, "program"),
      piId,
      startDate: s(fd, "start_date"),
      endDate: s(fd, "end_date"),
      totalBudget: n(fd, "total_budget"),
      status: s(fd, "status") || "진행",
      memo: s(fd, "memo"),
    },
  });
  await audit(ctx.user.id, ctx.labId, "project.create", "project", project.id, {
    code: project.code,
  });
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectStatus(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const id = n(fd, "id");
  const status = s(fd, "status");
  await prisma.project.updateMany({ where: { id, labId: ctx.labId }, data: { status } });
  await audit(ctx.user.id, ctx.labId, "project.status", "project", id, { status });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(fd: FormData) {
  const ctx = await requireLab("PI", "projects", "edit");
  const id = n(fd, "id");
  await prisma.project.deleteMany({ where: { id, labId: ctx.labId } });
  await audit(ctx.user.id, ctx.labId, "project.delete", "project", id);
  revalidatePath("/projects");
  redirect("/projects");
}

async function assertLabProject(labId: number, projectId: number) {
  const p = await prisma.project.findFirst({ where: { id: projectId, labId } });
  return p ? p.id : null;
}

export async function addProjectMember(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const projectId = await assertLabProject(ctx.labId, n(fd, "project_id"));
  const userId = await assertLabUser(ctx.labId, sid(fd, "user_id"));
  if (!projectId || !userId) return;
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      role: s(fd, "role") || "참여연구원",
      effortPct: n(fd, "effort_pct"),
    },
    update: { role: s(fd, "role") || "참여연구원", effortPct: n(fd, "effort_pct") },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectMember(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const id = n(fd, "id");
  await prisma.projectMember.deleteMany({ where: { id, project: { labId: ctx.labId } } });
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

export async function addMilestone(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const projectId = await assertLabProject(ctx.labId, n(fd, "project_id"));
  if (!projectId) return;
  await prisma.milestone.create({
    data: {
      projectId,
      title: s(fd, "title"),
      dueDate: s(fd, "due_date"),
      status: s(fd, "status") || "예정",
      memo: s(fd, "memo"),
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function setMilestoneStatus(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  await prisma.milestone.updateMany({
    where: { id: n(fd, "id"), project: { labId: ctx.labId } },
    data: { status: s(fd, "status") },
  });
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

export async function deleteMilestone(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  await prisma.milestone.deleteMany({
    where: { id: n(fd, "id"), project: { labId: ctx.labId } },
  });
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

export async function addBudgetItem(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const projectId = await assertLabProject(ctx.labId, n(fd, "project_id"));
  if (!projectId) return;
  const item = await prisma.budgetItem.create({
    data: {
      projectId,
      category: s(fd, "category") || "기타",
      item: s(fd, "item"),
      amount: n(fd, "amount"),
      spentDate: s(fd, "spent_date") || today(),
      memo: s(fd, "memo"),
    },
  });
  await audit(ctx.user.id, ctx.labId, "budget.add", "budget_item", item.id, {
    amount: item.amount,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBudgetItem(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "projects", "edit");
  const id = n(fd, "id");
  await prisma.budgetItem.deleteMany({ where: { id, project: { labId: ctx.labId } } });
  await audit(ctx.user.id, ctx.labId, "budget.delete", "budget_item", id);
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

// ---------- 성과 (논문 · 특허 · 기술이전) ----------

export async function createPublication(fd: FormData) {
  const ctx = await requireLab("MEMBER", "outcomes", "edit");
  await prisma.publication.create({
    data: {
      labId: ctx.labId,
      title: s(fd, "title"),
      journal: s(fd, "journal"),
      year: s(fd, "year"),
      authors: s(fd, "authors"),
      doi: s(fd, "doi"),
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/outcomes");
}

export async function deletePublication(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "outcomes", "edit");
  await prisma.publication.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/outcomes");
}

export async function createPatent(fd: FormData) {
  const ctx = await requireLab("MEMBER", "outcomes", "edit");
  await prisma.patent.create({
    data: {
      labId: ctx.labId,
      title: s(fd, "title"),
      applicationNo: s(fd, "application_no"),
      registrationNo: s(fd, "registration_no"),
      status: s(fd, "status") || "출원",
      date: s(fd, "date"),
      inventors: s(fd, "inventors"),
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/outcomes");
}

export async function setPatentStatus(fd: FormData) {
  const ctx = await requireLab("MEMBER", "outcomes", "edit");
  await prisma.patent.updateMany({
    where: { id: n(fd, "id"), labId: ctx.labId },
    data: { status: s(fd, "status") },
  });
  revalidatePath("/outcomes");
}

export async function deletePatent(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "outcomes", "edit");
  await prisma.patent.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/outcomes");
}

export async function createTechTransfer(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "outcomes", "edit");
  await prisma.techTransfer.create({
    data: {
      labId: ctx.labId,
      title: s(fd, "title"),
      licensee: s(fd, "licensee"),
      contractDate: s(fd, "contract_date"),
      amount: n(fd, "amount"),
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/outcomes");
}

export async function deleteTechTransfer(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "outcomes", "edit");
  await prisma.techTransfer.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/outcomes");
}

// ---------- 구매 ----------

/* ── 연구 프로젝트 ── */

export async function createResearchProject(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "research", "edit");
  await prisma.researchProject.create({
    data: {
      labId: ctx.labId,
      code: s(fd, "code"),
      title: s(fd, "title"),
      goal: s(fd, "goal"),
      leaderId: await assertLabUser(ctx.labId, sid(fd, "leader_id")),
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      startDate: s(fd, "start_date"),
      endDate: s(fd, "end_date"),
      status: s(fd, "status") || "진행",
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/research");
}

export async function setResearchProjectStatus(fd: FormData) {
  const ctx = await requireLab("MEMBER", "research", "edit");
  await prisma.researchProject.updateMany({
    where: { id: n(fd, "id"), labId: ctx.labId },
    data: { status: s(fd, "status") },
  });
  revalidatePath("/research");
}

export async function deleteResearchProject(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "research", "edit");
  await prisma.researchProject.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/research");
}

export async function createPurchase(fd: FormData) {
  const ctx = await requireLab("MEMBER", "purchases", "edit");
  await prisma.purchase.create({
    data: {
      labId: ctx.labId,
      item: s(fd, "item"),
      vendor: s(fd, "vendor"),
      category: s(fd, "category") || "재료비",
      amount: n(fd, "amount"),
      orderDate: s(fd, "order_date") || today(),
      status: s(fd, "status") || "신청",
      requesterId: (await assertLabUser(ctx.labId, sid(fd, "requester_id"))) ?? ctx.user.id,
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/purchases");
}

export async function setPurchaseStatus(fd: FormData) {
  const ctx = await requireLab("MEMBER", "purchases", "edit");
  await prisma.purchase.updateMany({
    where: { id: n(fd, "id"), labId: ctx.labId },
    data: { status: s(fd, "status") },
  });
  revalidatePath("/purchases");
}

export async function deletePurchase(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "purchases", "edit");
  await prisma.purchase.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/purchases");
}

// ---------- 연구비 수입 ----------

export async function createFundIncome(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "finance", "edit");
  const income = await prisma.fundIncome.create({
    data: {
      labId: ctx.labId,
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      date: s(fd, "date") || today(),
      amount: n(fd, "amount"),
      note: s(fd, "note"),
    },
  });
  await audit(ctx.user.id, ctx.labId, "fund.income_add", "fund_income", income.id, {
    amount: income.amount,
  });
  revalidatePath("/finance");
}

export async function deleteFundIncome(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "finance", "edit");
  const id = n(fd, "id");
  await prisma.fundIncome.deleteMany({ where: { id, labId: ctx.labId } });
  await audit(ctx.user.id, ctx.labId, "fund.income_delete", "fund_income", id);
  revalidatePath("/finance");
}

// ---------- LIMS ----------

export async function createSample(fd: FormData) {
  const ctx = await requireLab("MEMBER", "samples", "edit");
  await prisma.sample.create({
    data: {
      labId: ctx.labId,
      code: s(fd, "code"),
      name: s(fd, "name"),
      type: s(fd, "type") || "기타",
      source: s(fd, "source"),
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      ownerId: await assertLabUser(ctx.labId, sid(fd, "owner_id")),
      storageLocation: s(fd, "storage_location"),
      receivedDate: s(fd, "received_date") || today(),
      status: s(fd, "status") || "보관",
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/lims/samples");
}

export async function setSampleStatus(fd: FormData) {
  const ctx = await requireLab("MEMBER", "samples", "edit");
  await prisma.sample.updateMany({
    where: { id: n(fd, "id"), labId: ctx.labId },
    data: { status: s(fd, "status") },
  });
  revalidatePath("/lims/samples");
}

export async function deleteSample(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "samples", "edit");
  await prisma.sample.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/lims/samples");
}

export async function createExperiment(fd: FormData) {
  const ctx = await requireLab("MEMBER", "experiments", "edit");
  const sampleId = nid(fd, "sample_id");
  const validSample = sampleId
    ? await prisma.sample.findFirst({ where: { id: sampleId, labId: ctx.labId } })
    : null;
  await prisma.experiment.create({
    data: {
      labId: ctx.labId,
      code: s(fd, "code"),
      title: s(fd, "title"),
      projectId: await assertLabProject(ctx.labId, n(fd, "project_id")).then((v) => v ?? null),
      sampleId: validSample?.id ?? null,
      assigneeId: await assertLabUser(ctx.labId, sid(fd, "assignee_id")),
      protocol: s(fd, "protocol"),
      startDate: s(fd, "start_date") || today(),
      status: s(fd, "status") || "계획",
      resultSummary: s(fd, "result_summary"),
    },
  });
  revalidatePath("/lims/experiments");
}

export async function setExperimentStatus(fd: FormData) {
  const ctx = await requireLab("MEMBER", "experiments", "edit");
  const id = n(fd, "id");
  const status = s(fd, "status");
  const exp = await prisma.experiment.findFirst({ where: { id, labId: ctx.labId } });
  if (!exp) return;
  await prisma.experiment.update({
    where: { id },
    data: { status, endDate: status === "완료" ? (exp.endDate ?? today()) : exp.endDate },
  });
  revalidatePath("/lims/experiments");
}

export async function deleteExperiment(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "experiments", "edit");
  await prisma.experiment.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/lims/experiments");
}

export async function createInstrument(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "instruments", "edit");
  await prisma.instrument.create({
    data: {
      labId: ctx.labId,
      name: s(fd, "name"),
      model: s(fd, "model"),
      serialNo: s(fd, "serial_no"),
      managerId: await assertLabUser(ctx.labId, sid(fd, "manager_id")),
      location: s(fd, "location"),
      purchaseDate: s(fd, "purchase_date") || null,
      lastCheckDate: s(fd, "last_check_date") || null,
      nextCheckDate: s(fd, "next_check_date") || null,
      status: s(fd, "status") || "정상",
      memo: s(fd, "memo"),
    },
  });
  revalidatePath("/lims/instruments");
}

export async function setInstrumentStatus(fd: FormData) {
  const ctx = await requireLab("MEMBER", "instruments", "edit");
  await prisma.instrument.updateMany({
    where: { id: n(fd, "id"), labId: ctx.labId },
    data: { status: s(fd, "status") },
  });
  revalidatePath("/lims/instruments");
}

export async function markInstrumentChecked(fd: FormData) {
  const ctx = await requireLab("MEMBER", "instruments", "edit");
  const next = new Date();
  next.setMonth(next.getMonth() + 6);
  await prisma.instrument.updateMany({
    where: { id: n(fd, "id"), labId: ctx.labId },
    data: {
      lastCheckDate: today(),
      nextCheckDate: next.toISOString().slice(0, 10),
      status: "정상",
    },
  });
  revalidatePath("/lims/instruments");
}

export async function deleteInstrument(fd: FormData) {
  const ctx = await requireLab("LAB_MANAGER", "instruments", "edit");
  await prisma.instrument.deleteMany({ where: { id: n(fd, "id"), labId: ctx.labId } });
  revalidatePath("/lims/instruments");
}
