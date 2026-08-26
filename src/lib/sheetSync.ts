import { getDb } from "@/db";
import {
  loadServiceAccount, readTab, readPublicTab, writeTab, getSetting,
} from "./google";

// 시트 탭 구성: 탭명 / 헤더(한국어) / 내보내기 / 가져오기
// 가져오기 방식 — upsert: 키 컬럼 기준 갱신, replace: 탭 내용으로 전체 교체

export const TABS = [
  "인원", "과제", "참여연구원", "마일스톤", "예산집행", "시료", "실험", "장비", "휴가",
] as const;
export type TabName = (typeof TABS)[number];

type Row = Record<string, string>;

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[,원\s%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toObjects(rows: string[][]): Row[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Row = {};
    headers.forEach((h, i) => {
      o[h] = (r[i] ?? "").trim();
    });
    return o;
  });
}

function memberIdByName(name: string): number | null {
  if (!name) return null;
  const row = getDb().prepare("SELECT id FROM members WHERE name=?").get(name) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

function projectIdByCode(code: string): number | null {
  if (!code) return null;
  const row = getDb().prepare("SELECT id FROM projects WHERE code=?").get(code) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

function sampleIdByCode(code: string): number | null {
  if (!code) return null;
  const row = getDb().prepare("SELECT id FROM samples WHERE code=?").get(code) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

type EntitySpec = {
  headers: string[];
  exportRows: () => (string | number | null)[][];
  importRows: (rows: Row[], log: string[]) => void;
};

export const SPECS: Record<TabName, EntitySpec> = {
  인원: {
    headers: ["이름", "직급", "부서", "이메일", "연락처", "입사일", "상태"],
    exportRows: () =>
      (getDb().prepare("SELECT * FROM members ORDER BY id").all() as Record<string, string>[]).map(
        (m) => [m.name, m.position, m.department, m.email, m.phone, m.hire_date, m.status]
      ),
    importRows: (rows, log) => {
      const db = getDb();
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["이름"]) continue;
        const key = r["이메일"]
          ? (db.prepare("SELECT id FROM members WHERE email=?").get(r["이메일"]) as { id: number } | undefined)
          : (db.prepare("SELECT id FROM members WHERE name=?").get(r["이름"]) as { id: number } | undefined);
        if (key) {
          db.prepare(
            "UPDATE members SET name=?, position=?, department=?, email=?, phone=?, hire_date=?, status=? WHERE id=?"
          ).run(
            r["이름"], r["직급"] || "연구원", r["부서"] || "", r["이메일"] || "",
            r["연락처"] || "", r["입사일"] || "", r["상태"] || "재직", key.id
          );
          up++;
        } else {
          db.prepare(
            "INSERT INTO members (name, position, department, email, phone, hire_date, status) VALUES (?,?,?,?,?,?,?)"
          ).run(
            r["이름"], r["직급"] || "연구원", r["부서"] || "", r["이메일"] || "",
            r["연락처"] || "", r["입사일"] || new Date().toISOString().slice(0, 10), r["상태"] || "재직"
          );
          ins++;
        }
      }
      log.push(`인원: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  과제: {
    headers: ["과제번호", "과제명", "발주처", "사업명", "연구책임자", "시작일", "종료일", "총연구비", "상태", "비고"],
    exportRows: () =>
      (getDb()
        .prepare(
          "SELECT p.*, m.name AS pi_name FROM projects p LEFT JOIN members m ON m.id=p.pi_id ORDER BY p.id"
        )
        .all() as Record<string, string | number>[]).map((p) => [
        p.code as string, p.title as string, p.sponsor as string, p.program as string,
        (p.pi_name as string) ?? "", p.start_date as string, p.end_date as string,
        p.total_budget as number, p.status as string, p.memo as string,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      let up = 0, ins = 0;
      const misses: string[] = [];
      for (const r of rows) {
        if (!r["과제번호"]) continue;
        const piId = memberIdByName(r["연구책임자"]);
        if (r["연구책임자"] && piId === null) misses.push(r["연구책임자"]);
        const exists = projectIdByCode(r["과제번호"]);
        if (exists) {
          db.prepare(
            "UPDATE projects SET title=?, sponsor=?, program=?, pi_id=?, start_date=?, end_date=?, total_budget=?, status=?, memo=? WHERE id=?"
          ).run(
            r["과제명"], r["발주처"] || "", r["사업명"] || "", piId,
            r["시작일"] || "", r["종료일"] || "", num(r["총연구비"]),
            r["상태"] || "진행", r["비고"] || "", exists
          );
          up++;
        } else {
          db.prepare(
            "INSERT INTO projects (code, title, sponsor, program, pi_id, start_date, end_date, total_budget, status, memo) VALUES (?,?,?,?,?,?,?,?,?,?)"
          ).run(
            r["과제번호"], r["과제명"] || r["과제번호"], r["발주처"] || "", r["사업명"] || "",
            piId, r["시작일"] || "", r["종료일"] || "", num(r["총연구비"]),
            r["상태"] || "진행", r["비고"] || ""
          );
          ins++;
        }
      }
      log.push(`과제: ${up}건 갱신, ${ins}건 추가`);
      if (misses.length) log.push(`⚠ 명부에 없는 연구책임자: ${[...new Set(misses)].join(", ")}`);
    },
  },

  참여연구원: {
    headers: ["과제번호", "이름", "역할", "참여율"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT p.code, m.name, pm.role, pm.effort_pct FROM project_members pm
           JOIN projects p ON p.id=pm.project_id JOIN members m ON m.id=pm.member_id ORDER BY p.code, m.name`
        )
        .all() as Record<string, string | number>[]).map((r) => [
        r.code as string, r.name as string, r.role as string, r.effort_pct as number,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      db.prepare("DELETE FROM project_members").run();
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const pid = projectIdByCode(r["과제번호"]);
        const mid = memberIdByName(r["이름"]);
        if (!pid || !mid) {
          if (r["과제번호"] || r["이름"]) misses.push(`${r["과제번호"]}/${r["이름"]}`);
          continue;
        }
        db.prepare(
          "INSERT INTO project_members (project_id, member_id, role, effort_pct) VALUES (?,?,?,?) ON CONFLICT(project_id, member_id) DO UPDATE SET role=excluded.role, effort_pct=excluded.effort_pct"
        ).run(pid, mid, r["역할"] || "참여연구원", num(r["참여율"]));
        n++;
      }
      log.push(`참여연구원: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 매칭 실패(과제/이름): ${misses.join(", ")}`);
    },
  },

  마일스톤: {
    headers: ["과제번호", "내용", "기한", "상태", "비고"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT p.code, ms.title, ms.due_date, ms.status, ms.memo FROM milestones ms
           JOIN projects p ON p.id=ms.project_id ORDER BY ms.due_date`
        )
        .all() as Record<string, string>[]).map((r) => [r.code, r.title, r.due_date, r.status, r.memo]),
    importRows: (rows, log) => {
      const db = getDb();
      db.prepare("DELETE FROM milestones").run();
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const pid = projectIdByCode(r["과제번호"]);
        if (!pid || !r["내용"]) {
          if (r["과제번호"]) misses.push(r["과제번호"]);
          continue;
        }
        db.prepare(
          "INSERT INTO milestones (project_id, title, due_date, status, memo) VALUES (?,?,?,?,?)"
        ).run(pid, r["내용"], r["기한"] || "", r["상태"] || "예정", r["비고"] || "");
        n++;
      }
      log.push(`마일스톤: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 매칭 실패 과제번호: ${[...new Set(misses)].join(", ")}`);
    },
  },

  예산집행: {
    headers: ["과제번호", "비목", "내역", "금액", "집행일", "비고"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT p.code, b.category, b.item, b.amount, b.spent_date, b.memo FROM budget_items b
           JOIN projects p ON p.id=b.project_id ORDER BY b.spent_date`
        )
        .all() as Record<string, string | number>[]).map((r) => [
        r.code as string, r.category as string, r.item as string,
        r.amount as number, r.spent_date as string, r.memo as string,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      db.prepare("DELETE FROM budget_items").run();
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const pid = projectIdByCode(r["과제번호"]);
        if (!pid || !r["내역"]) {
          if (r["과제번호"]) misses.push(r["과제번호"]);
          continue;
        }
        db.prepare(
          "INSERT INTO budget_items (project_id, category, item, amount, spent_date, memo) VALUES (?,?,?,?,?,?)"
        ).run(pid, r["비목"] || "기타", r["내역"], num(r["금액"]), r["집행일"] || "", r["비고"] || "");
        n++;
      }
      log.push(`예산집행: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 매칭 실패 과제번호: ${[...new Set(misses)].join(", ")}`);
    },
  },

  시료: {
    headers: ["시료번호", "시료명", "유형", "출처", "과제번호", "담당자", "보관위치", "수령일", "상태", "비고"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT s.*, p.code AS pcode, m.name AS oname FROM samples s
           LEFT JOIN projects p ON p.id=s.project_id LEFT JOIN members m ON m.id=s.owner_id ORDER BY s.id`
        )
        .all() as Record<string, string>[]).map((r) => [
        r.code, r.name, r.type, r.source, r.pcode ?? "", r.oname ?? "",
        r.storage_location, r.received_date, r.status, r.memo,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["시료번호"]) continue;
        const pid = projectIdByCode(r["과제번호"]);
        const oid = memberIdByName(r["담당자"]);
        const exists = sampleIdByCode(r["시료번호"]);
        if (exists) {
          db.prepare(
            "UPDATE samples SET name=?, type=?, source=?, project_id=?, owner_id=?, storage_location=?, received_date=?, status=?, memo=? WHERE id=?"
          ).run(
            r["시료명"], r["유형"] || "기타", r["출처"] || "", pid, oid,
            r["보관위치"] || "", r["수령일"] || "", r["상태"] || "보관", r["비고"] || "", exists
          );
          up++;
        } else {
          db.prepare(
            "INSERT INTO samples (code, name, type, source, project_id, owner_id, storage_location, received_date, status, memo) VALUES (?,?,?,?,?,?,?,?,?,?)"
          ).run(
            r["시료번호"], r["시료명"] || r["시료번호"], r["유형"] || "기타", r["출처"] || "",
            pid, oid, r["보관위치"] || "", r["수령일"] || new Date().toISOString().slice(0, 10),
            r["상태"] || "보관", r["비고"] || ""
          );
          ins++;
        }
      }
      log.push(`시료: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  실험: {
    headers: ["실험번호", "제목", "과제번호", "시료번호", "담당자", "프로토콜", "시작일", "종료일", "상태", "결과요약"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT e.*, p.code AS pcode, s.code AS scode, m.name AS aname FROM experiments e
           LEFT JOIN projects p ON p.id=e.project_id LEFT JOIN samples s ON s.id=e.sample_id
           LEFT JOIN members m ON m.id=e.assignee_id ORDER BY e.id`
        )
        .all() as Record<string, string>[]).map((r) => [
        r.code, r.title, r.pcode ?? "", r.scode ?? "", r.aname ?? "",
        r.protocol, r.start_date, r.end_date ?? "", r.status, r.result_summary,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["실험번호"]) continue;
        const pid = projectIdByCode(r["과제번호"]);
        const sid = sampleIdByCode(r["시료번호"]);
        const aid = memberIdByName(r["담당자"]);
        const exists = db.prepare("SELECT id FROM experiments WHERE code=?").get(r["실험번호"]) as
          | { id: number }
          | undefined;
        if (exists) {
          db.prepare(
            "UPDATE experiments SET title=?, project_id=?, sample_id=?, assignee_id=?, protocol=?, start_date=?, end_date=?, status=?, result_summary=? WHERE id=?"
          ).run(
            r["제목"], pid, sid, aid, r["프로토콜"] || "", r["시작일"] || "",
            r["종료일"] || null, r["상태"] || "계획", r["결과요약"] || "", exists.id
          );
          up++;
        } else {
          db.prepare(
            "INSERT INTO experiments (code, title, project_id, sample_id, assignee_id, protocol, start_date, end_date, status, result_summary) VALUES (?,?,?,?,?,?,?,?,?,?)"
          ).run(
            r["실험번호"], r["제목"] || r["실험번호"], pid, sid, aid, r["프로토콜"] || "",
            r["시작일"] || new Date().toISOString().slice(0, 10), r["종료일"] || null,
            r["상태"] || "계획", r["결과요약"] || ""
          );
          ins++;
        }
      }
      log.push(`실험: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  장비: {
    headers: ["장비명", "모델", "시리얼번호", "관리자", "위치", "구입일", "최근점검일", "다음점검일", "상태", "비고"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT i.*, m.name AS mname FROM instruments i LEFT JOIN members m ON m.id=i.manager_id ORDER BY i.id`
        )
        .all() as Record<string, string>[]).map((r) => [
        r.name, r.model, r.serial_no, r.mname ?? "", r.location,
        r.purchase_date ?? "", r.last_check_date ?? "", r.next_check_date ?? "", r.status, r.memo,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["장비명"]) continue;
        const mid = memberIdByName(r["관리자"]);
        const exists = (r["시리얼번호"]
          ? db.prepare("SELECT id FROM instruments WHERE serial_no=? AND serial_no!=''").get(r["시리얼번호"])
          : db.prepare("SELECT id FROM instruments WHERE name=?").get(r["장비명"])) as
          | { id: number }
          | undefined;
        const vals = [
          r["장비명"], r["모델"] || "", r["시리얼번호"] || "", mid, r["위치"] || "",
          r["구입일"] || null, r["최근점검일"] || null, r["다음점검일"] || null,
          r["상태"] || "정상", r["비고"] || "",
        ];
        if (exists) {
          db.prepare(
            "UPDATE instruments SET name=?, model=?, serial_no=?, manager_id=?, location=?, purchase_date=?, last_check_date=?, next_check_date=?, status=?, memo=? WHERE id=?"
          ).run(...vals, exists.id);
          up++;
        } else {
          db.prepare(
            "INSERT INTO instruments (name, model, serial_no, manager_id, location, purchase_date, last_check_date, next_check_date, status, memo) VALUES (?,?,?,?,?,?,?,?,?,?)"
          ).run(...vals);
          ins++;
        }
      }
      log.push(`장비: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  휴가: {
    headers: ["이름", "구분", "시작일", "종료일", "일수", "사유", "상태"],
    exportRows: () =>
      (getDb()
        .prepare(
          `SELECT m.name, l.type, l.start_date, l.end_date, l.days, l.reason, l.status
           FROM leaves l JOIN members m ON m.id=l.member_id ORDER BY l.start_date`
        )
        .all() as Record<string, string | number>[]).map((r) => [
        r.name as string, r.type as string, r.start_date as string, r.end_date as string,
        r.days as number, r.reason as string, r.status as string,
      ]),
    importRows: (rows, log) => {
      const db = getDb();
      db.prepare("DELETE FROM leaves").run();
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const mid = memberIdByName(r["이름"]);
        if (!mid) {
          if (r["이름"]) misses.push(r["이름"]);
          continue;
        }
        db.prepare(
          "INSERT INTO leaves (member_id, type, start_date, end_date, days, reason, status) VALUES (?,?,?,?,?,?,?)"
        ).run(
          mid, r["구분"] || "연차", r["시작일"] || "", r["종료일"] || r["시작일"] || "",
          num(r["일수"]) || 1, r["사유"] || "", r["상태"] || "신청"
        );
        n++;
      }
      log.push(`휴가: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 명부에 없는 이름: ${[...new Set(misses)].join(", ")}`);
    },
  },
};

// 가져오기 순서: 참조 무결성 (인원 → 과제 → 나머지)
const IMPORT_ORDER: TabName[] = [
  "인원", "과제", "참여연구원", "마일스톤", "예산집행", "시료", "실험", "장비", "휴가",
];

export async function exportAll(): Promise<string[]> {
  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error(
      "내보내기는 서비스 계정이 필요합니다. data/service-account.json 파일을 두거나 GOOGLE_SERVICE_ACCOUNT_FILE 환경변수를 설정하세요."
    );
  }
  const spreadsheetId = getSetting("spreadsheet_id");
  if (!spreadsheetId) throw new Error("스프레드시트 ID가 설정되지 않았습니다.");
  const log: string[] = [];
  for (const tab of TABS) {
    const spec = SPECS[tab];
    const rows = [spec.headers, ...spec.exportRows()];
    await writeTab(sa, spreadsheetId, tab, rows);
    log.push(`${tab}: ${rows.length - 1}건 내보냄`);
  }
  return log;
}

export async function importAll(tabs?: TabName[]): Promise<string[]> {
  const spreadsheetId = getSetting("spreadsheet_id");
  if (!spreadsheetId) throw new Error("스프레드시트 ID가 설정되지 않았습니다.");
  const sa = loadServiceAccount();
  const targets = IMPORT_ORDER.filter((t) => !tabs || tabs.includes(t));
  const log: string[] = [];
  if (!sa) log.push("서비스 계정 없음 — 공개 시트 CSV 모드로 읽습니다.");

  for (const tab of targets) {
    let rows: string[][];
    try {
      rows = sa ? await readTab(sa, spreadsheetId, tab) : await readPublicTab(spreadsheetId, tab);
    } catch (e) {
      log.push(`${tab}: 읽기 실패 — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (rows.length < 2) {
      log.push(`${tab}: 데이터 없음 (건너뜀)`);
      continue;
    }
    const objects = toObjects(rows);
    const run = getDb().transaction(() => SPECS[tab].importRows(objects, log));
    run();
  }
  return log;
}
