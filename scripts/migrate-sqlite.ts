/**
 * v0.1 SQLite(data/labi.db) → Postgres(Prisma) 1회성 마이그레이션.
 * 모든 데이터는 지정한 랩으로 귀속된다. 사용법: npx tsx scripts/migrate-sqlite.ts <labId>
 */
import Database from "better-sqlite3";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const numv = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function main() {
  const labId = Number(process.argv[2] ?? 1);
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) throw new Error(`랩 ${labId}이 없습니다`);

  const db = new Database(path.join(process.cwd(), "data", "labi.db"), { readonly: true });
  const all = (sql: string): Row[] => db.prepare(sql).all() as Row[];

  // 1) members → users(+membership). 이메일 기준 매칭, 없으면 비밀번호 없는 계정 생성.
  const oldMembers = all("SELECT * FROM members");
  const userIdByOldId = new Map<number, string>();
  for (const m of oldMembers) {
    const email = (str(m.email) || `${str(m.name)}@placeholder.local`).toLowerCase();
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: str(m.name),
          position: str(m.position) || "연구원",
          phone: str(m.phone),
          hireDate: str(m.hire_date),
          workStatus: str(m.status) || "재직",
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          position: str(m.position) || user.position,
          phone: str(m.phone) || user.phone,
          hireDate: str(m.hire_date) || user.hireDate,
          workStatus: str(m.status) || user.workStatus,
        },
      });
    }
    await prisma.membership.upsert({
      where: { userId_labId: { userId: user.id, labId } },
      create: { userId: user.id, labId, role: "MEMBER" },
      update: {},
    });
    userIdByOldId.set(numv(m.id), user.id);
  }
  console.log(`인원: ${oldMembers.length}건 → users/memberships`);

  // 2) projects
  const projIdByOldId = new Map<number, number>();
  for (const p of all("SELECT * FROM projects")) {
    const created = await prisma.project.upsert({
      where: { labId_code: { labId, code: str(p.code) } },
      create: {
        labId,
        code: str(p.code),
        title: str(p.title),
        sponsor: str(p.sponsor),
        program: str(p.program),
        piId: p.pi_id ? (userIdByOldId.get(numv(p.pi_id)) ?? null) : null,
        startDate: str(p.start_date),
        endDate: str(p.end_date),
        totalBudget: numv(p.total_budget),
        status: str(p.status) || "진행",
        memo: str(p.memo),
      },
      update: {},
    });
    projIdByOldId.set(numv(p.id), created.id);
  }
  console.log(`과제: ${projIdByOldId.size}건`);

  // 3) project_members / milestones / budget_items
  let c = 0;
  for (const pm of all("SELECT * FROM project_members")) {
    const pid = projIdByOldId.get(numv(pm.project_id));
    const uid = userIdByOldId.get(numv(pm.member_id));
    if (!pid || !uid) continue;
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: pid, userId: uid } },
      create: { projectId: pid, userId: uid, role: str(pm.role) || "참여연구원", effortPct: numv(pm.effort_pct) },
      update: {},
    });
    c++;
  }
  console.log(`참여연구원: ${c}건`);

  c = 0;
  for (const ms of all("SELECT * FROM milestones")) {
    const pid = projIdByOldId.get(numv(ms.project_id));
    if (!pid) continue;
    await prisma.milestone.create({
      data: { projectId: pid, title: str(ms.title), dueDate: str(ms.due_date), status: str(ms.status) || "예정", memo: str(ms.memo) },
    });
    c++;
  }
  console.log(`마일스톤: ${c}건`);

  c = 0;
  for (const b of all("SELECT * FROM budget_items")) {
    const pid = projIdByOldId.get(numv(b.project_id));
    if (!pid) continue;
    await prisma.budgetItem.create({
      data: { projectId: pid, category: str(b.category) || "기타", item: str(b.item), amount: numv(b.amount), spentDate: str(b.spent_date), memo: str(b.memo) },
    });
    c++;
  }
  console.log(`예산집행: ${c}건`);

  // 4) samples / experiments / instruments / leaves
  const sampleIdByOldId = new Map<number, number>();
  for (const sm of all("SELECT * FROM samples")) {
    const created = await prisma.sample.upsert({
      where: { labId_code: { labId, code: str(sm.code) } },
      create: {
        labId,
        code: str(sm.code),
        name: str(sm.name),
        type: str(sm.type) || "기타",
        source: str(sm.source),
        projectId: sm.project_id ? (projIdByOldId.get(numv(sm.project_id)) ?? null) : null,
        ownerId: sm.owner_id ? (userIdByOldId.get(numv(sm.owner_id)) ?? null) : null,
        storageLocation: str(sm.storage_location),
        receivedDate: str(sm.received_date),
        status: str(sm.status) || "보관",
        memo: str(sm.memo),
      },
      update: {},
    });
    sampleIdByOldId.set(numv(sm.id), created.id);
  }
  console.log(`시료: ${sampleIdByOldId.size}건`);

  c = 0;
  for (const e of all("SELECT * FROM experiments")) {
    await prisma.experiment.upsert({
      where: { labId_code: { labId, code: str(e.code) } },
      create: {
        labId,
        code: str(e.code),
        title: str(e.title),
        projectId: e.project_id ? (projIdByOldId.get(numv(e.project_id)) ?? null) : null,
        sampleId: e.sample_id ? (sampleIdByOldId.get(numv(e.sample_id)) ?? null) : null,
        assigneeId: e.assignee_id ? (userIdByOldId.get(numv(e.assignee_id)) ?? null) : null,
        protocol: str(e.protocol),
        startDate: str(e.start_date),
        endDate: e.end_date ? str(e.end_date) : null,
        status: str(e.status) || "계획",
        resultSummary: str(e.result_summary),
      },
      update: {},
    });
    c++;
  }
  console.log(`실험: ${c}건`);

  c = 0;
  for (const it of all("SELECT * FROM instruments")) {
    await prisma.instrument.create({
      data: {
        labId,
        name: str(it.name),
        model: str(it.model),
        serialNo: str(it.serial_no),
        managerId: it.manager_id ? (userIdByOldId.get(numv(it.manager_id)) ?? null) : null,
        location: str(it.location),
        purchaseDate: it.purchase_date ? str(it.purchase_date) : null,
        lastCheckDate: it.last_check_date ? str(it.last_check_date) : null,
        nextCheckDate: it.next_check_date ? str(it.next_check_date) : null,
        status: str(it.status) || "정상",
        memo: str(it.memo),
      },
    });
    c++;
  }
  console.log(`장비: ${c}건`);

  c = 0;
  for (const l of all("SELECT * FROM leaves")) {
    const uid = userIdByOldId.get(numv(l.member_id));
    if (!uid) continue;
    await prisma.leave.create({
      data: {
        labId,
        userId: uid,
        type: str(l.type) || "연차",
        startDate: str(l.start_date),
        endDate: str(l.end_date),
        days: numv(l.days) || 1,
        reason: str(l.reason),
        status: str(l.status) || "신청",
      },
    });
    c++;
  }
  console.log(`휴가: ${c}건`);

  console.log("✅ 마이그레이션 완료");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
