/** 업무관리 sheet: A:G only. H contains credentials and must never be returned. */
export function parseOperationsRows(rows: string[][], reviews: string[][]) {
  let team = "", category = "", leader = "";
  const tasks: { row: number; team: string; category: string; leader: string; task: string; members: string[]; resource: string; description: string; review: string }[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const cell = (n: number) => String(r[n] ?? "").trim();
    if (!r.some(v => String(v ?? "").trim())) { team = category = leader = ""; continue; }
    if (cell(0)) { team = cell(0); category = leader = ""; }
    if (cell(1)) category = cell(1);
    if (cell(2)) leader = cell(2);
    if (!cell(3)) {
      const previous = tasks[tasks.length - 1];
      if (cell(4) && previous && previous.team === team && previous.category === category && !previous.members.includes(cell(4))) previous.members.push(cell(4));
      continue;
    }
    tasks.push({ row: i + 1, team, category, leader, task: cell(3), members: cell(4) ? [cell(4)] : [], resource: cell(5), description: cell(6), review: String(reviews[i]?.[0] ?? "").trim() });
  }
  return { updatedLabel: String(rows[0]?.[1] ?? ""), reviewLabel: String(reviews[1]?.[0] ?? ""), tasks };
}
