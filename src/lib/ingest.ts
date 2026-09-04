/**
 * 폴더 기반 DB 구축 엔진.
 *
 * 지정된 폴더의 스프레드시트 파일(.xlsx/.csv)을 읽어 특정 랩의 DB를 구축/갱신한다.
 * 매핑 규칙은 구글시트 동기화(sheetSync.SPECS)와 동일 — 탭/파일 이름이
 * 인원·과제·참여연구원·마일스톤·예산집행·시료·실험·장비·휴가 중 하나면 대상이 된다.
 *
 *  - .xlsx: 워크북 안의 워크시트 이름으로 매칭 (한 파일에 여러 탭 가능)
 *  - .csv : 파일 이름(확장자 제외)으로 매칭 (예: 시료.csv)
 *  - 인원 탭은 계정과 결합되어 있어 구글시트와 동일하게 건너뛴다.
 *
 * 상태 파일(data/ingest-state.json)에 파일별 mtime을 기록해 변경된 파일만
 * 다시 반영한다(force 옵션으로 무시 가능).
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "./prisma";
import { parseCsv } from "./google";
import { SPECS, TABS, type TabName } from "./sheetSync";

const STATE_FILE = path.join(process.cwd(), "data", "ingest-state.json");

// 가져오기 순서 (참조 무결성: 과제 → 관계형 → 나머지)
const ORDER: TabName[] = [
  "과제", "참여연구원", "마일스톤", "예산집행", "시료", "실험", "장비", "휴가",
  "논문", "특허", "기술이전", "구매", "연구비수입",
];

type State = Record<string, number>; // 절대경로 → mtimeMs

function loadState(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state: State) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
}

function toRowObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h ?? "").trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = String(r[i] ?? "").trim();
    });
    return o;
  });
}

/** 파일 하나를 읽어 {탭이름: 행배열} 로 변환 */
export function readSpreadsheetFile(filePath: string): Partial<Record<TabName, string[][]>> {
  const ext = path.extname(filePath).toLowerCase();
  const out: Partial<Record<TabName, string[][]>> = {};

  if (ext === ".csv") {
    const name = path.basename(filePath, ext).trim() as TabName;
    if ((TABS as readonly string[]).includes(name)) {
      out[name] = parseCsv(fs.readFileSync(filePath, "utf8"));
    }
    return out;
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: false });
    for (const sheetName of wb.SheetNames) {
      const tab = sheetName.trim() as TabName;
      if (!(TABS as readonly string[]).includes(tab)) continue;
      // raw:false → 셀 표시 문자열 그대로 (날짜 서식 유지), 빈 셀은 ""
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown as string[][];
      out[tab] = rows.map((r) => r.map((c) => String(c ?? "")));
    }
    return out;
  }

  return out;
}

export type IngestResult = {
  dir: string;
  labId: number;
  files: string[];
  skippedFiles: string[];
  log: string[];
};

/**
 * 폴더 하나를 랩 하나로 반영한다.
 * changedOnly=true 면 상태 파일 기준으로 변경된 파일만 처리.
 */
export async function ingestFolder(
  dir: string,
  labId: number,
  opts: { changedOnly?: boolean } = {}
): Promise<IngestResult> {
  const abs = path.resolve(dir);
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) throw new Error(`랩 ${labId}이 없습니다`);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`폴더가 없습니다: ${abs}`);
  }

  const state = loadState();
  const entries = fs
    .readdirSync(abs)
    .filter((f) => /\.(xlsx|xls|csv)$/i.test(f) && !f.startsWith("~$")) // 엑셀 임시파일 제외
    .map((f) => path.join(abs, f))
    .sort();

  const files: string[] = [];
  const skippedFiles: string[] = [];
  // 탭별로 병합: 같은 탭이 여러 파일에 있으면 나중 파일(정렬순)이 우선
  const merged: Partial<Record<TabName, string[][]>> = {};

  for (const file of entries) {
    const mtime = fs.statSync(file).mtimeMs;
    if (opts.changedOnly && state[file] === mtime) {
      skippedFiles.push(file);
      continue;
    }
    const tabs = readSpreadsheetFile(file);
    if (Object.keys(tabs).length === 0) {
      skippedFiles.push(file);
      continue;
    }
    Object.assign(merged, tabs);
    files.push(file);
    state[file] = mtime;
  }

  const log: string[] = [];
  if (files.length === 0) {
    log.push("변경된 대상 파일이 없습니다.");
    return { dir: abs, labId, files, skippedFiles, log };
  }

  if (merged["인원"]) {
    log.push("인원: 계정과 결합된 탭이라 폴더 반영에서는 건너뜁니다 (구성원 추가는 초대로).");
  }

  for (const tab of ORDER) {
    const rows = merged[tab];
    if (!rows) continue;
    const spec = SPECS[tab];
    if (!spec.importRows) continue;
    if (rows.length < 2) {
      log.push(`${tab}: 데이터 없음 (건너뜀)`);
      continue;
    }
    await spec.importRows(labId, toRowObjects(rows), log);
  }

  saveState(state);
  await prisma.auditLog.create({
    data: {
      labId,
      action: "ingest.folder",
      entity: "folder",
      entityId: abs,
      detail: { files: files.map((f) => path.basename(f)), log },
    },
  });
  return { dir: abs, labId, files, skippedFiles, log };
}

// ---------- 소스 레지스트리 (폴더 ↔ 랩 매핑) ----------

const SOURCES_FILE = path.join(process.cwd(), "data", "ingest-sources.json");

export type IngestSource = { dir: string; labId: number; label?: string };

export function loadSources(): IngestSource[] {
  try {
    const obj = JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8"));
    return Array.isArray(obj.sources) ? obj.sources : [];
  } catch {
    return [];
  }
}

export function saveSources(sources: IngestSource[]) {
  fs.mkdirSync(path.dirname(SOURCES_FILE), { recursive: true });
  fs.writeFileSync(SOURCES_FILE, JSON.stringify({ sources }, null, 2));
}
