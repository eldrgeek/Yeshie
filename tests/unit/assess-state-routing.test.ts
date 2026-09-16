/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://app.yeshid.com/access/grid"}
 *
 * assess_state routing, run against the REAL runtime: the step loop,
 * executeStep and routeAssessState are sliced out of background.ts
 * (see background-harness.ts).
 *
 * Why: until 2026-09-16 the loop honoured only onMatch "exit_success" and
 * onMismatch "branch:<name>". It read every other value as a branch it could
 * not find and ran on, so the sign-in guards in 19 recipes
 * (onMismatch "exit_with_error:not-authenticated") never fired, and neither did
 * onMatch "exit_with_error:…", onMatch {"auth_required": "exit_fail"} or
 * onMismatch "report_failure". Also, `expect.state` was compared with the first
 * node that held, so node order decided the answer, and `expect.state_any` was
 * not read at all.
 */
import { readFileSync } from 'fs';
import { BACKGROUND, chainHarness } from './background-harness.js';

const recipe = (name: string) => JSON.parse(readFileSync(new URL(`../../sites/${name}.payload.json`, import.meta.url), 'utf8'));
const after = { stepId: 'after', action: 'navigate', url: 'https://example.test/after' };

/** `access-grid` is written first, as YeshID's payload graphs sort it: it holds on /access/grid. */
const authGraph = {
  nodes: {
    'access-grid': { signals: [{ type: 'url_matches', pattern: '/access/grid' }] },
    authenticated: { signals: [{ type: 'url_matches', pattern: 'app\\.yeshid\\.com' }, { type: 'url_not_matches', pattern: '/login' }] },
    unauthenticated: { signals: [{ type: 'url_matches', pattern: '/login' }] },
  },
};
const guard = (extra: Record<string, unknown> = {}) => ({ stepId: 'g', action: 'assess_state', stateGraph: authGraph, expect: { state: 'authenticated' }, ...extra });
const goTo = (path: string) => history.replaceState({}, '', path);

beforeEach(() => goTo('/access/grid'));

describe('onMismatch (real background.ts loop)', () => {
  it('"exit_with_error:<reason>" stops the chain, naming the expected state, the state seen and the reason', async () => {
    goTo('/login');
    const chain = [guard({ onMismatch: 'exit_with_error:not-authenticated' }), after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.navigated).toEqual([]);
    expect(out.result.success).toBe(false);
    expect(out.result.error).toBe('assess_state [g]: expected state "authenticated", saw "unauthenticated" (not-authenticated)');
  });

  it('"report_failure" stops the chain, and `expect.state_any` is read', async () => {
    const graph = { nodes: { 'people-list': { signals: [{ type: 'url_matches', pattern: '/organization/people$' }] }, 'onboard-workflow': { signals: [{ type: 'url_matches', pattern: '/workflows/' }] } } };
    const step = { stepId: 'v', action: 'assess_state', stateGraph: graph, expect: { state_any: ['people-list', 'onboard-workflow'] }, onMismatch: 'report_failure' };
    const miss = await chainHarness().run([step, after], { chain: [step, after] });
    expect(miss.result.error).toBe('assess_state [v]: expected state "people-list" or "onboard-workflow", saw "unknown"');
    expect(miss.navigated).toEqual([]);
    goTo('/workflows/3f2a-77');
    const hit = await chainHarness().run([step, after], { chain: [step, after] });
    expect(hit.result.success).toBe(true);
    expect(hit.stepResults[0]).toMatchObject({ matched: true, states: ['onboard-workflow'] });
  });

  it('"continue" runs on', async () => {
    goTo('/login');
    const chain = [guard({ onMismatch: 'continue' }), after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['g', 'after']);
    expect(out.result.success).toBe(true);
  });

  it('"branch:<name>" runs that branch, and its failure stops the chain', async () => {
    goTo('/login');
    const chain = [guard({ onMismatch: 'branch:not-signed-in' }), after];
    const branches = { 'not-signed-in': { steps: [{ stepId: 'b1', action: 'assert', condition: 'false', message: 'Sign in first.' }] } };
    const out = await chainHarness().run(chain, { chain, branches });
    expect(out.executed).toEqual(['g', 'b1']);
    expect(out.result.error).toMatch(/^Assert failed \[b1\]: Sign in first\./);
  });

  it('a branch that payload.branches does not define still continues, as before', async () => {
    goTo('/login');
    const chain = [guard({ onMismatch: 'branch:nowhere' }), after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['g', 'after']);
    expect(out.result.success).toBe(true);
  });

  it('an unknown value fails the step instead of passing silently', async () => {
    goTo('/login');
    const chain = [guard({ onMismatch: 'retry_later' }), after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.result.error).toBe('assess_state [g]: unsupported routing "retry_later"');
  });
});

