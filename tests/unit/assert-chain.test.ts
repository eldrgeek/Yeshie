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
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable } from '../../src/wait-for.js';
import { assertFailureMessage, assertNeedsPage, evaluateAssert } from '../../src/assert-step.js';
import { createSurpriseEvidence } from '../../src/runtime-contract.js';

const BACKGROUND = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');

/** Slice a two-space-indented function out of background.ts (it ends at the first "\n  }\n"). */
function sliceFn(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`not found in background.ts: ${header}`);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end + 4);
}

/** Slice the chain runner's step loop: `try { for (...) {...} ... } catch {...}` without its finally. */
function sliceLoop(src: string): string {
  const header = '    try {\n      for (let i = 0; i < chain.length; i++) {';
  const start = src.indexOf(header);
  if (start < 0 || src.indexOf(header, start + 1) >= 0) throw new Error('chain loop header not found exactly once');
  const end = src.indexOf('\n    } finally {', start);
  return src.slice(start, end) + '\n    }\n';
}

type Harness = {
  run: (chain: any[], payload?: any) => Promise<{ executed: string[]; result: any; stepResults: any[]; navigated: string[] }>;
};

function harness(source = BACKGROUND): Harness {
  const fns = [
    sliceFn(source, '  function interpolate('),
    sliceFn(source, '  function PRE_ASSERT_SNAPSHOT('),
    sliceFn(source, '  function PRE_ASSESS_STATE('),
    sliceFn(source, '  function PRE_MATCH_WAIT_FOR('),
    sliceFn(source, '  async function executeStep('),
  ].join('\n');
  const body = `
    ${fns}
    const __realExecuteStep = executeStep;
    return async function runChain(chain, payload) {
      const executed = [];
      const navigated = [];
      navigateAndWait = async (_tabId, url) => { navigated.push(url); return { ok: true }; };
      const runId = 'test-run', tabId = 7, t0 = Date.now();
      const run = { runId, payload, params: {}, tabId, abstractTargets: {}, buffer: {}, stepIndex: 0, status: 'running', result: null, stepResults: [], resolvedTargets: [] };
      const executeStep = (step, r) => { executed.push(step.stepId); return __realExecuteStep(step, r); };
      // The loop ends a failed chain with a bare \`return\`, so it runs in its own function.
      await (async () => {
      ${sliceLoop(source)}
      })();
      return { executed, navigated, result: run.result, stepResults: run.stepResults };
    };`;
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    // shared modules, exactly as background.ts imports them
    ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable,
    assertFailureMessage, assertNeedsPage, evaluateAssert, createSurpriseEvidence,
    // Chrome/runtime stubs
    execInTab: async (_tabId: number, fn: (...a: any[]) => any, args: any[] = []) => fn(...args),
    resolveFrameId: async () => null,
    isLoginUrl: () => false,
    abortFlags: new Map(),
    sendOverlay: () => {},
    buildChainResult: (run: any, _t0: number, success: boolean, error?: string) => ({ success, error: error ?? null, stepResults: run.stepResults }),
    chrome: { storage: { session: { set: async () => {} } }, tabs: { get: async () => ({ url: 'http://localhost/' }) } },
    authConfig: { baseUrl: 'http://localhost/' },
    DEFAULT_BASE_URL: 'http://localhost/',
    waitForAuth: async () => ({ authenticated: true }),
    navigateAndWait: null,
  };
  const names = Object.keys(deps);
  // `navigateAndWait` is reassigned per run, so it is passed as a mutable parameter.
  const factory = new Function(...names, js);
  const runChain = factory(...names.map((n) => deps[n]));
  return { run: (chain, payload = {}) => runChain(chain, payload) };
}

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
