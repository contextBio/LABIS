/**
 * LABi 폴더 수집 에이전트 — 지정 폴더의 스프레드시트 파일로 랩 DB를 구축/갱신한다.
 *
 * 사용법:
 *   npx tsx scripts/ingest-agent.ts --dir <폴더> --lab <랩ID> [--force]   # 폴더 1회 반영
 *   npx tsx scripts/ingest-agent.ts --add-source <폴더> <랩ID> [라벨]     # 소스 등록
 *   npx tsx scripts/ingest-agent.ts --remove-source <폴더>
 *   npx tsx scripts/ingest-agent.ts --list-sources
 *   npx tsx scripts/ingest-agent.ts                                       # 등록된 소스 전부 1회 반영
 *   npx tsx scripts/ingest-agent.ts --watch [--interval 30] [--force]     # 감시 모드 (초 단위)
 *
 * 파일 규칙: .xlsx 는 워크시트 이름, .csv 는 파일 이름이
 * 과제/참여연구원/마일스톤/예산집행/시료/실험/장비/휴가 중 하나여야 반영된다.
 */
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { ingestFolder, loadSources, saveSources, type IngestSource } from "../src/lib/ingest";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

function stamp() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

async function runSource(src: IngestSource, force: boolean) {
  const label = src.label ? ` (${src.label})` : "";
  try {
    const r = await ingestFolder(src.dir, src.labId, { changedOnly: !force });
    if (r.files.length === 0) {
      console.log(`[${stamp()}] ${src.dir}${label} → 랩 ${src.labId}: 변경 없음`);
    } else {
      console.log(`[${stamp()}] ${src.dir}${label} → 랩 ${src.labId}:`);
      for (const f of r.files) console.log(`  · 파일: ${path.basename(f)}`);
      for (const line of r.log) console.log(`  ${line}`);
    }
  } catch (e) {
    console.error(`[${stamp()}] ${src.dir}${label} 실패: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

async function main() {
  const force = has("--force");

  if (has("--list-sources")) {
    const sources = loadSources();
    if (sources.length === 0) console.log("등록된 소스가 없습니다.");
    for (const s of sources) {
      const lab = await prisma.lab.findUnique({ where: { id: s.labId } });
      console.log(`${s.dir} → 랩 ${s.labId} (${lab?.name ?? "??"})${s.label ? ` — ${s.label}` : ""}`);
    }
    return;
  }

  if (has("--add-source")) {
    const i = process.argv.indexOf("--add-source");
    const dir = path.resolve(process.argv[i + 1] ?? "");
    const labId = Number(process.argv[i + 2]);
    const label = process.argv[i + 3];
    if (!dir || !Number.isFinite(labId)) throw new Error("사용법: --add-source <폴더> <랩ID> [라벨]");
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) throw new Error(`랩 ${labId}이 없습니다`);
    const sources = loadSources().filter((s) => s.dir !== dir);
    sources.push({ dir, labId, ...(label ? { label } : {}) });
    saveSources(sources);
    console.log(`등록됨: ${dir} → 랩 ${labId} (${lab.name})`);
    return;
  }

  if (has("--remove-source")) {
    const dir = path.resolve(arg("--remove-source") ?? "");
    const sources = loadSources();
    const next = sources.filter((s) => s.dir !== dir);
    saveSources(next);
    console.log(next.length < sources.length ? `제거됨: ${dir}` : `해당 소스 없음: ${dir}`);
    return;
  }

  // 대상 결정: --dir/--lab 지정 시 그 폴더 하나, 아니면 등록된 소스 전부
  const dirOpt = arg("--dir");
  const labOpt = arg("--lab");
  const targets: IngestSource[] =
    dirOpt && labOpt
      ? [{ dir: path.resolve(dirOpt), labId: Number(labOpt) }]
      : loadSources();

  if (targets.length === 0) {
    console.log("대상이 없습니다. --dir <폴더> --lab <랩ID> 를 주거나 --add-source 로 등록하세요.");
    return;
  }

  if (has("--watch")) {
    const interval = Math.max(5, Number(arg("--interval") ?? 30));
    console.log(`감시 모드 시작 — ${targets.length}개 소스, ${interval}초 주기`);
    // 첫 회는 force 여부를 따르고, 이후에는 변경분만
    for (const src of targets) await runSource(src, force);
    setInterval(async () => {
      for (const src of targets) await runSource(src, false);
    }, interval * 1000);
    return; // 프로세스 유지
  }

  for (const src of targets) await runSource(src, force);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
