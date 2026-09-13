import assert from 'node:assert/strict';
import { cellEditReason, sheetUpdateRequests, type sheetEditSnapshot } from '../src/lib/dashboardSheetEdit';
const metadata = {properties:{sheetId:1,title:'test',gridProperties:{rowCount:10}},merges:[{startRowIndex:2,endRowIndex:4,startColumnIndex:0,endColumnIndex:1}],protectedRanges:[{range:{startRowIndex:2,endRowIndex:3,startColumnIndex:6,endColumnIndex:7}}]};
assert.equal(cellEditReason({userEnteredValue:{formulaValue:'=SUM(A1:A2)'}},metadata,2,1),'수식 자동 계산');
assert.ok(cellEditReason({dataValidation:{strict:true}},metadata,2,1));
assert.ok(cellEditReason({},metadata,2,0));
assert.ok(cellEditReason({},metadata,2,6));
assert.equal(cellEditReason({},metadata,2,3),'');
assert.equal(cellEditReason({formattedValue:'1,000'},metadata,2,3),'연동·배열 수식 계산값');
const snapshot = {kind:'operations',row:3,title:'업무',revision:'a'.repeat(64),canEdit:true,cells:[{column:3,label:'업무',value:'old',display:'old',reason:'',raw:{stringValue:'old'},validation:null},{column:4,label:'담당자',value:'',display:'',reason:'',raw:{},validation:null},{column:5,label:'수식',value:'1',display:'1',reason:'수식 자동 계산',raw:{formulaValue:'=1'},validation:null}]} as Awaited<ReturnType<typeof sheetEditSnapshot>>;
const requests=sheetUpdateRequests(snapshot,[{column:3,value:'=IMPORTDATA("example")'},{column:4,value:''}]);
assert.equal(requests[0].updateCells.fields,'userEnteredValue');
assert.deepEqual(requests[0].updateCells.rows[0].values[0].userEnteredValue,{stringValue:'=IMPORTDATA("example")'});
assert.deepEqual(requests[1].updateCells.rows[0].values[0].userEnteredValue,{});
assert.equal(requests[0].updateCells.range.startRowIndex,2);
assert.equal(requests[0].updateCells.range.startColumnIndex,3);
assert.throws(()=>sheetUpdateRequests(snapshot,[{column:7,value:'private'}]));
assert.throws(()=>sheetUpdateRequests(snapshot,[{column:5,value:'overwrite formula'}]));
assert.throws(()=>sheetUpdateRequests(snapshot,[{column:3,value:'a'},{column:3,value:'b'}]));
assert.throws(()=>sheetUpdateRequests({...snapshot,kind:'finance'},[{column:3,value:'123'}]));
assert.equal(sheetUpdateRequests({...snapshot,kind:'finance'},[{column:3,value:123}])[0].updateCells.rows[0].values[0].userEnteredValue.numberValue,123);
console.log('PASS: formula, merge, protection, validation, private column, typed values, duplicate updates and exact ranges');

// Exercise the real read/compare/batch-update pipeline against a fake Google server.
import { JWT } from 'google-auth-library';
import { sheetEditSnapshot as readSnapshot, saveSheetEdits } from '../src/lib/dashboardSheetEdit';
async function testSavePipeline() {
  const originalFetch = globalThis.fetch, originalToken = JWT.prototype.getAccessToken;
  let liveValue = 'old', editable = true, batches = 0;
  const payload = () => ({ sheets: [{ properties: { sheetId:124640725,title:'업무관리(2026)',gridProperties:{rowCount:100} },data:[{startRow:2,startColumn:0,rowData:[{values:[{userEnteredValue:{stringValue:'총무'}},{},{},{userEnteredValue:{stringValue:liveValue},formattedValue:liveValue}]}]}] }] });
  JWT.prototype.getAccessToken = (async()=>({token:'test-token'})) as typeof originalToken;
  globalThis.fetch = (async(input,init)=>{
    const url=String(input);
    if (url.includes('/drive/v3/')) return Response.json({capabilities:{canEdit:editable}});
    if (url.includes(':batchUpdate')) {
      batches++; const body=JSON.parse(String(init?.body));
      assert.equal(body.requests.length,1);
      liveValue=body.requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue;
      return Response.json({replies:[{}]});
    }
    assert.ok(url.startsWith('https://sheets.googleapis.com/'));
    return Response.json(payload());
  }) as typeof fetch;
  try {
    const sa={client_email:'test@example.com',private_key:'test'};
    const snapshot=await readSnapshot(sa,'operations',3);
    liveValue='changed in Sheets';
    await assert.rejects(saveSheetEdits(sa,'operations',3,snapshot.revision,[{column:3,value:'overwrite'}]),/다른 수정/);
    assert.equal(batches,0);
    const fresh=await readSnapshot(sa,'operations',3);
    await saveSheetEdits(sa,'operations',3,fresh.revision,[{column:3,value:'dashboard edit'}]);
    assert.equal((await readSnapshot(sa,'operations',3)).cells.find(c=>c.column===3)?.value,'dashboard edit');
    assert.equal(batches,1);
    editable=false;
    await assert.rejects(saveSheetEdits(sa,'operations',3,fresh.revision,[{column:3,value:'denied'}]),/편집자/);
    assert.equal(batches,1);
    console.log('PASS: Google save/readback, stale snapshot blocks writes, read-only permission blocks writes');
  } finally {globalThis.fetch=originalFetch;JWT.prototype.getAccessToken=originalToken;}
}
testSavePipeline().catch(error=>{console.error(error);process.exitCode=1});
