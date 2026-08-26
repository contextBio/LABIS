"use server";

import { getDb } from "@/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function s(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function n(fd: FormData, key: string): number {
  const v = Number(fd.get(key) ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function nullableId(fd: FormData, key: string): number | null {
  const v = s(fd, key);
  return v ? Number(v) : null;
}

// ---------- 인사관리 ----------

export async function createMember(fd: FormData) {
  getDb()
    .prepare(
      "INSERT INTO members (name, position, department, email, phone, hire_date, status) VALUES (?,?,?,?,?,?,?)"
    )
    .run(
      s(fd, "name"), s(fd, "position") || "연구원", s(fd, "department"),
      s(fd, "email"), s(fd, "phone"), s(fd, "hire_date") || new Date().toISOString().slice(0, 10),
      s(fd, "status") || "재직"
    );
  revalidatePath("/hr");
}

export async function updateMemberStatus(fd: FormData) {
  getDb().prepare("UPDATE members SET status=? WHERE id=?").run(s(fd, "status"), n(fd, "id"));
  revalidatePath("/hr");
}

export async function deleteMember(fd: FormData) {
  getDb().prepare("DELETE FROM members WHERE id=?").run(n(fd, "id"));
  revalidatePath("/hr");
}

export async function createLeave(fd: FormData) {
  getDb()
    .prepare(
      "INSERT INTO leaves (member_id, type, start_date, end_date, days, reason, status) VALUES (?,?,?,?,?,?,?)"
    )
    .run(
      n(fd, "member_id"), s(fd, "type") || "연차", s(fd, "start_date"),
      s(fd, "end_date") || s(fd, "start_date"), n(fd, "days") || 1, s(fd, "reason"), "신청"
    );
  revalidatePath("/hr");
}

export async function setLeaveStatus(fd: FormData) {
  getDb().prepare("UPDATE leaves SET status=? WHERE id=?").run(s(fd, "status"), n(fd, "id"));
  revalidatePath("/hr");
}

// ---------- 과제관리 ----------

export async function createProject(fd: FormData) {
  const info = getDb()
    .prepare(
      "INSERT INTO projects (code, title, sponsor, program, pi_id, start_date, end_date, total_budget, status, memo) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      s(fd, "code"), s(fd, "title"), s(fd, "sponsor"), s(fd, "program"),
      nullableId(fd, "pi_id"), s(fd, "start_date"), s(fd, "end_date"),
      n(fd, "total_budget"), s(fd, "status") || "진행", s(fd, "memo")
    );
  revalidatePath("/projects");
  redirect(`/projects/${info.lastInsertRowid}`);
}

export async function updateProjectStatus(fd: FormData) {
  getDb().prepare("UPDATE projects SET status=? WHERE id=?").run(s(fd, "status"), n(fd, "id"));
  revalidatePath("/projects");
  revalidatePath(`/projects/${n(fd, "id")}`);
}

export async function deleteProject(fd: FormData) {
  getDb().prepare("DELETE FROM projects WHERE id=?").run(n(fd, "id"));
  revalidatePath("/projects");
  redirect("/projects");
}

export async function addProjectMember(fd: FormData) {
  const pid = n(fd, "project_id");
  getDb()
    .prepare(
      "INSERT INTO project_members (project_id, member_id, role, effort_pct) VALUES (?,?,?,?) ON CONFLICT(project_id, member_id) DO UPDATE SET role=excluded.role, effort_pct=excluded.effort_pct"
    )
    .run(pid, n(fd, "member_id"), s(fd, "role") || "참여연구원", n(fd, "effort_pct"));
  revalidatePath(`/projects/${pid}`);
}

export async function removeProjectMember(fd: FormData) {
  getDb().prepare("DELETE FROM project_members WHERE id=?").run(n(fd, "id"));
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

export async function addMilestone(fd: FormData) {
  const pid = n(fd, "project_id");
  getDb()
    .prepare("INSERT INTO milestones (project_id, title, due_date, status, memo) VALUES (?,?,?,?,?)")
    .run(pid, s(fd, "title"), s(fd, "due_date"), s(fd, "status") || "예정", s(fd, "memo"));
  revalidatePath(`/projects/${pid}`);
}

export async function setMilestoneStatus(fd: FormData) {
  getDb().prepare("UPDATE milestones SET status=? WHERE id=?").run(s(fd, "status"), n(fd, "id"));
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

export async function deleteMilestone(fd: FormData) {
  getDb().prepare("DELETE FROM milestones WHERE id=?").run(n(fd, "id"));
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

export async function addBudgetItem(fd: FormData) {
  const pid = n(fd, "project_id");
  getDb()
    .prepare(
      "INSERT INTO budget_items (project_id, category, item, amount, spent_date, memo) VALUES (?,?,?,?,?,?)"
    )
    .run(
      pid, s(fd, "category") || "기타", s(fd, "item"), n(fd, "amount"),
      s(fd, "spent_date") || new Date().toISOString().slice(0, 10), s(fd, "memo")
    );
  revalidatePath(`/projects/${pid}`);
}

export async function deleteBudgetItem(fd: FormData) {
  getDb().prepare("DELETE FROM budget_items WHERE id=?").run(n(fd, "id"));
  revalidatePath(`/projects/${n(fd, "project_id")}`);
}

// ---------- LIMS ----------

export async function createSample(fd: FormData) {
  getDb()
    .prepare(
      "INSERT INTO samples (code, name, type, source, project_id, owner_id, storage_location, received_date, status, memo) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      s(fd, "code"), s(fd, "name"), s(fd, "type") || "기타", s(fd, "source"),
      nullableId(fd, "project_id"), nullableId(fd, "owner_id"), s(fd, "storage_location"),
      s(fd, "received_date") || new Date().toISOString().slice(0, 10),
      s(fd, "status") || "보관", s(fd, "memo")
    );
  revalidatePath("/lims/samples");
}

export async function setSampleStatus(fd: FormData) {
  getDb().prepare("UPDATE samples SET status=? WHERE id=?").run(s(fd, "status"), n(fd, "id"));
  revalidatePath("/lims/samples");
}

export async function deleteSample(fd: FormData) {
  getDb().prepare("DELETE FROM samples WHERE id=?").run(n(fd, "id"));
  revalidatePath("/lims/samples");
}

export async function createExperiment(fd: FormData) {
  getDb()
    .prepare(
      "INSERT INTO experiments (code, title, project_id, sample_id, assignee_id, protocol, start_date, status, result_summary) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(
      s(fd, "code"), s(fd, "title"), nullableId(fd, "project_id"), nullableId(fd, "sample_id"),
      nullableId(fd, "assignee_id"), s(fd, "protocol"),
      s(fd, "start_date") || new Date().toISOString().slice(0, 10),
      s(fd, "status") || "계획", s(fd, "result_summary")
    );
  revalidatePath("/lims/experiments");
}

export async function setExperimentStatus(fd: FormData) {
  const status = s(fd, "status");
  const db = getDb();
  if (status === "완료") {
    db.prepare("UPDATE experiments SET status=?, end_date=COALESCE(end_date, date('now')) WHERE id=?")
      .run(status, n(fd, "id"));
  } else {
    db.prepare("UPDATE experiments SET status=? WHERE id=?").run(status, n(fd, "id"));
  }
  revalidatePath("/lims/experiments");
}

export async function deleteExperiment(fd: FormData) {
  getDb().prepare("DELETE FROM experiments WHERE id=?").run(n(fd, "id"));
  revalidatePath("/lims/experiments");
}

export async function createInstrument(fd: FormData) {
  getDb()
    .prepare(
      "INSERT INTO instruments (name, model, serial_no, manager_id, location, purchase_date, last_check_date, next_check_date, status, memo) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(
      s(fd, "name"), s(fd, "model"), s(fd, "serial_no"), nullableId(fd, "manager_id"),
      s(fd, "location"), s(fd, "purchase_date") || null, s(fd, "last_check_date") || null,
      s(fd, "next_check_date") || null, s(fd, "status") || "정상", s(fd, "memo")
    );
  revalidatePath("/lims/instruments");
}

export async function setInstrumentStatus(fd: FormData) {
  getDb().prepare("UPDATE instruments SET status=? WHERE id=?").run(s(fd, "status"), n(fd, "id"));
  revalidatePath("/lims/instruments");
}

export async function markInstrumentChecked(fd: FormData) {
  getDb()
    .prepare(
      "UPDATE instruments SET last_check_date=date('now'), next_check_date=date('now','+6 months'), status='정상' WHERE id=?"
    )
    .run(n(fd, "id"));
  revalidatePath("/lims/instruments");
}

export async function deleteInstrument(fd: FormData) {
  getDb().prepare("DELETE FROM instruments WHERE id=?").run(n(fd, "id"));
  revalidatePath("/lims/instruments");
}
