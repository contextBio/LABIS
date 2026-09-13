import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiLab, apiRank, apiMenuAllowed, menuForbidden, withCors, corsPreflight } from '@/lib/apiGuard';
import { extractSpreadsheetId, getLabSetting, loadServiceAccount } from '@/lib/google';
import { DASHBOARD_SHEETS, sheetEditSnapshot, saveSheetEdits, type SheetKind } from '@/lib/dashboardSheetEdit';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
// Serialize dashboard writes in this server. Sheets collaborators still require the
// optimistic re-read below; the Sheets API does not offer an atomic compare-and-swap.
const locks = new Map<string, Promise<unknown>>();
async function handle(req: NextRequest, write: boolean) {
  const reply = (data: unknown,status=200)=>withCors(req,NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}}));
  const user = await apiUser(req); if (user instanceof NextResponse) return user;
  const labId = apiLab(req,user); if (labId instanceof NextResponse) return labId;
  const kind = req.nextUrl.searchParams.get('kind') as SheetKind;
  if (!Object.hasOwn(DASHBOARD_SHEETS,kind)) return reply({ok:false,error:'알 수 없는 시트입니다.'},400);
  const config = DASHBOARD_SHEETS[kind];
  if (apiRank(user,labId)<2 || !(await apiMenuAllowed(user,labId,config.menu,'edit')) || !(await apiMenuAllowed(user,labId,'dashboard','view'))) return menuForbidden(req);
  if (extractSpreadsheetId(await getLabSetting(labId,'spreadsheet_id'))!==DASHBOARD_SHEETS.finance.id) return reply({ok:false,error:'연결된 연구실의 시트만 수정할 수 있습니다.'},403);
  const sa = loadServiceAccount(); if (!sa) return reply({ok:false,error:'시트 연결 설정을 확인해 주세요.'},503);
  const row = Number(req.nextUrl.searchParams.get('row'));
  try {
    if (!write) return reply({ok:true,editor:await sheetEditSnapshot(sa,kind,row)});
    const body = await req.json();
    if (typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)) return reply({ok:false,error:'수정 창을 다시 열어 주세요.'},400);
    const key = config.id;
    const prior = locks.get(key) || Promise.resolve();
    const operation = prior.catch(()=>{}).then(async()=>{
      const result=await saveSheetEdits(sa,kind,row,body.revision,body.changes);
      // A committed sheet write must not be reported as failed if DB audit is down.
      await audit(user.id,labId,'dashboard.sheet_edit','spreadsheet',config.id,{gid:config.gid,row,columns:body.changes.map((c:{column:number})=>c.column)}).catch(()=>console.error('dashboard sheet edit audit failed'));
      return result;
    });
    locks.set(key,operation);
    try { return reply({ok:true,...await operation}); }
    finally { if (locks.get(key)===operation) locks.delete(key); }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Sheets API')) return reply({ok:false,error:'시트 저장 또는 조회에 실패했습니다. 공유 권한을 확인한 후 다시 시도해 주세요.'},502);
    const conflict = message.startsWith('다른 수정');
    return reply({ok:false,error:message || '시트를 처리하지 못했습니다.'},conflict?409:400);
  }
}
export function GET(req:NextRequest) {return handle(req,false);}
export function POST(req:NextRequest) {return handle(req,true);}
export function OPTIONS(req:NextRequest) {return corsPreflight(req);}
