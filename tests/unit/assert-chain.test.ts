/**
 * @jest-environment jsdom
 *
 * Chain-level regression tests for `assert` and state-graph `wait_for`, run
 * against the REAL runtime code: the step loop and executeStep are sliced out
 * of packages/extension/src/entrypoints/background.ts and executed with the
 * Chrome APIs stubbed. execInTab runs page functions directly against jsdom.
 *
 * Why chain-level: the 2026-09-13 defect was not in one step. The generic
 * `condition` gate in executeStep skipped `{action:"assert", condition:"false"}`
 * as "condition falsy", so the step reported 'skipped' and the loop ran on
 * into the destructive steps the guard was written to block.
 *
 * `requires` guards (2026-09-15) are tested here for the same reason: what
 * matters is that a failed guard stops the steps after it.
 */
// The harness (slicing + stubs) is shared with unsupported-chain.test.ts.
import { BACKGROUND, chainHarness as harness } from './background-harness.js';

const destructive = [
  { stepId: 'guard', action: 'assert', condition: 'false', message: 'IRREVERSIBLE: never execute in testing.' },
  { stepId: 'danger', action: 'navigate', url: 'https://example.test/settings/delete' },
];

describe('assert halts the chain (real background.ts loop + executeStep)', () => {
  it('stops at `assert false`: no later step runs and the chain fails with the guard message', async () => {
    const out = await harness().run(destructive, { chain: destructive });
    expect(out.executed).toEqual(['guard']);
    expect(out.navigated).toEqual([]);
    expect(out.stepResults).toHaveLength(1);
    expect(out.stepResults[0].status).toBe('error');
    expect(out.result.success).toBe(false);
    expect(out.result.error).toMatch(/^Assert failed \[guard\]: IRREVERSIBLE: never execute in testing\./);
  });

  it('continues past an assert that holds', async () => {
    const chain = [{ stepId: 'ok', action: 'assert', condition: 'true' }, destructive[1]];
    const out = await harness().run(chain, { chain });
    expect(out.executed).toEqual(['ok', 'danger']);
    expect(out.navigated).toEqual(['https://example.test/settings/delete']);
    expect(out.result.success).toBe(true);
  });

  it('halts on an assert that declares nothing to check (fail closed)', async () => {
    const chain = [{ stepId: 's3', action: 'assert', note: 'UNVERIFIED gate' }, destructive[1]];
    const out = await harness().run(chain, { chain });
    expect(out.executed).toEqual(['s3']);
    expect(out.result.error).toMatch(/declares nothing to check/);
  });

  it('checks selector text in the page', async () => {
    document.body.innerHTML = '<h1 id="t">Delete repository</h1>';
    const pass = [{ stepId: 'a', action: 'assert', selector: '#t', value: 'Delete' }];
    expect((await harness().run(pass, { chain: pass })).result.success).toBe(true);
    const fail = [{ stepId: 'b', action: 'assert', selector: '#t', value: 'Archive' }, destructive[1]];
    const out = await harness().run(fail, { chain: fail });
    expect(out.executed).toEqual(['b']);
    expect(out.result.error).toMatch(/expected "Archive" in "Delete repository"/);
  });

  it('halts inside a branch too (yeshid not-authenticated guard)', async () => {
    document.body.innerHTML = '';
    const payload = {
      stateGraph: { nodes: { authenticated: { signals: [{ type: 'element_visible', selector: '#app' }] } } },
      branches: { 'not-authenticated': { steps: [{ stepId: 'b1', action: 'assert', condition: 'false', message: 'Not authenticated.' }] } },
    };
    const chain = [{ stepId: 's0', action: 'assess_state', expect: { state: 'authenticated' }, onMismatch: 'branch:not-authenticated' }, destructive[1]];
    const out = await harness().run(chain, { ...payload, chain });
    expect(out.navigated).toEqual([]);
    expect(out.result.success).toBe(false);
    expect(out.result.error).toMatch(/Not authenticated/);
  });

  it('is sensitive to the defect: with the old condition gate restored, the chain runs on past the guard', async () => {
    const broken = BACKGROUND.replace("if (step.condition && a !== 'assert') {", 'if (step.condition) {');
    expect(broken).not.toBe(BACKGROUND);
    const out = await harness(broken).run(destructive, { chain: destructive });
    expect(out.executed).toEqual(['guard', 'danger']);
    expect(out.navigated).toEqual(['https://example.test/settings/delete']);
  });
});

