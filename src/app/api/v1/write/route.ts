/** SPA 프론트: 등록·수정·삭제 — POST /api/v1/write?lab=N  {op, data}
 *
 * 화면 쪽 서버 액션(actions.ts)과 **같은 검증·권한·감사 규칙**의 API 판이다.
 * 로그인(Bearer, apiUser) + 랩 소속(apiLab)은 전제이고, op 마다 최소 역할이 걸린다
 * (1=팀원, 2=운영자(랩매니저), 3=연구책임자; 학과관리자는 전부 통과).
 * 외부 id 주입은 assertLabUser/assertLabProject 로 막는다 — actions.ts 와 동일.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  apiUser, apiLab, apiRank, apiMenuAllowed, menuForbidden, withCors, corsPreflight, type ApiUser,
} from "@/lib/apiGuard";
import type { MenuKey } from "@/lib/menus";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/guard";

/** op 이름 앞머리 → 메뉴. 팀관리자가 읽기 전용으로 잠근 메뉴는 쓰기가 막힌다. */
const OP_MENU: Array<[string, MenuKey]> = [
  ["profile_", "hr"], ["leave_", "hr"],
  ["project_", "projects"], ["milestone_", "projects"], ["budget_", "projects"],
  ["research_", "research"],
  ["publication_", "outcomes"], ["patent_", "outcomes"], ["techtransfer_", "outcomes"],
  ["purchase_", "purchases"], ["fundincome_", "finance"],
  ["sample_", "samples"], ["experiment_", "experiments"], ["instrument_", "instruments"],
];
function opMenu(op: string): MenuKey | null {
  const hit = OP_MENU.find(([prefix]) => op.startsWith(prefix));
  return hit ? hit[1] : null;
}

type D = Record<string, unknown>;
const s = (d: D, k: string) => String(d[k] ?? "").trim();
const n = (d: D, k: string) => { const v = Number(d[k] ?? 0); return Number.isFinite(v) ? v : 0; };
const nidOf = (d: D, k: string) => { const v = s(d, k); return v ? Number(v) : null; };
const sidOf = (d: D, k: string) => s(d, k) || null;
const today = () => new Date().toISOString().slice(0, 10);

async function assertLabUser(labId: number, userId: string | null) {
  if (!userId) return null;
  const m = await prisma.membership.findFirst({ where: { labId, userId } });
  return m ? userId : null;
}
async function assertLabProject(labId: number, projectId: number | null) {
  if (!projectId) return null;
  const p = await prisma.project.findFirst({ where: { id: projectId, labId } });
  return p ? p.id : null;
}

type Ctx = { labId: number; user: ApiUser; rank: number };
type Op = { min: number; run: (ctx: Ctx, d: D) => Promise<unknown> };

