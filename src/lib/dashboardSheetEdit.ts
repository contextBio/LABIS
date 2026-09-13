import { createHash } from 'node:crypto';
import { dashboardCanEdit, listSheets, readDashboardCells, updateDashboardCells, type ServiceAccount } from './google';
export const DASHBOARD_SHEETS = {
  finance: { id: '13mBXeGufBOwAfd-Ve1emXGMqrNfvbcIOd5TfM7Nn6NE', gid: '925054191', menu: 'finance', firstRow: 2, columns: [0,1,2,3,4,5,6,7,8,9], labels: ['과제 / 메모','구분','미지급인건비','지급인건비','학생인건비','재료비','연구수당','간접비','총합','장부 검토'] },
  operations: { id: '1R4QhAQ3g8VdZKeRE8jM20NXNAnnRHqvqhohOekODjXc', gid: '124640725', menu: 'hr', firstRow: 3, columns: [0,1,2,3,4,5,6,8], labels: ['팀','업무','팀장','주요업무','담당자','관리자료','내용','검토 메모'] },
} as const;
export type SheetKind = keyof typeof DASHBOARD_SHEETS;
type Value = { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string };
type Range = { startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
type Cell = { userEnteredValue?: Value; formattedValue?: string; dataValidation?: unknown; textFormatRuns?: unknown[]; hyperlink?: string };
type Grid = { startRow?: number; startColumn?: number; rowData?: { values?: Cell[] }[] };
type Sheet = { properties: { sheetId: number; title: string; gridProperties: { rowCount: number } }; merges?: Range[]; protectedRanges?: { range: Range; warningOnly?: boolean; requestingUserCanEdit?: boolean }[]; data?: Grid[] };
function contains(range: Range, row: number, col: number) {
  return row >= (range.startRowIndex ?? 0) && row < (range.endRowIndex ?? Infinity) && col >= (range.startColumnIndex ?? 0) && col < (range.endColumnIndex ?? Infinity);
}
export function cellEditReason(cell: Cell, sheet: Sheet, row: number, col: number) {
  if (!cell.userEnteredValue && cell.formattedValue) return '연동·배열 수식 계산값';
  if (cell.userEnteredValue?.formulaValue !== undefined) return '수식 자동 계산';
  if (cell.hyperlink || cell.textFormatRuns?.length) return '링크·부분 서식: 원본 시트에서 수정';
  if (cell.dataValidation) return '입력 규칙 적용: 원본 시트에서 수정';
  if (sheet.merges?.some(r => contains(r,row,col))) return '병합 셀: 원본 시트에서 수정';
  if (sheet.protectedRanges?.some(p => !p.warningOnly && !p.requestingUserCanEdit && contains(p.range,row,col))) return '보호된 셀';
  return '';
}
export async function sheetEditSnapshot(sa: ServiceAccount, kind: SheetKind, row: number) {
  const config = DASHBOARD_SHEETS[kind];
  if (!Number.isInteger(row) || row < config.firstRow || row > 10000) throw new Error('수정할 행을 확인해 주세요.');
  const tab = (await listSheets(sa,config.id)).find(s => s.gid === config.gid);
  if (!tab) throw new Error('연결된 탭을 찾지 못했습니다.');
  const name = `'${tab.title.replace(/'/g,"''")}'!`;
  const ranges = kind === 'operations' ? [`${name}A${row}:G${row}`,`${name}I${row}:I${row}`] : [`${name}A${row}:J${row}`];
  const [payload, canEdit] = await Promise.all([readDashboardCells(sa,config.id,ranges),dashboardCanEdit(sa,config.id)]);
  const sheet = (payload.sheets as Sheet[]).find(s=>s.properties.sheetId === Number(config.gid));
  if (!sheet || row > sheet.properties.gridProperties.rowCount) throw new Error('수정할 행이 없습니다.');
  const cells = config.columns.map((column,index)=>{
    let cell: Cell = {};
    for (const grid of sheet.data || []) {
      const c = column - (grid.startColumn || 0), r = row - 1 - (grid.startRow || 0);
      if (c >= 0 && r >= 0 && grid.rowData?.[r]?.values?.[c]) cell = grid.rowData[r].values![c];
    }
    const raw = cell.userEnteredValue || {};
    const reason = cellEditReason(cell,sheet,row-1,column);
    return { column, label: config.labels[index], value: raw.stringValue ?? raw.numberValue ?? raw.boolValue ?? cell.formattedValue ?? '', display: cell.formattedValue ?? '', reason, raw, validation: cell.dataValidation ?? null };
  });
  if (!cells.some(c=>Object.keys(c.raw).length)) throw new Error('빈 행은 원본 시트에서 추가해 주세요.');
  const revision = createHash('sha256').update(JSON.stringify({row,cells,merges:sheet.merges,protection:sheet.protectedRanges})).digest('hex');
  return { kind, row, title: tab.title, revision, canEdit, cells };
}
export function sheetUpdateRequests(snapshot: Awaited<ReturnType<typeof sheetEditSnapshot>>, changes: unknown) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 10) throw new Error('수정 내용을 확인해 주세요.');
  const seen = new Set<number>();
  return changes.map(change=>{
    const cell = snapshot.cells.find(c=>c.column === change?.column);
    if (!cell || cell.reason || seen.has(cell.column)) throw new Error('수식·병합·보호 셀은 원본 시트에서 수정해 주세요.');
    seen.add(cell.column);
    const value = change.value;
    if (!['string','number','boolean'].includes(typeof value) || typeof value === 'string' && value.length > 10000 || typeof value === 'number' && !Number.isFinite(value)) throw new Error('입력값을 확인해 주세요.');
    if (snapshot.kind === 'finance' && cell.column >= 2 && cell.column <= 8 && value !== '' && typeof value !== 'number') throw new Error('금액은 숫자로 입력해 주세요.');
    // Typed values prevent formula injection; change only the supplied cell value.
    const entered = value === '' ? {} : typeof value === 'number' ? {numberValue:value} : typeof value === 'boolean' ? {boolValue:value} : {stringValue:value};
    return { updateCells: { range: {sheetId:Number(DASHBOARD_SHEETS[snapshot.kind].gid),startRowIndex:snapshot.row-1,endRowIndex:snapshot.row,startColumnIndex:cell.column,endColumnIndex:cell.column+1}, rows:[{values:[{userEnteredValue:entered}]}],fields:'userEnteredValue' } };
  });
}
export async function saveSheetEdits(sa: ServiceAccount, kind: SheetKind, row: number, revision: string, changes: unknown) {
  const current = await sheetEditSnapshot(sa,kind,row);
  if (!current.canEdit) throw new Error('시트의 공유 설정에서 LABIS 서비스 계정을 편집자로 추가해 주세요.');
  if (current.revision !== revision) throw new Error('다른 수정이 감지되었습니다. 창을 닫고 최신 내용을 다시 불러와 주세요.');
  const requests = sheetUpdateRequests(current,changes);
  await updateDashboardCells(sa,DASHBOARD_SHEETS[kind].id,requests);
  return { updated:requests.length };
}
