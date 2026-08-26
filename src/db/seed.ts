import { getDb } from "./index";

const db = getDb();

const memberCount = db.prepare("SELECT COUNT(*) AS n FROM members").get() as { n: number };
if (memberCount.n > 0) {
  console.log("이미 데이터가 있어 시드를 건너뜁니다.");
  process.exit(0);
}

const seed = db.transaction(() => {
  const insMember = db.prepare(
    "INSERT INTO members (name, position, department, email, hire_date, status) VALUES (?,?,?,?,?,?)"
  );
  const m1 = insMember.run("우현구", "대표/연구소장", "경영", "hyun.goo.woo@gmail.com", "2020-03-01", "재직").lastInsertRowid;
  const m2 = insMember.run("김서연", "책임연구원", "바이오정보팀", "sy.kim@example.com", "2021-05-10", "재직").lastInsertRowid;
  const m3 = insMember.run("박지훈", "선임연구원", "실험팀", "jh.park@example.com", "2022-01-17", "재직").lastInsertRowid;
  const m4 = insMember.run("이하은", "연구원", "실험팀", "he.lee@example.com", "2023-09-01", "재직").lastInsertRowid;
  const m5 = insMember.run("최민준", "연구원", "바이오정보팀", "mj.choi@example.com", "2024-03-04", "재직").lastInsertRowid;

  const insProject = db.prepare(
    "INSERT INTO projects (code, title, sponsor, program, pi_id, start_date, end_date, total_budget, status) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  const p1 = insProject.run(
    "NRF-2026-001", "간암 다중오믹스 기반 예후예측 모델 개발", "한국연구재단", "중견연구자지원사업",
    m1, "2026-03-01", "2029-02-28", 900000000, "진행"
  ).lastInsertRowid;
  const p2 = insProject.run(
    "KHIDI-2025-014", "혈액 기반 액체생검 바이오마커 검증", "한국보건산업진흥원", "보건의료기술연구개발",
    m2, "2025-04-01", "2027-12-31", 450000000, "진행"
  ).lastInsertRowid;

  const insPM = db.prepare(
    "INSERT INTO project_members (project_id, member_id, role, effort_pct) VALUES (?,?,?,?)"
  );
  insPM.run(p1, m1, "연구책임자", 30);
  insPM.run(p1, m2, "참여연구원", 40);
  insPM.run(p1, m5, "참여연구원", 60);
  insPM.run(p2, m2, "연구책임자", 30);
  insPM.run(p2, m3, "참여연구원", 50);
  insPM.run(p2, m4, "참여연구원", 70);

  const insMs = db.prepare(
    "INSERT INTO milestones (project_id, title, due_date, status) VALUES (?,?,?,?)"
  );
  insMs.run(p1, "1차년도 연차보고서 제출", "2027-01-31", "예정");
  insMs.run(p1, "코호트 데이터 수집 완료", "2026-12-15", "진행");
  insMs.run(p2, "중간평가", "2026-10-30", "진행");
  insMs.run(p2, "바이오마커 후보 확정", "2026-09-15", "진행");

  const insBudget = db.prepare(
    "INSERT INTO budget_items (project_id, category, item, amount, spent_date) VALUES (?,?,?,?,?)"
  );
  insBudget.run(p1, "재료비", "시퀀싱 키트 (NovaSeq)", 32000000, "2026-05-12");
  insBudget.run(p1, "인건비", "참여연구원 인건비 (상반기)", 78000000, "2026-06-30");
  insBudget.run(p2, "재료비", "cfDNA 추출 키트", 8500000, "2026-07-02");
  insBudget.run(p2, "여비", "학회 출장 (KSMO)", 1200000, "2026-08-10");

  const insSample = db.prepare(
    "INSERT INTO samples (code, name, type, source, project_id, owner_id, storage_location, received_date, status) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  insSample.run("S-2026-0001", "HCC 환자 종양조직 #1", "조직", "아주대병원", p1, m3, "초저온냉동고 A-2-13", "2026-04-02", "보관");
  insSample.run("S-2026-0002", "HCC 환자 혈장 #1", "혈액", "아주대병원", p2, m4, "초저온냉동고 B-1-04", "2026-04-02", "보관");
  insSample.run("S-2026-0003", "HCC 환자 종양 RNA #1", "RNA", "자체 추출", p1, m3, "냉동고 C-3-01", "2026-05-20", "사용중");

  const insExp = db.prepare(
    "INSERT INTO experiments (code, title, project_id, sample_id, assignee_id, protocol, start_date, status, result_summary) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  insExp.run("E-2026-0007", "RNA-seq 라이브러리 제작", p1, 3, m3, "TruSeq Stranded mRNA v2", "2026-08-18", "진행", "");
  insExp.run("E-2026-0006", "cfDNA 정량 및 QC", p2, 2, m4, "Qubit + TapeStation", "2026-08-05", "완료", "QC 통과, 평균 농도 2.1 ng/µL");

  const insInst = db.prepare(
    "INSERT INTO instruments (name, model, serial_no, manager_id, location, purchase_date, last_check_date, next_check_date, status) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  insInst.run("초저온냉동고 A", "Thermo TSX600", "TSX-88112", m3, "실험실 1", "2021-06-15", "2026-06-01", "2026-12-01", "정상");
  insInst.run("실시간 PCR", "QuantStudio 5", "QS5-30211", m4, "실험실 2", "2022-11-02", "2026-05-20", "2026-11-20", "정상");
  insInst.run("원심분리기", "Eppendorf 5424R", "EP-77410", m4, "실험실 1", "2020-02-28", "2026-02-10", "2026-08-10", "점검중");

  insMember.run("정다인", "행정원", "경영지원", "di.jung@example.com", "2022-07-01", "재직");

  db.prepare(
    "INSERT INTO leaves (member_id, type, start_date, end_date, days, reason, status) VALUES (?,?,?,?,?,?,?)"
  ).run(m4, "연차", "2026-09-03", "2026-09-04", 2, "개인 사유", "승인");
});

seed();
console.log("시드 데이터 입력 완료.");
