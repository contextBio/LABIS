import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "labi.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '연구원',
  department TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  hire_date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT '재직',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT '연차',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '신청',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sponsor TEXT NOT NULL DEFAULT '',
  program TEXT NOT NULL DEFAULT '',
  pi_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT NOT NULL DEFAULT (date('now')),
  total_budget INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '진행',
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '참여연구원',
  effort_pct INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, member_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '예정',
  memo TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT '기타',
  item TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  spent_date TEXT NOT NULL DEFAULT (date('now')),
  memo TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '기타',
  source TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  storage_location TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT '보관',
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  sample_id INTEGER REFERENCES samples(id) ON DELETE SET NULL,
  assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  protocol TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,
  status TEXT NOT NULL DEFAULT '계획',
  result_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  serial_no TEXT NOT NULL DEFAULT '',
  manager_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  location TEXT NOT NULL DEFAULT '',
  purchase_date TEXT,
  last_check_date TEXT,
  next_check_date TEXT,
  status TEXT NOT NULL DEFAULT '정상',
  memo TEXT NOT NULL DEFAULT ''
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __labiDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!global.__labiDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    global.__labiDb = db;
  }
  return global.__labiDb;
}
