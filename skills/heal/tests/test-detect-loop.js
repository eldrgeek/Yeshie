// test-detect-loop.js — unit tests for detect-loop.sh
import { execSync, spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const SCRIPT = join(process.cwd(), 'skills/heal/detect-loop.sh');
let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log(`ok - ${desc}`); passed++; }
  else { console.log(`not ok - ${desc}`); failed++; }
}

function makePayload(healedAt) {
  const tmp = `/tmp/test-payload-${Date.now()}.json`;
  const obj = healedAt ? { _heal: { healedAt } } : {};
  writeFileSync(tmp, JSON.stringify(obj));
  return tmp;
}

function runScript(payloadPath) {
  const result = spawnSync('bash', [SCRIPT, payloadPath], { encoding: 'utf8' });
  return result.status;
}

// 5 min ago → loop detected (exit 1)
const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const p1 = makePayload(recent);
ok('5-min-old heal → exit 1 (loop detected)', runScript(p1) === 1);
unlinkSync(p1);

// 20 min ago → no loop (exit 0)
const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
const p2 = makePayload(old);
ok('20-min-old heal → exit 0 (no loop)', runScript(p2) === 0);
unlinkSync(p2);

// No _heal key → exit 0
const p3 = makePayload(null);
ok('no _heal key → exit 0', runScript(p3) === 0);
unlinkSync(p3);

export const results = { passed, failed };
console.log(`\n# detect-loop: ${passed} passed, ${failed} failed`);