describe('onMatch (real background.ts loop)', () => {
  const loginGraph = { nodes: { auth_required: { signals: [{ type: 'url_matches', pattern: '/login' }] } } };

  it('"exit_with_error:<reason>" with no `expect` stops the chain when the page is in a state of the graph', async () => {
    goTo('/login');
    const step = { stepId: 's3', action: 'assess_state', stateGraph: loginGraph, onMatch: 'exit_with_error:auth_required — user must be logged in', onMismatch: 'continue' };
    const out = await chainHarness().run([step, after], { chain: [step, after] });
    expect(out.navigated).toEqual([]);
    expect(out.result.error).toBe('assess_state [s3]: the page is in state "auth_required" (auth_required — user must be logged in)');
  });

  it('… and runs on when the page is in none of them', async () => {
    const step = { stepId: 's3', action: 'assess_state', stateGraph: loginGraph, onMatch: 'exit_with_error:auth_required — user must be logged in', onMismatch: 'continue' };
    const out = await chainHarness().run([step, after], { chain: [step, after] });
    expect(out.executed).toEqual(['s3', 'after']);
    expect(out.result.success).toBe(true);
  });

  it('a map of state to outcome stops on the mapped state and runs on otherwise (docs/mail recipes)', async () => {
    const graph = { nodes: { auth_required: { signals: [{ type: 'url_matches', pattern: '/login' }] }, doc_open: { signals: [{ type: 'url_matches', pattern: '/document/' }] } } };
    const step = { stepId: 's3', action: 'assess_state', stateGraph: graph, onMatch: { auth_required: 'exit_fail' }, onMismatch: 'continue' };
    goTo('/login');
    const stopped = await chainHarness().run([step, after], { chain: [step, after] });
    expect(stopped.result.error).toBe('assess_state [s3]: the page is in state "auth_required"');
    goTo('/document/d/1abc/edit');
    const ran = await chainHarness().run([step, after], { chain: [step, after] });
    expect(ran.executed).toEqual(['s3', 'after']);
    expect(ran.result.success).toBe(true);
  });

  it('"exit_success" still ends the chain successfully when the expected state holds (substack 01-login)', async () => {
    const chain = [guard({ onMatch: 'exit_success', onMismatch: 'branch:sign-in' }), after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.result.success).toBe(true);
  });

  it('an unknown value fails the step', async () => {
    goTo('/login');
    const step = { stepId: 's3', action: 'assess_state', stateGraph: loginGraph, onMatch: 'celebrate' };
    const out = await chainHarness().run([step, after], { chain: [step, after] });
    expect(out.result.error).toBe('assess_state [s3]: unsupported routing "celebrate"');
  });
});

describe('`expect` is judged by the expected node itself, not by node order', () => {
  it('a signed-in page on /access/grid is "authenticated", although "access-grid" is written first and also holds', async () => {
    const chain = [guard({ onMismatch: 'exit_with_error:not-authenticated' }), after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['g', 'after']);
    expect(out.stepResults[0]).toMatchObject({ state: 'access-grid', matched: true, states: ['access-grid', 'authenticated'] });
  });
});