const OPS: Record<string, Op> = {
  /* ── 인사 ── */
  profile_update: { min: 2, run: async (c, d) => {
    const userId = s(d, "user_id");
    if (!(await assertLabUser(c.labId, userId))) throw new Error("invalid_user");
    await prisma.user.update({ where: { id: userId }, data: {
      position: s(d, "position") || "연구원", phone: s(d, "phone"),
      hireDate: s(d, "hire_date"), workStatus: s(d, "work_status") || "재직",
    } });
    await audit(c.user.id, c.labId, "hr.profile_update", "user", userId);
  } },
  leave_create: { min: 1, run: async (c, d) => {
    let userId = s(d, "user_id") || c.user.id;
    if (c.rank <= 1) userId = c.user.id;      // 팀원은 본인 휴가만
    if (!(await assertLabUser(c.labId, userId))) throw new Error("invalid_user");
    await prisma.leave.create({ data: {
      labId: c.labId, userId, type: s(d, "type") || "연차",
      startDate: s(d, "start_date"), endDate: s(d, "end_date") || s(d, "start_date"),
      days: n(d, "days") || 1, reason: s(d, "reason"),
    } });
  } },
  leave_status: { min: 2, run: async (c, d) => {
    const id = n(d, "id");
    await prisma.leave.updateMany({ where: { id, labId: c.labId }, data: { status: s(d, "status") } });
    await audit(c.user.id, c.labId, "hr.leave_status", "leave", id, { status: s(d, "status") });
  } },

  /* ── 과제 ── */
  project_create: { min: 2, run: async (c, d) => {
    const piId = await assertLabUser(c.labId, sidOf(d, "pi_id"));
    const p = await prisma.project.create({ data: {
      labId: c.labId, code: s(d, "code"), title: s(d, "title"),
      sponsor: s(d, "sponsor"), program: s(d, "program"), piId,
      startDate: s(d, "start_date"), endDate: s(d, "end_date"),
      totalBudget: n(d, "total_budget"), status: s(d, "status") || "진행",
      memo: s(d, "memo"),
    } });
    await audit(c.user.id, c.labId, "project.create", "project", p.id, { code: p.code });
    return { id: p.id };
  } },
  project_status: { min: 2, run: async (c, d) => {
    const id = n(d, "id");
    await prisma.project.updateMany({ where: { id, labId: c.labId }, data: { status: s(d, "status") } });
    await audit(c.user.id, c.labId, "project.status", "project", id, { status: s(d, "status") });
  } },
  project_delete: { min: 3, run: async (c, d) => {
    const id = n(d, "id");
    await prisma.project.deleteMany({ where: { id, labId: c.labId } });
    await audit(c.user.id, c.labId, "project.delete", "project", id);
  } },
  project_member_add: { min: 2, run: async (c, d) => {
    const projectId = await assertLabProject(c.labId, n(d, "project_id"));
    const userId = await assertLabUser(c.labId, sidOf(d, "user_id"));
    if (!projectId || !userId) throw new Error("invalid_ref");
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role: s(d, "role") || "참여연구원", effortPct: n(d, "effort_pct") },
      update: { role: s(d, "role") || "참여연구원", effortPct: n(d, "effort_pct") },
    });
  } },
  project_member_remove: { min: 2, run: async (c, d) => {
    await prisma.projectMember.deleteMany({ where: { id: n(d, "id"), project: { labId: c.labId } } });
  } },
  milestone_add: { min: 2, run: async (c, d) => {
    const projectId = await assertLabProject(c.labId, n(d, "project_id"));
    if (!projectId) throw new Error("invalid_ref");
    await prisma.milestone.create({ data: {
      projectId, title: s(d, "title"), dueDate: s(d, "due_date"),
      status: s(d, "status") || "예정", memo: s(d, "memo"),
    } });
  } },
  milestone_status: { min: 2, run: async (c, d) => {
    await prisma.milestone.updateMany({
      where: { id: n(d, "id"), project: { labId: c.labId } }, data: { status: s(d, "status") } });
  } },
  milestone_delete: { min: 2, run: async (c, d) => {
    await prisma.milestone.deleteMany({ where: { id: n(d, "id"), project: { labId: c.labId } } });
  } },
  budget_add: { min: 2, run: async (c, d) => {
    const projectId = await assertLabProject(c.labId, n(d, "project_id"));
    if (!projectId) throw new Error("invalid_ref");
    const item = await prisma.budgetItem.create({ data: {
      projectId, category: s(d, "category") || "기타", item: s(d, "item"),
      amount: n(d, "amount"), spentDate: s(d, "spent_date") || today(), memo: s(d, "memo"),
    } });
    await audit(c.user.id, c.labId, "budget.add", "budget_item", item.id, { amount: item.amount });
  } },
  budget_delete: { min: 2, run: async (c, d) => {
    const id = n(d, "id");
    await prisma.budgetItem.deleteMany({ where: { id, project: { labId: c.labId } } });
    await audit(c.user.id, c.labId, "budget.delete", "budget_item", id);
  } },

  /* ── 연구 프로젝트 (수주 과제와 별개) ── */
  research_create: { min: 2, run: async (c, d) => {
    const r = await prisma.researchProject.create({ data: {
      labId: c.labId, code: s(d, "code"), title: s(d, "title"), goal: s(d, "goal"),
      leaderId: await assertLabUser(c.labId, sidOf(d, "leader_id")),
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      startDate: s(d, "start_date"), endDate: s(d, "end_date"),
      status: s(d, "status") || "진행", memo: s(d, "memo"),
    } });
    await audit(c.user.id, c.labId, "research.create", "research_project", r.id, { code: r.code });
    return { id: r.id };
  } },
  research_status: { min: 1, run: async (c, d) => {
    await prisma.researchProject.updateMany({
      where: { id: n(d, "id"), labId: c.labId }, data: { status: s(d, "status") } });
  } },
  research_delete: { min: 2, run: async (c, d) => {
    const id = n(d, "id");
    await prisma.researchProject.deleteMany({ where: { id, labId: c.labId } });
    await audit(c.user.id, c.labId, "research.delete", "research_project", id);
  } },

  /* ── 성과 ── */
  publication_create: { min: 1, run: async (c, d) => {
    await prisma.publication.create({ data: {
      labId: c.labId, title: s(d, "title"), journal: s(d, "journal"),
      year: s(d, "year"), authors: s(d, "authors"), doi: s(d, "doi"),
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      memo: s(d, "memo"),
    } });
  } },
  publication_delete: { min: 2, run: async (c, d) => {
    await prisma.publication.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },
  patent_create: { min: 1, run: async (c, d) => {
    await prisma.patent.create({ data: {
      labId: c.labId, title: s(d, "title"), applicationNo: s(d, "application_no"),
      registrationNo: s(d, "registration_no"), status: s(d, "status") || "출원",
      date: s(d, "date"), inventors: s(d, "inventors"),
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      memo: s(d, "memo"),
    } });
  } },
  patent_status: { min: 1, run: async (c, d) => {
    await prisma.patent.updateMany({ where: { id: n(d, "id"), labId: c.labId }, data: { status: s(d, "status") } });
  } },
  patent_delete: { min: 2, run: async (c, d) => {
    await prisma.patent.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },
  techtransfer_create: { min: 2, run: async (c, d) => {
    await prisma.techTransfer.create({ data: {
      labId: c.labId, title: s(d, "title"), licensee: s(d, "licensee"),
      contractDate: s(d, "contract_date"), amount: n(d, "amount"),
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      memo: s(d, "memo"),
    } });
  } },
  techtransfer_delete: { min: 2, run: async (c, d) => {
    await prisma.techTransfer.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },

  /* ── 구매 ── */
  purchase_create: { min: 1, run: async (c, d) => {
    await prisma.purchase.create({ data: {
      labId: c.labId, item: s(d, "item"), vendor: s(d, "vendor"),
      category: s(d, "category") || "재료비", amount: n(d, "amount"),
      orderDate: s(d, "order_date") || today(), status: s(d, "status") || "신청",
      requesterId: (await assertLabUser(c.labId, sidOf(d, "requester_id"))) ?? c.user.id,
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      memo: s(d, "memo"),
    } });
  } },
  purchase_status: { min: 1, run: async (c, d) => {
    await prisma.purchase.updateMany({ where: { id: n(d, "id"), labId: c.labId }, data: { status: s(d, "status") } });
  } },
  purchase_delete: { min: 2, run: async (c, d) => {
    await prisma.purchase.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },

  /* ── 연구비 수입 ── */
  fundincome_create: { min: 2, run: async (c, d) => {
    const income = await prisma.fundIncome.create({ data: {
      labId: c.labId,
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      date: s(d, "date") || today(), amount: n(d, "amount"), note: s(d, "note"),
    } });
    await audit(c.user.id, c.labId, "fund.income_add", "fund_income", income.id, { amount: income.amount });
  } },
  fundincome_delete: { min: 2, run: async (c, d) => {
    const id = n(d, "id");
    await prisma.fundIncome.deleteMany({ where: { id, labId: c.labId } });
    await audit(c.user.id, c.labId, "fund.income_delete", "fund_income", id);
  } },

  /* ── LIMS ── */
  sample_create: { min: 1, run: async (c, d) => {
    await prisma.sample.create({ data: {
      labId: c.labId, code: s(d, "code"), name: s(d, "name"),
      type: s(d, "type") || "기타", source: s(d, "source"),
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      ownerId: await assertLabUser(c.labId, sidOf(d, "owner_id")),
      storageLocation: s(d, "storage_location"),
      receivedDate: s(d, "received_date") || today(),
      status: s(d, "status") || "보관", memo: s(d, "memo"),
    } });
  } },
  sample_status: { min: 1, run: async (c, d) => {
    await prisma.sample.updateMany({ where: { id: n(d, "id"), labId: c.labId }, data: { status: s(d, "status") } });
  } },
  sample_delete: { min: 2, run: async (c, d) => {
    await prisma.sample.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },
  experiment_create: { min: 1, run: async (c, d) => {
    const sampleId = nidOf(d, "sample_id");
    const validSample = sampleId
      ? await prisma.sample.findFirst({ where: { id: sampleId, labId: c.labId } })
      : null;
    await prisma.experiment.create({ data: {
      labId: c.labId, code: s(d, "code"), title: s(d, "title"),
      projectId: await assertLabProject(c.labId, nidOf(d, "project_id")),
      sampleId: validSample?.id ?? null,
      assigneeId: await assertLabUser(c.labId, sidOf(d, "assignee_id")),
      protocol: s(d, "protocol"), startDate: s(d, "start_date") || today(),
      status: s(d, "status") || "계획", resultSummary: s(d, "result_summary"),
    } });
  } },
  experiment_status: { min: 1, run: async (c, d) => {
    const id = n(d, "id"); const status = s(d, "status");
    const exp = await prisma.experiment.findFirst({ where: { id, labId: c.labId } });
    if (!exp) throw new Error("not_found");
    await prisma.experiment.update({ where: { id }, data: {
      status, endDate: status === "완료" ? (exp.endDate ?? today()) : exp.endDate,
    } });
  } },
  experiment_delete: { min: 2, run: async (c, d) => {
    await prisma.experiment.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },
  instrument_create: { min: 2, run: async (c, d) => {
    await prisma.instrument.create({ data: {
      labId: c.labId, name: s(d, "name"), model: s(d, "model"),
      serialNo: s(d, "serial_no"),
      managerId: await assertLabUser(c.labId, sidOf(d, "manager_id")),
      location: s(d, "location"),
      purchaseDate: s(d, "purchase_date") || null,
      lastCheckDate: s(d, "last_check_date") || null,
      nextCheckDate: s(d, "next_check_date") || null,
      status: s(d, "status") || "정상", memo: s(d, "memo"),
    } });
  } },
  instrument_status: { min: 1, run: async (c, d) => {
    await prisma.instrument.updateMany({ where: { id: n(d, "id"), labId: c.labId }, data: { status: s(d, "status") } });
  } },
  instrument_checked: { min: 1, run: async (c, d) => {
    const next = new Date(); next.setMonth(next.getMonth() + 6);
    await prisma.instrument.updateMany({ where: { id: n(d, "id"), labId: c.labId }, data: {
      lastCheckDate: today(), nextCheckDate: next.toISOString().slice(0, 10), status: "정상",
    } });
  } },
  instrument_delete: { min: 2, run: async (c, d) => {
    await prisma.instrument.deleteMany({ where: { id: n(d, "id"), labId: c.labId } });
  } },
};

export async function POST(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;

  const body = (await req.json().catch(() => ({}))) as { op?: string; data?: D };
  const opName = String(body.op ?? "");
  const op = OPS[opName];
  if (!op) return withCors(req, NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 }));

  const rank = apiRank(user, labId);
  if (rank < op.min) {
    return withCors(req, NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }));
  }
  const menu = opMenu(opName);
  if (menu && !(await apiMenuAllowed(user, labId, menu, "edit"))) return menuForbidden(req);
  try {
    const extra = (await op.run({ labId, user, rank }, body.data || {})) || {};
    return withCors(req, NextResponse.json(Object.assign({ ok: true }, extra)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return withCors(req, NextResponse.json({ ok: false, error: msg }, { status: 400 }));
  }
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
