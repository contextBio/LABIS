/**
 * LABIS 구글시트 수집 에이전트 — 랩마다 연결된 시트를 읽어 그 항목 DB에 반영한다.
 *
 * 사용법:
 *   npx tsx scripts/sheet-agent.ts                             # 연결된 모든 랩·항목 1회 (변경분만)
 *   npx tsx scripts/sheet-agent.ts --lab 2                     # 특정 랩만
 *   npx tsx scripts/sheet-agent.ts --tabs 논문,구매             # 특정 항목만
 *   npx tsx scripts/sheet-agent.ts --force                     # 시트가 그대로여도 다시 반영
 *   npx tsx scripts/sheet-agent.ts --list                      # 연결 현황만 본다
 *   npx tsx scripts/sheet-agent.ts --watch [--interval 300]    # 주기 실행 (초, 기본 300)
 *
 * 소스를 따로 등록하지 않는다 — 화면(관리자 설정 → 구글시트 연동)에서 넣은 주소를 그대로
 * 쓰고, 결과도 같은 화면의 항목별 로그에 남는다. 폴더 파일을 읽는 ingest-agent.ts 와
 * 짝이며, 이쪽은 구글시트를 본다.
 *
 * 시트 내용이 지난번과 같으면 DB를 건드리지 않으므로(--force 로 무시) 짧은 주기로 돌려도
 * 안전하다. 시트에서 사라진 행은 지우지만, 화면에서 직접 넣은 행은 건드리지 않는다.
 */
import { ITEM_TABS, type TabName } from "../src/lib/sheetSync";
import { itemStatus, parseTabs, serviceAccountEmail, syncItem } from "../src/lib/sheetItems";
import { prisma } from "../src/lib/prisma";

type Lab = { id: number; name: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

function stamp() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** --lab 이 있으면 그 랩만, 없으면 운영 중인 랩 전부 (폐쇄한 랩은 건드리지 않는다) */
async function targetLabs(): Promise<Lab[]> {
  const only = arg("--lab");
  if (only) {
    const id = Number(only);
    if (!Number.isFinite(id)) throw new Error("사용법: --lab <랩ID>");
    const lab = await prisma.lab.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!lab) throw new Error(`랩 ${id} 이 없습니다`);
    return [lab];
  }
  return prisma.lab.findMany({
    where: { status: "운영" },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}

function targetTabs(): TabName[] {
  const csv = arg("--tabs");
  return csv ? parseTabs(csv) : [...ITEM_TABS];
}

async function listLinks(labs: Lab[], tabs: TabName[]) {
  const account = serviceAccountEmail();
  console.log(
    account
      ? `인증: 서비스 계정 ${account} — 비공개 시트도 읽는다`
      : "인증: 서비스 계정 없음 — '링크가 있는 모든 사용자'로 공유된 시트만 읽는다"
  );
  for (const lab of labs) {
    const linked = (await itemStatus(lab.id, tabs)).filter((s) => s.id);
    console.log(`\n[${lab.id}] ${lab.name} — 연결된 항목 ${linked.length}개`);
    for (const s of linked) {
      const when = s.log ? s.log.at : "기록 없음";
      console.log(`  · ${s.tab}: ${s.id}${s.gid ? `#${s.gid}` : ""} (최근 ${when})`);
    }
  }
}

/** 랩 하나를 한 바퀴 돌린다. 반환값은 실제로 반영된 항목 수. */
async function runLab(lab: Lab, tabs: TabName[], force: boolean): Promise<number> {
  const linked = (await itemStatus(lab.id, tabs)).filter((s) => s.id);
  if (linked.length === 0) return 0;
  let changed = 0;
  for (const s of linked) {
    const r = await syncItem(lab.id, s.tab, { changedOnly: !force });
    if (!r.changed) continue;
    changed++;
    console.log(`[${stamp()}] [${lab.id}] ${lab.name} · ${s.tab}`);
    for (const line of r.lines) console.log(`  ${line}`);
  }
  return changed;
}

async function runOnce(tabs: TabName[], force: boolean) {
  const labs = await targetLabs();
  let changed = 0;
  for (const lab of labs) {
    try {
      changed += await runLab(lab, tabs, force);
    } catch (e) {
      console.error(`[${stamp()}] [${lab.id}] ${lab.name} 실패: ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    }
  }
  if (changed === 0) console.log(`[${stamp()}] 변경 없음 (랩 ${labs.length}개 확인)`);
}

async function main() {
  const force = has("--force");
  const tabs = targetTabs();

  if (has("--list")) {
    await listLinks(await targetLabs(), tabs);
    await prisma.$disconnect();
    return;
  }

  if (has("--watch")) {
    const interval = Math.max(30, Number(arg("--interval") ?? 300));
    console.log(`감시 모드 시작 — ${interval}초 주기, 항목 ${tabs.length}개`);
    await runOnce(tabs, force); // 첫 회는 --force 를 따른다
    setInterval(() => {
      void runOnce(tabs, false); // 이후에는 변경분만
    }, interval * 1000);
    return; // 프로세스 유지
  }

  await runOnce(tabs, force);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