describe('the YeshID recipes as written', () => {
  const upToGuard = (q: any) => q.chain.slice(0, q.chain.findIndex((s: any) => s.stepId === 's2-auth') + 1);

  it('12-view-access-grid: the guard runs after the navigate, passes signed in, and stops signed out', async () => {
    const q = recipe('yeshid/tasks/12-view-access-grid');
    const chain = upToGuard(q);
    expect(chain.map((s: any) => s.stepId)).toEqual(['s2', 's2-auth']);
    const signedIn = await chainHarness().run(chain, q);
    expect(signedIn.result.success).toBe(true);
    const signedOut = await chainHarness().run(chain, q, { onNavigate: () => goTo('/login') });
    expect(signedOut.result.error).toMatch(/^assess_state \[s2-auth\]: expected state "authenticated", saw ".*" \(not-authenticated\)$/);
  });

  it('17-view-org-settings: its graph had no "authenticated" node, so the guard carries one', async () => {
    const q = recipe('yeshid/tasks/17-view-org-settings');
    const chain = upToGuard(q);
    expect(chain[1].stateGraph.nodes.authenticated).toBeDefined();
    expect((await chainHarness().run(chain, q)).result.success).toBe(true);
    const signedOut = await chainHarness().run(chain, q, { onNavigate: () => goTo('/login') });
    expect(signedOut.result.error).toMatch(/\(not-authenticated\)$/);
  });

  it('01-user-add s8b: a submit that does not land on the people list or a workflow now fails the run', async () => {
    const q = recipe('yeshid/tasks/01-user-add');
    const s8b = q.chain.find((s: any) => s.stepId === 's8b');
    goTo('/organization/people');
    expect((await chainHarness().run([s8b, after], q)).result.success).toBe(true);
    goTo('/organization/people/new');
    const out = await chainHarness().run([s8b, after], q);
    expect(out.navigated).toEqual([]);
    expect(out.result.error).toMatch(/^assess_state \[s8b\]: expected state "people-list" or "onboard-workflow", saw "/);
  });
});

describe('sensitivity: the tests fail if the old behaviour returns', () => {
  it('with the old routing restored, an exit_with_error guard lets the chain run on', async () => {
    const oldRouting = BACKGROUND.replace(
      "const route = step.action === 'assess_state' && res.status === 'ok' ? routeAssessState(step, res) : { kind: 'continue' };",
      "const route = step.action === 'assess_state' && res.status === 'ok' ? (res.matched && step.onMatch === 'exit_success' ? { kind: 'exit_success' } : (!res.matched && step.onMismatch ? { kind: 'branch', name: String(step.onMismatch).replace('branch:', '') } : { kind: 'continue' })) : { kind: 'continue' };",
    );
    expect(oldRouting).not.toBe(BACKGROUND);
    goTo('/login');
    const chain = [guard({ onMismatch: 'exit_with_error:not-authenticated' }), after];
    const out = await chainHarness(oldRouting).run(chain, { chain });
    expect(out.executed).toEqual(['g', 'after']);
    expect(out.result.success).toBe(true);
  });

  it('with the old first-node matching restored, a signed-in /access/grid page fails the "authenticated" guard', async () => {
    const oldMatching = BACKGROUND.replace(
      "const matched = expected.length === 0 || expected.some((n: string) => r?.holds?.[n] === true);",
      'const matched = !step.expect?.state || r?.state === step.expect.state;',
    );
    expect(oldMatching).not.toBe(BACKGROUND);
    const chain = [guard({ onMismatch: 'exit_with_error:not-authenticated' }), after];
    const out = await chainHarness(oldMatching).run(chain, { chain });
    expect(out.executed).toEqual(['g']);
    expect(out.result.error).toMatch(/saw "access-grid"/);
  });
});
