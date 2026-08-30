import { prisma } from "./prisma";
import {
  loadServiceAccount, readTab, readPublicTab, writeTab, getLabSetting,
} from "./google";

// 시트 탭 구성 (랩 단위 동기화)
// 가져오기 방식 — upsert: 키 컬럼 기준 갱신, replace: 탭 내용으로 전체 교체
// 인원 탭은 계정(로그인)과 결합되어 있어 내보내기 전용이다.

export const TABS = [
  "인원", "과제", "참여연구원", "마일스톤", "예산집행", "시료", "실험", "장비", "휴가",
  "논문", "특허", "기술이전", "구매", "연구비수입",
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

/** 랩 구성원 이름 → userId 매핑 */
async function nameMap(labId: number): Promise<Map<string, string>> {
  const ms = await prisma.membership.findMany({ where: { labId }, include: { user: true } });
  return new Map(ms.map((m) => [m.user.name, m.userId]));
}

/** 랩 과제번호 → projectId 매핑 */
async function codeMap(labId: number): Promise<Map<string, number>> {
  const ps = await prisma.project.findMany({ where: { labId } });
  return new Map(ps.map((p) => [p.code, p.id]));
}

type EntitySpec = {
  headers: string[];
  exportRows: (labId: number) => Promise<(string | number | null)[][]>;
  importRows: ((labId: number, rows: Row[], log: string[]) => Promise<void>) | null;
};

export const SPECS: Record<TabName, EntitySpec> = {
  인원: {
    headers: ["이름", "직급", "랩역할", "이메일", "연락처", "입사일", "상태"],
    exportRows: async (labId) => {
      const ms = await prisma.membership.findMany({
        where: { labId },
        include: { user: true },
        orderBy: { user: { hireDate: "asc" } },
      });
      return ms.map((m) => [
        m.user.name, m.user.position, m.role, m.user.email,
        m.user.phone, m.user.hireDate, m.user.workStatus,
      ]);
    },
    importRows: null, // 내보내기 전용
  },

  과제: {
    headers: ["과제번호", "과제명", "발주처", "사업명", "연구책임자", "시작일", "종료일", "총연구비", "상태", "비고"],
    exportRows: async (labId) => {
      const ps = await prisma.project.findMany({
        where: { labId },
        include: { pi: { select: { name: true } } },
        orderBy: { id: "asc" },
      });
      return ps.map((p) => [
        p.code, p.title, p.sponsor, p.program, p.pi?.name ?? "",
        p.startDate, p.endDate, p.totalBudget, p.status, p.memo,
      ]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      const codes = await codeMap(labId);
      let up = 0, ins = 0;
      const misses: string[] = [];
      for (const r of rows) {
        if (!r["과제번호"]) continue;
        const piId = names.get(r["연구책임자"]) ?? null;
        if (r["연구책임자"] && !piId) misses.push(r["연구책임자"]);
        const data = {
          title: r["과제명"] || r["과제번호"],
          sponsor: r["발주처"] || "",
          program: r["사업명"] || "",
          piId,
          startDate: r["시작일"] || "",
          endDate: r["종료일"] || "",
          totalBudget: num(r["총연구비"]),
          status: r["상태"] || "진행",
          memo: r["비고"] || "",
        };
        const existing = codes.get(r["과제번호"]);
        if (existing) {
          await prisma.project.update({ where: { id: existing }, data });
          up++;
        } else {
          await prisma.project.create({ data: { ...data, labId, code: r["과제번호"] } });
          ins++;
        }
      }
      log.push(`과제: ${up}건 갱신, ${ins}건 추가`);
      if (misses.length) log.push(`⚠ 명부에 없는 연구책임자: ${[...new Set(misses)].join(", ")}`);
    },
  },

  참여연구원: {
    headers: ["과제번호", "이름", "역할", "참여율"],
    exportRows: async (labId) => {
      const pms = await prisma.projectMember.findMany({
        where: { project: { labId } },
        include: { project: { select: { code: true } }, user: { select: { name: true } } },
        orderBy: [{ project: { code: "asc" } }, { user: { name: "asc" } }],
      });
      return pms.map((pm) => [pm.project.code, pm.user.name, pm.role, pm.effortPct]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      const codes = await codeMap(labId);
      await prisma.projectMember.deleteMany({ where: { project: { labId } } });
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const pid = codes.get(r["과제번호"]);
        const uid = names.get(r["이름"]);
        if (!pid || !uid) {
          if (r["과제번호"] || r["이름"]) misses.push(`${r["과제번호"]}/${r["이름"]}`);
          continue;
        }
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: pid, userId: uid } },
          create: { projectId: pid, userId: uid, role: r["역할"] || "참여연구원", effortPct: num(r["참여율"]) },
          update: { role: r["역할"] || "참여연구원", effortPct: num(r["참여율"]) },
        });
        n++;
      }
      log.push(`참여연구원: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 매칭 실패(과제/이름): ${misses.join(", ")}`);
    },
  },

  마일스톤: {
    headers: ["과제번호", "내용", "기한", "상태", "비고"],
    exportRows: async (labId) => {
      const ms = await prisma.milestone.findMany({
        where: { project: { labId } },
        include: { project: { select: { code: true } } },
        orderBy: { dueDate: "asc" },
      });
      return ms.map((m) => [m.project.code, m.title, m.dueDate, m.status, m.memo]);
    },
    importRows: async (labId, rows, log) => {
      const codes = await codeMap(labId);
      await prisma.milestone.deleteMany({ where: { project: { labId } } });
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const pid = codes.get(r["과제번호"]);
        if (!pid || !r["내용"]) {
          if (r["과제번호"]) misses.push(r["과제번호"]);
          continue;
        }
        await prisma.milestone.create({
          data: { projectId: pid, title: r["내용"], dueDate: r["기한"] || "", status: r["상태"] || "예정", memo: r["비고"] || "" },
        });
        n++;
      }
      log.push(`마일스톤: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 매칭 실패 과제번호: ${[...new Set(misses)].join(", ")}`);
    },
  },

  예산집행: {
    headers: ["과제번호", "비목", "내역", "금액", "집행일", "비고"],
    exportRows: async (labId) => {
      const bs = await prisma.budgetItem.findMany({
        where: { project: { labId } },
        include: { project: { select: { code: true } } },
        orderBy: { spentDate: "asc" },
      });
      return bs.map((b) => [b.project.code, b.category, b.item, b.amount, b.spentDate, b.memo]);
    },
    importRows: async (labId, rows, log) => {
      const codes = await codeMap(labId);
      await prisma.budgetItem.deleteMany({ where: { project: { labId } } });
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const pid = codes.get(r["과제번호"]);
        if (!pid || !r["내역"]) {
          if (r["과제번호"]) misses.push(r["과제번호"]);
          continue;
        }
        await prisma.budgetItem.create({
          data: { projectId: pid, category: r["비목"] || "기타", item: r["내역"], amount: num(r["금액"]), spentDate: r["집행일"] || "", memo: r["비고"] || "" },
        });
        n++;
      }
      log.push(`예산집행: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 매칭 실패 과제번호: ${[...new Set(misses)].join(", ")}`);
    },
  },

  시료: {
    headers: ["시료번호", "시료명", "유형", "출처", "과제번호", "담당자", "보관위치", "수령일", "상태", "비고"],
    exportRows: async (labId) => {
      const ss = await prisma.sample.findMany({
        where: { labId },
        include: { project: { select: { code: true } }, owner: { select: { name: true } } },
        orderBy: { id: "asc" },
      });
      return ss.map((s) => [
        s.code, s.name, s.type, s.source, s.project?.code ?? "", s.owner?.name ?? "",
        s.storageLocation, s.receivedDate, s.status, s.memo,
      ]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      const codes = await codeMap(labId);
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["시료번호"]) continue;
        const data = {
          name: r["시료명"] || r["시료번호"],
          type: r["유형"] || "기타",
          source: r["출처"] || "",
          projectId: codes.get(r["과제번호"]) ?? null,
          ownerId: names.get(r["담당자"]) ?? null,
          storageLocation: r["보관위치"] || "",
          receivedDate: r["수령일"] || "",
          status: r["상태"] || "보관",
          memo: r["비고"] || "",
        };
        const existing = await prisma.sample.findUnique({
          where: { labId_code: { labId, code: r["시료번호"] } },
        });
        if (existing) {
          await prisma.sample.update({ where: { id: existing.id }, data });
          up++;
        } else {
          await prisma.sample.create({ data: { ...data, labId, code: r["시료번호"] } });
          ins++;
        }
      }
      log.push(`시료: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  실험: {
    headers: ["실험번호", "제목", "과제번호", "시료번호", "담당자", "프로토콜", "시작일", "종료일", "상태", "결과요약"],
    exportRows: async (labId) => {
      const es = await prisma.experiment.findMany({
        where: { labId },
        include: {
          project: { select: { code: true } },
          sample: { select: { code: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      });
      return es.map((e) => [
        e.code, e.title, e.project?.code ?? "", e.sample?.code ?? "", e.assignee?.name ?? "",
        e.protocol, e.startDate, e.endDate ?? "", e.status, e.resultSummary,
      ]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      const codes = await codeMap(labId);
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["실험번호"]) continue;
        const sample = r["시료번호"]
          ? await prisma.sample.findUnique({ where: { labId_code: { labId, code: r["시료번호"] } } })
          : null;
        const data = {
          title: r["제목"] || r["실험번호"],
          projectId: codes.get(r["과제번호"]) ?? null,
          sampleId: sample?.id ?? null,
          assigneeId: names.get(r["담당자"]) ?? null,
          protocol: r["프로토콜"] || "",
          startDate: r["시작일"] || "",
          endDate: r["종료일"] || null,
          status: r["상태"] || "계획",
          resultSummary: r["결과요약"] || "",
        };
        const existing = await prisma.experiment.findUnique({
          where: { labId_code: { labId, code: r["실험번호"] } },
        });
        if (existing) {
          await prisma.experiment.update({ where: { id: existing.id }, data });
          up++;
        } else {
          await prisma.experiment.create({ data: { ...data, labId, code: r["실험번호"] } });
          ins++;
        }
      }
      log.push(`실험: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  장비: {
    headers: ["장비명", "모델", "시리얼번호", "관리자", "위치", "구입일", "최근점검일", "다음점검일", "상태", "비고"],
    exportRows: async (labId) => {
      const is_ = await prisma.instrument.findMany({
        where: { labId },
        include: { manager: { select: { name: true } } },
        orderBy: { id: "asc" },
      });
      return is_.map((i) => [
        i.name, i.model, i.serialNo, i.manager?.name ?? "", i.location,
        i.purchaseDate ?? "", i.lastCheckDate ?? "", i.nextCheckDate ?? "", i.status, i.memo,
      ]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      let up = 0, ins = 0;
      for (const r of rows) {
        if (!r["장비명"]) continue;
        const data = {
          name: r["장비명"],
          model: r["모델"] || "",
          serialNo: r["시리얼번호"] || "",
          managerId: names.get(r["관리자"]) ?? null,
          location: r["위치"] || "",
          purchaseDate: r["구입일"] || null,
          lastCheckDate: r["최근점검일"] || null,
          nextCheckDate: r["다음점검일"] || null,
          status: r["상태"] || "정상",
          memo: r["비고"] || "",
        };
        const existing = r["시리얼번호"]
          ? await prisma.instrument.findFirst({ where: { labId, serialNo: r["시리얼번호"] } })
          : await prisma.instrument.findFirst({ where: { labId, name: r["장비명"] } });
        if (existing) {
          await prisma.instrument.update({ where: { id: existing.id }, data });
          up++;
        } else {
          await prisma.instrument.create({ data: { ...data, labId } });
          ins++;
        }
      }
      log.push(`장비: ${up}건 갱신, ${ins}건 추가`);
    },
  },

  논문: {
    headers: ["연도", "제목", "저널", "저자", "DOI", "과제번호", "비고"],
    exportRows: async (labId) => {
      const ps = await prisma.publication.findMany({
        where: { labId },
        include: { project: { select: { code: true } } },
        orderBy: [{ year: "asc" }, { id: "asc" }],
      });
      return ps.map((p) => [p.year, p.title, p.journal, p.authors, p.doi, p.project?.code ?? "", p.memo]);
    },
    importRows: async (labId, rows, log) => {
      const codes = await codeMap(labId);
      await prisma.publication.deleteMany({ where: { labId } });
      let n = 0;
      for (const r of rows) {
        if (!r["제목"]) continue;
        await prisma.publication.create({
          data: {
            labId, title: r["제목"], year: r["연도"] || "", journal: r["저널"] || "",
            authors: r["저자"] || "", doi: r["DOI"] || "",
            projectId: codes.get(r["과제번호"]) ?? null, memo: r["비고"] || "",
          },
        });
        n++;
      }
      log.push(`논문: 전체 교체, ${n}건 입력`);
    },
  },

  특허: {
    headers: ["일자", "발명명칭", "출원번호", "등록번호", "발명자", "상태", "과제번호", "비고"],
    exportRows: async (labId) => {
      const ps = await prisma.patent.findMany({
        where: { labId },
        include: { project: { select: { code: true } } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });
      return ps.map((p) => [
        p.date, p.title, p.applicationNo, p.registrationNo, p.inventors, p.status,
        p.project?.code ?? "", p.memo,
      ]);
    },
    importRows: async (labId, rows, log) => {
      const codes = await codeMap(labId);
      await prisma.patent.deleteMany({ where: { labId } });
      let n = 0;
      for (const r of rows) {
        if (!r["발명명칭"]) continue;
        await prisma.patent.create({
          data: {
            labId, title: r["발명명칭"], date: r["일자"] || "",
            applicationNo: r["출원번호"] || "", registrationNo: r["등록번호"] || "",
            inventors: r["발명자"] || "", status: r["상태"] || "출원",
            projectId: codes.get(r["과제번호"]) ?? null, memo: r["비고"] || "",
          },
        });
        n++;
      }
      log.push(`특허: 전체 교체, ${n}건 입력`);
    },
  },

  기술이전: {
    headers: ["계약일", "기술명", "이전대상", "기술료", "과제번호", "비고"],
    exportRows: async (labId) => {
      const ts = await prisma.techTransfer.findMany({
        where: { labId },
        include: { project: { select: { code: true } } },
        orderBy: [{ contractDate: "asc" }, { id: "asc" }],
      });
      return ts.map((t) => [t.contractDate, t.title, t.licensee, t.amount, t.project?.code ?? "", t.memo]);
    },
    importRows: async (labId, rows, log) => {
      const codes = await codeMap(labId);
      await prisma.techTransfer.deleteMany({ where: { labId } });
      let n = 0;
      for (const r of rows) {
        if (!r["기술명"]) continue;
        await prisma.techTransfer.create({
          data: {
            labId, title: r["기술명"], contractDate: r["계약일"] || "",
            licensee: r["이전대상"] || "", amount: num(r["기술료"]),
            projectId: codes.get(r["과제번호"]) ?? null, memo: r["비고"] || "",
          },
        });
        n++;
      }
      log.push(`기술이전: 전체 교체, ${n}건 입력`);
    },
  },

  구매: {
    headers: ["일자", "품목", "구입처", "비목", "금액", "신청자", "과제번호", "상태", "비고"],
    exportRows: async (labId) => {
      const ps = await prisma.purchase.findMany({
        where: { labId },
        include: { project: { select: { code: true } }, requester: { select: { name: true } } },
        orderBy: [{ orderDate: "asc" }, { id: "asc" }],
      });
      return ps.map((p) => [
        p.orderDate, p.item, p.vendor, p.category, p.amount, p.requester?.name ?? "",
        p.project?.code ?? "", p.status, p.memo,
      ]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      const codes = await codeMap(labId);
      await prisma.purchase.deleteMany({ where: { labId } });
      let n = 0;
      for (const r of rows) {
        if (!r["품목"]) continue;
        await prisma.purchase.create({
          data: {
            labId, item: r["품목"], orderDate: r["일자"] || "", vendor: r["구입처"] || "",
            category: r["비목"] || "재료비", amount: num(r["금액"]),
            requesterId: names.get(r["신청자"]) ?? null,
            projectId: codes.get(r["과제번호"]) ?? null,
            status: r["상태"] || "신청", memo: r["비고"] || "",
          },
        });
        n++;
      }
      log.push(`구매: 전체 교체, ${n}건 입력`);
    },
  },

  연구비수입: {
    headers: ["일자", "과제번호", "내용", "금액"],
    exportRows: async (labId) => {
      const is_ = await prisma.fundIncome.findMany({
        where: { labId },
        include: { project: { select: { code: true } } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });
      return is_.map((i) => [i.date, i.project?.code ?? "", i.note, i.amount]);
    },
    importRows: async (labId, rows, log) => {
      const codes = await codeMap(labId);
      await prisma.fundIncome.deleteMany({ where: { labId } });
      let n = 0;
      for (const r of rows) {
        if (!r["금액"]) continue;
        await prisma.fundIncome.create({
          data: {
            labId, date: r["일자"] || "", note: r["내용"] || "",
            amount: num(r["금액"]), projectId: codes.get(r["과제번호"]) ?? null,
          },
        });
        n++;
      }
      log.push(`연구비수입: 전체 교체, ${n}건 입력`);
    },
  },

  휴가: {
    headers: ["이름", "구분", "시작일", "종료일", "일수", "사유", "상태"],
    exportRows: async (labId) => {
      const ls = await prisma.leave.findMany({
        where: { labId },
        include: { user: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      });
      return ls.map((l) => [l.user.name, l.type, l.startDate, l.endDate, l.days, l.reason, l.status]);
    },
    importRows: async (labId, rows, log) => {
      const names = await nameMap(labId);
      await prisma.leave.deleteMany({ where: { labId } });
      let n = 0;
      const misses: string[] = [];
      for (const r of rows) {
        const uid = names.get(r["이름"]);
        if (!uid) {
          if (r["이름"]) misses.push(r["이름"]);
          continue;
        }
        await prisma.leave.create({
          data: {
            labId, userId: uid, type: r["구분"] || "연차",
            startDate: r["시작일"] || "", endDate: r["종료일"] || r["시작일"] || "",
            days: num(r["일수"]) || 1, reason: r["사유"] || "", status: r["상태"] || "신청",
          },
        });
        n++;
      }
      log.push(`휴가: 전체 교체, ${n}건 입력`);
      if (misses.length) log.push(`⚠ 명부에 없는 이름: ${[...new Set(misses)].join(", ")}`);
    },
  },
};

// 가져오기 순서: 참조 무결성 (과제 → 관계형 → 나머지)
const IMPORT_ORDER: TabName[] = [
  "과제", "참여연구원", "마일스톤", "예산집행", "시료", "실험", "장비", "휴가",
  "논문", "특허", "기술이전", "구매", "연구비수입",
];

export async function exportAll(labId: number): Promise<string[]> {
  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error(
      "내보내기는 서비스 계정이 필요합니다. data/service-account.json 파일을 두거나 GOOGLE_SERVICE_ACCOUNT_FILE 환경변수를 설정하세요."
    );
  }
  const spreadsheetId = await getLabSetting(labId, "spreadsheet_id");
  if (!spreadsheetId) throw new Error("이 랩의 스프레드시트가 설정되지 않았습니다.");
  const log: string[] = [];
  for (const tab of TABS) {
    const spec = SPECS[tab];
    const rows = [spec.headers, ...(await spec.exportRows(labId))];
    await writeTab(sa, spreadsheetId, tab, rows);
    log.push(`${tab}: ${rows.length - 1}건 내보냄`);
  }
  return log;
}

export async function importAll(labId: number, tabs?: TabName[]): Promise<string[]> {
  const spreadsheetId = await getLabSetting(labId, "spreadsheet_id");
  if (!spreadsheetId) throw new Error("이 랩의 스프레드시트가 설정되지 않았습니다.");
  const sa = loadServiceAccount();
  const targets = IMPORT_ORDER.filter((t) => !tabs || tabs.includes(t));
  const log: string[] = [];
  if (!sa) log.push("서비스 계정 없음 — 공개 시트 CSV 모드로 읽습니다.");
  if (tabs?.includes("인원")) log.push("인원: 내보내기 전용 탭입니다 (계정과 결합) — 건너뜀");

  for (const tab of targets) {
    const spec = SPECS[tab];
    if (!spec.importRows) continue;
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
    await spec.importRows(labId, toObjects(rows), log);
  }
  return log;
}
