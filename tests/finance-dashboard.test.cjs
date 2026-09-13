const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../frontpage/index.html'), 'utf8');
const code = html.slice(html.indexOf('  function parseFinanceRows('), html.indexOf('  function loadFinanceSheet('));
const ctx = vm.createContext({ esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) });
vm.runInContext(code, ctx);
const row = (name, type, total, category = '0', review = '') => [name, type, '', category, '0', '0', '0', '0', total, review];
const fixture = [
  ['2026', '총합', '미지급인건비', '지급인건비', '학생인건비', '재료비', '연구수당', '간접비', '총합'],
  row('', '예산', '1,000'), row('', '이월', '200'), row('', '집행액', '300'), row('전체', '잔액', '700'), row('당해종료', '잔액', '0'),
  row('<script>과제</script>', '최초예산', '900'), row('별칭', '예산', '1,000'), row('집행_2026', '이월', '200', '0', '불일치'),
  row('', '집행액', '300'), row('', '집행예정액', '200'), row('단계종료', '잔액', '700', '-20')
];
test('source totals, overall subtotal and project blocks remain distinct', () => {
  const data = ctx.parseFinanceRows(fixture);
  assert.equal(data.projects.length, 1);
  assert.equal(data.summary.values['잔액'].total, 700);
  assert.equal(data.projects[0].values['잔액'].total, 700);
  assert.equal(data.projects[0].note, '단계종료');
  assert.equal(ctx.financeRate(data.projects[0]), 25);
  assert.equal(data.warnings.length, 2);
});
test('missing or invalid money remains unknown instead of zero', () => {
  const data = ctx.parseFinanceRows([fixture[0], row('', '예산', '#REF!'), row('', '이월', '0')]);
  assert.equal(data.summary.values['예산'].total, null);
  assert.equal(ctx.financeRate(data.summary), null);
  assert.equal(ctx.financeMoney(null), '—');
});
test('sheet labels are escaped and project selection renders source balances', () => {
  const rendered = ctx.financeDashboard({ rows: fixture, title: '<img>', url: 'https://docs.google.com/' }, '0');
  assert.ok(!rendered.includes('<script>과제</script>'));
  assert.ok(rendered.includes('&lt;script&gt;과제&lt;/script&gt;'));
  assert.ok(rendered.includes('25.0%'));
  assert.ok(rendered.includes('700원'));
  assert.ok(rendered.includes(' selected'));
  assert.ok(ctx.financeDashboard({ rows: [], title: '', url: '' }, '').includes('등록된 연구비 내역이 없습니다'));
});
