import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'soma-automation-'));
process.env.SOMA_AUTOMATION_LOG_DIR = dir;
const { linesForChain, logChainSteps, hostOf } = await import('./automation-log.js');
const read = () => readFileSync(join(dir, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const chain = {
  site: 'app.yeshid.com',
  durationMs: 3000,
  stepResults: [
    { stepId: 's1', action: 'navigate', status: 'ok', url: 'https://app.yeshid.com/people?token=SECRET', durationMs: 1000 },
    { stepId: 's2', action: 'comment', status: 'skipped', durationMs: 0 },
    { stepId: 's3', action: 'type', status: 'ok', value: 'typed secret', selector: '#pw', durationMs: 500 },
    { stepId: 's4', action: 'click', status: 'error', error: 'nope', durationMs: 1500 },
  ],
};

test('one line per executed step; skipped steps omitted', () => {
  const lines = linesForChain(chain, Date.parse('2026-09-17T12:00:03.000Z'));
  assert.deepEqual(lines.map((l) => l.kind), ['step:navigate', 'step:type', 'step:click']);
  assert.deepEqual(lines.map((l) => l.ts), ['2026-09-17T12:00:00.000Z', '2026-09-17T12:00:01.000Z', '2026-09-17T12:00:01.500Z']);
  assert.equal(lines[2].ok, false);
  assert.ok(lines.every((l) => l.actor === 'yeshie' && l.target === 'app.yeshid.com'));
});

test('no secrets, values, selectors, paths or query strings', () => {
  const text = JSON.stringify(linesForChain(chain));
  for (const bad of ['SECRET', 'typed secret', '#pw', '/people']) assert.ok(!text.includes(bad), bad);
});

test('hostOf handles bare domains, base_urls and junk', () => {
  assert.equal(hostOf('github.com'), 'github.com');
  assert.equal(hostOf('https://User@Example.com:8443/x?y=1'), 'example.com');
  assert.equal(hostOf('unknown'), undefined);
  assert.equal(hostOf(undefined), undefined);
});

test('logChainSteps appends and rotates a previous day file', () => {
  writeFileSync(join(dir, 'actions.jsonl'), JSON.stringify({ ts: '2020-01-01T00:00:00.000Z', actor: 'x', kind: 'k' }) + '\n');
  assert.equal(logChainSteps(chain), 3);
  assert.ok(existsSync(join(dir, 'actions-2020-01-01.jsonl')));
  assert.equal(read().length, 3);
});

test('never throws on garbage or when disabled', () => {
  assert.equal(logChainSteps(null), 0);
  assert.equal(logChainSteps({ stepResults: 'nope' }), 0);
  process.env.SOMA_AUTOMATION_LOG = '0';
  assert.equal(logChainSteps(chain), 0);
  delete process.env.SOMA_AUTOMATION_LOG;
  assert.ok(readdirSync(dir).length >= 1);
});
