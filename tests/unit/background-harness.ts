/**
 * Shared harness for chain-level tests that run the REAL runtime code: the
 * chain runner's step loop, executeStep and the functions they call are sliced
 * out of packages/extension/src/entrypoints/background.ts and run with the
 * Chrome APIs stubbed. execInTab runs page functions directly against jsdom,
 * so a test file that uses this harness needs `@jest-environment jsdom`.
 *
 * Used by assert-chain.test.ts and unsupported-chain.test.ts.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable } from '../../src/wait-for.js';
import { assertFailureMessage, assertNeedsPage, evaluateAssert } from '../../src/assert-step.js';
import { createSurpriseEvidence } from '../../src/runtime-contract.js';

export const BACKGROUND = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');

/** Slice a two-space-indented function out of background.ts (it ends at the first "\n  }\n"). */
export function sliceFn(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`not found in background.ts: ${header}`);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end + 4);
}

/** Slice the chain runner's step loop: `try { for (...) {...} ... } catch {...}` without its finally. */
export function sliceLoop(src: string): string {
  const header = '    try {\n      for (let i = 0; i < chain.length; i++) {';
  const start = src.indexOf(header);
  if (start < 0 || src.indexOf(header, start + 1) >= 0) throw new Error('chain loop header not found exactly once');
  const end = src.indexOf('\n    } finally {', start);
  return src.slice(start, end) + '\n    }\n';
}

export type ChainRun = { executed: string[]; result: any; stepResults: any[]; navigated: string[] };

export type Harness = {
  run: (chain: any[], payload?: any) => Promise<ChainRun>;
};

export function chainHarness(source = BACKGROUND): Harness {
  const fns = [
    '  function interpolate(',
    '  function haltsChain(',
    '  function PRE_ASSERT_SNAPSHOT(',
    '  function PRE_ASSESS_STATE(',
    '  function PRE_MATCH_WAIT_FOR(',
    '  function PRE_CLEAR_FIELD(',
    '  function PRE_SCROLL(',
    '  async function executeStep(',
  ].map((h) => sliceFn(source, h)).join('\n');
  const body = `
    ${fns}
    const __realExecuteStep = executeStep;
    return async function runChain(chain, payload) {
      const executed = [];
      const navigated = [];
      navigateAndWait = async (_tabId, url) => { navigated.push(url); return { ok: true }; };
      const runId = 'test-run', tabId = 7, t0 = Date.now();
      const run = { runId, payload, params: {}, tabId, abstractTargets: payload.abstractTargets || {}, buffer: {}, stepIndex: 0, status: 'running', result: null, stepResults: [], resolvedTargets: [] };
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
    PRE_RESOLVE_TARGET: (t: any) => (t?.cachedSelector ? { found: true, selector: t.cachedSelector, resolvedVia: 'cached' } : { found: false }),
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
