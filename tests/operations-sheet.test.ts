import assert from 'node:assert/strict';
import { parseOperationsRows } from '../src/lib/operationsSheet';
const data = parseOperationsRows([
 ['업데이트', '2026-1-1'], ['팀', '업무', '팀장', '주요업무', '팀원'],
 ['총무', '전산', '팀장A', '서버운영', '담당A', '자료', '내용', 'private-note'],
 ['', '', '', '', '담당B'],
 ['', '', '', '데이터관리', '', '', ''],
 [], ['실험', '운영', '', '실험운영', '담당C']
], [[], ['2025/8/18'], ['검토필요']]);
assert.equal(data.tasks.length, 3);
assert.deepEqual(data.tasks[0].members, ['담당A', '담당B']);
assert.equal(data.tasks[1].team, '총무');
assert.equal(data.tasks[1].leader, '팀장A');
assert.deepEqual(data.tasks[1].members, []);
assert.equal(data.tasks[2].leader, '');
assert.equal(data.tasks[0].review, '검토필요');
assert.equal(data.reviewLabel, '2025/8/18');
assert.ok(!JSON.stringify(data).includes('private-note'));
console.log('PASS: team grouping, continuation members, unassigned values, review rows, private column exclusion');