describe('assert requires: runtime feature guards (real background.ts loop + executeStep)', () => {
  const guard = (requires: unknown, extra: Record<string, unknown> = {}) =>
    ({ stepId: 'g', action: 'assert', requires, message: 'needs a newer build', ...extra });

  it('passes when the build lists every named feature, and the chain runs on', async () => {
    const chain = [guard(['within_row.cells', 'select']), destructive[1]];
    const out = await harness().run(chain, { chain });
    expect(out.executed).toEqual(['g', 'danger']);
    expect(out.result.success).toBe(true);
  });

  it('halts when the build lacks a named feature', async () => {
    const chain = [guard(['within_row.cells', 'no.such.feature']), destructive[1]];
    const out = await harness().run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.navigated).toEqual([]);
    expect(out.result.error).toBe('Assert failed [g]: needs a newer build (this build lacks no.such.feature (it has select, within_row, within_row.cells))');
  });

  it('halts when requires shares its assert with another check', async () => {
    const chain = [guard(['select'], { url_pattern: '.*' }), destructive[1]];
    const out = await harness().run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.result.error).toMatch(/requires must be the only check in its assert/);
  });

  it('halts on a requires that names no feature', async () => {
    for (const bad of [[], [''], [3], null]) {
      const chain = [guard(bad), destructive[1]];
      const out = await harness().run(chain, { chain });
      expect({ bad, executed: out.executed }).toEqual({ bad, executed: ['g'] });
      expect(out.result.error).toMatch(/requires must name one or more features/);
    }
  });

  // A build from before `requires` existed ignores the field. That build is
  // simulated here by removing the field before the real evaluateAssert sees it.
  const UNAWARE = BACKGROUND.replace(
    'evaluateAssert(step, snapshot || {}, I, { features: RUNTIME_FEATURES })',
    "evaluateAssert(Object.fromEntries(Object.entries(step).filter(([k]) => k !== 'requires')), snapshot || {}, I)",
  );

  it('stops a build that predates requires, because the guard alone leaves it nothing to check', async () => {
    expect(UNAWARE).not.toBe(BACKGROUND);
    const chain = [guard(['within_row.cells']), destructive[1]];
    const out = await harness(UNAWARE).run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.navigated).toEqual([]);
    expect(out.result.error).toMatch(/declares nothing to check/);
  });

  it('shows why requires must stand alone: beside a url_pattern, that build passes the guard and runs on', async () => {
    const chain = [guard(['within_row.cells'], { url_pattern: '.*' }), destructive[1]];
    const out = await harness(UNAWARE).run(chain, { chain });
    expect(out.executed).toEqual(['g', 'danger']);
    expect(out.navigated).toEqual(['https://example.test/settings/delete']);
  });
});

describe('wait_for with a state graph (real background.ts executeStep)', () => {
  const graph = { nodes: { ready: { signals: [{ type: 'element_visible', selector: '#ready' }] } } };

  it('matches a named state from the payload graph once the page reaches it', async () => {
    document.body.innerHTML = '';
    setTimeout(() => { document.body.innerHTML = '<div id="ready"></div>'; }, 150);
    const chain = [{ stepId: 'w', action: 'wait_for', state: 'ready', timeout: 3000 }];
    const out = await harness().run(chain, { stateGraph: graph, chain });
    expect(out.stepResults[0]).toMatchObject({ status: 'ok', state: 'ready' });
    expect(out.stepResults[0].durationMs).toBeLessThan(2500);
  });

  it('matches an inline step graph (the shape that used to throw in the page)', async () => {
    document.body.innerHTML = '<div id="ready"></div>';
    const chain = [{ stepId: 'w', action: 'wait_for', stateGraph: graph, expect: { state: 'ready' }, timeout: 3000 }];
    const out = await harness().run(chain, { chain });
    expect(out.stepResults[0]).toMatchObject({ status: 'ok', state: 'ready' });
  });

  it('times out with the last seen state when the page never gets there', async () => {
    document.body.innerHTML = '';
    const chain = [{ stepId: 'w', action: 'wait_for', state: { name: 'ready' }, timeout: 600 }];
    const out = await harness().run(chain, { stateGraph: graph, chain });
    expect(out.stepResults[0].status).toBe('error');
    expect(out.result.error).toBe('wait_for timeout: state "ready" (last seen "unknown")');
  });

  it('fails at once when a named state has no graph to judge it by', async () => {
    const chain = [{ stepId: 'w', action: 'wait_for', state: 'ready', timeout: 5000 }];
    const out = await harness().run(chain, { chain });
    expect(out.result.error).toBe('wait_for state "ready": no stateGraph in the step or payload');
    expect(out.stepResults[0].durationMs).toBeLessThan(1000);
  });
});
