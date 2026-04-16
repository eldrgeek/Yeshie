// test-diff-maps.js — unit tests for diff-maps.js
// Exit code convention: L1→0, L2→2, L3→3
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log(`ok - ${desc}`); passed++; }
  else { console.log(`not ok - ${desc}`); failed++; }
}

function makeMap(pages) {
  const tmp = `/tmp/test-map-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(tmp, JSON.stringify({ pages }));
  return tmp;
}

function runDiff(oldPath, newPath) {
  const r = spawnSync('node', ['skills/heal/diff-maps.js', oldPath, newPath], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch {}
  return { status: r.status, json, stdout: r.stdout };
}

// L1: selector drift → exit 0, verdict L1
const oldMap1 = makeMap({
  '/organization/people': {
    fields: [
      { label: 'First Name', selector: 'input[aria-label="First Name"]', required: true },
      { label: 'Last Name',  selector: 'input[aria-label="Last Name"]',  required: true }
    ]
  }
});
const newMap1 = makeMap({
  '/organization/people': {
    fields: [
      { label: 'First Name*', selector: 'input[aria-label="First Name*"]', required: true },
      { label: 'Last Name*',  selector: 'input[aria-label="Last Name*"]',  required: true }
    ]
  }
});
const r1 = runDiff(oldMap1, newMap1);
ok('L1: selector drift → exit 0', r1.status === 0);
ok('L1: verdict is L1', r1.json?.verdict === 'L1');
unlinkSync(oldMap1); unlinkSync(newMap1);

// L2: one required field removed → exit 2, verdict L2
const oldMap2 = makeMap({
  '/organization/people': {
    fields: [
      { label: 'First Name', selector: 'input[aria-label="First Name"]', required: true },
      { label: 'Recovery Email', selector: 'input[aria-label="Recovery Email"]', required: true }
    ]
  }
});
const newMap2 = makeMap({
  '/organization/people': {
    fields: [
      { label: 'First Name', selector: 'input[aria-label="First Name"]', required: true }
      // Recovery Email gone
    ]
  }
});
const r2 = runDiff(oldMap2, newMap2);
ok('L2: required field removed → exit 2', r2.status === 2);
ok('L2: verdict is L2', r2.json?.verdict === 'L2');
unlinkSync(oldMap2); unlinkSync(newMap2);

// L3: multiple required fields gone → exit 3, verdict L3
const oldMap3 = makeMap({
  '/organization/people': {
    fields: [
      { label: 'First Name', selector: 'input[aria-label="First Name"]', required: true },
      { label: 'Last Name', selector: 'input[aria-label="Last Name"]', required: true },
      { label: 'Email', selector: 'input[aria-label="Email"]', required: true }
    ]
  }
});
const newMap3 = makeMap({
  '/organization/people': { fields: [] }
});
const r3 = runDiff(oldMap3, newMap3);
ok('L3: all fields removed → exit 3', r3.status === 3);
ok('L3: verdict is L3', r3.json?.verdict === 'L3');
unlinkSync(oldMap3); unlinkSync(newMap3);

// Identical maps → exit 0, verdict L1 (no change)
const mapPath = makeMap({ '/org/people': { fields: [{ label: 'First Name', selector: 'input', required: true }] } });
const r4 = runDiff(mapPath, mapPath);
ok('identical maps → exit 0', r4.status === 0);
unlinkSync(mapPath);

export const results = { passed, failed };
console.log(`\n# diff-maps: ${passed} passed, ${failed} failed`);
