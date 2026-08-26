import { getDb } from "@/db";

export type Member = {
  id: number; name: string; position: string; department: string;
  email: string; phone: string; hire_date: string; status: string;
  total_effort: number;
};

export function listMembers(): Member[] {
  return getDb()
    .prepare(
      `SELECT m.*, COALESCE((
         SELECT SUM(pm.effort_pct) FROM project_members pm
         JOIN projects p ON p.id = pm.project_id AND p.status = '진행'
         WHERE pm.member_id = m.id
       ), 0) AS total_effort
       FROM members m ORDER BY m.status = '재직' DESC, m.hire_date`
    )
    .all() as Member[];
}

export type Leave = {
  id: number; member_id: number; member_name: string; type: string;
  start_date: string; end_date: string; days: number; reason: string; status: string;
};

export function listLeaves(): Leave[] {
  return getDb()
    .prepare(
      `SELECT l.*, m.name AS member_name FROM leaves l
       JOIN members m ON m.id = l.member_id
       ORDER BY l.start_date DESC LIMIT 100`
    )
    .all() as Leave[];
}

export type Project = {
  id: number; code: string; title: string; sponsor: string; program: string;
  pi_id: number | null; pi_name: string | null; start_date: string; end_date: string;
  total_budget: number; status: string; memo: string;
  spent: number; member_count: number;
};

export function listProjects(): Project[] {
  return getDb()
    .prepare(
      `SELECT p.*, m.name AS pi_name,
        COALESCE((SELECT SUM(b.amount) FROM budget_items b WHERE b.project_id = p.id), 0) AS spent,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count
       FROM projects p LEFT JOIN members m ON m.id = p.pi_id
       ORDER BY p.status = '진행' DESC, p.end_date`
    )
    .all() as Project[];
}

export function getProject(id: number): Project | undefined {
  return getDb()
    .prepare(
      `SELECT p.*, m.name AS pi_name,
        COALESCE((SELECT SUM(b.amount) FROM budget_items b WHERE b.project_id = p.id), 0) AS spent,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count
       FROM projects p LEFT JOIN members m ON m.id = p.pi_id WHERE p.id = ?`
    )
    .get(id) as Project | undefined;
}

export type ProjectMember = {
  id: number; project_id: number; member_id: number; member_name: string;
  position: string; role: string; effort_pct: number;
};

export function listProjectMembers(projectId: number): ProjectMember[] {
  return getDb()
    .prepare(
      `SELECT pm.*, m.name AS member_name, m.position FROM project_members pm
       JOIN members m ON m.id = pm.member_id WHERE pm.project_id = ?
       ORDER BY pm.role = '연구책임자' DESC, m.name`
    )
    .all(projectId) as ProjectMember[];
}

export type Milestone = {
  id: number; project_id: number; title: string; due_date: string; status: string; memo: string;
  project_code?: string; project_title?: string;
};

export function listMilestones(projectId: number): Milestone[] {
  return getDb()
    .prepare("SELECT * FROM milestones WHERE project_id = ? ORDER BY due_date")
    .all(projectId) as Milestone[];
}

export function upcomingMilestones(limit = 6): Milestone[] {
  return getDb()
    .prepare(
      `SELECT ms.*, p.code AS project_code, p.title AS project_title
       FROM milestones ms JOIN projects p ON p.id = ms.project_id
       WHERE ms.status != '완료' ORDER BY ms.due_date LIMIT ?`
    )
    .all(limit) as Milestone[];
}

export type BudgetItem = {
  id: number; project_id: number; category: string; item: string;
  amount: number; spent_date: string; memo: string;
};

export function listBudgetItems(projectId: number): BudgetItem[] {
  return getDb()
    .prepare("SELECT * FROM budget_items WHERE project_id = ? ORDER BY spent_date DESC")
    .all(projectId) as BudgetItem[];
}

export type Sample = {
  id: number; code: string; name: string; type: string; source: string;
  project_id: number | null; project_code: string | null;
  owner_id: number | null; owner_name: string | null;
  storage_location: string; received_date: string; status: string; memo: string;
};

export function listSamples(): Sample[] {
  return getDb()
    .prepare(
      `SELECT s.*, p.code AS project_code, m.name AS owner_name
       FROM samples s
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN members m ON m.id = s.owner_id
       ORDER BY s.received_date DESC, s.id DESC`
    )
    .all() as Sample[];
}

export type Experiment = {
  id: number; code: string; title: string;
  project_id: number | null; project_code: string | null;
  sample_id: number | null; sample_code: string | null;
  assignee_id: number | null; assignee_name: string | null;
  protocol: string; start_date: string; end_date: string | null;
  status: string; result_summary: string;
};

export function listExperiments(): Experiment[] {
  return getDb()
    .prepare(
      `SELECT e.*, p.code AS project_code, s.code AS sample_code, m.name AS assignee_name
       FROM experiments e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN samples s ON s.id = e.sample_id
       LEFT JOIN members m ON m.id = e.assignee_id
       ORDER BY e.start_date DESC, e.id DESC`
    )
    .all() as Experiment[];
}

export type Instrument = {
  id: number; name: string; model: string; serial_no: string;
  manager_id: number | null; manager_name: string | null; location: string;
  purchase_date: string | null; last_check_date: string | null;
  next_check_date: string | null; status: string; memo: string;
};

export function listInstruments(): Instrument[] {
  return getDb()
    .prepare(
      `SELECT i.*, m.name AS manager_name FROM instruments i
       LEFT JOIN members m ON m.id = i.manager_id
       ORDER BY i.name`
    )
    .all() as Instrument[];
}

export function dashboardStats() {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    activeProjects: one("SELECT COUNT(*) AS n FROM projects WHERE status='진행'"),
    totalBudget: one("SELECT COALESCE(SUM(total_budget),0) AS n FROM projects WHERE status='진행'"),
    totalSpent: one(
      "SELECT COALESCE(SUM(b.amount),0) AS n FROM budget_items b JOIN projects p ON p.id=b.project_id WHERE p.status='진행'"
    ),
    members: one("SELECT COUNT(*) AS n FROM members WHERE status='재직'"),
    samples: one("SELECT COUNT(*) AS n FROM samples WHERE status IN ('보관','사용중')"),
    runningExperiments: one("SELECT COUNT(*) AS n FROM experiments WHERE status='진행'"),
    instrumentsNeedCheck: one(
      "SELECT COUNT(*) AS n FROM instruments WHERE status != '폐기' AND (status='고장' OR status='점검중' OR (next_check_date IS NOT NULL AND next_check_date <= date('now')))"
    ),
    pendingLeaves: one("SELECT COUNT(*) AS n FROM leaves WHERE status='신청'"),
  };
}

export function recentExperiments(limit = 5): Experiment[] {
  return getDb()
    .prepare(
      `SELECT e.*, p.code AS project_code, s.code AS sample_code, m.name AS assignee_name
       FROM experiments e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN samples s ON s.id = e.sample_id
       LEFT JOIN members m ON m.id = e.assignee_id
       ORDER BY e.id DESC LIMIT ?`
    )
    .all(limit) as Experiment[];
}
