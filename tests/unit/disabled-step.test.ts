/**
 * @jest-environment jsdom
 *
 * A step marked `disabled: true` does not run. Run against the REAL runtime:
 * the step loop and executeStep are sliced out of background.ts
 * (see background-harness.ts).
 *
 * Why: until 2026-09-16 the runtime ignored `disabled`. Authors had switched
 * off 8 steps in 3 recipes, and every one of them still ran, among them the
 * three Deactivate clicks in okta/07-user-profile-actions.
 */
import { readFileSync } from 'fs';
import { BACKGROUND, chainHarness } from './background-harness.js';

const recipe = (name: string) => JSON.parse(readFileSync(new URL(`../../sites/${name}.payload.json`, import.meta.url), 'utf8'));

const offThenOn = [
  { stepId: 'off', action: 'navigate', url: 'https://example.test/should-not-open', disabled: true },
  { stepId: 'on', action: 'navigate', url: 'https://example.test/after' },
];

describe('disabled steps (real background.ts loop + executeStep)', () => {
  it('a disabled step is skipped, and the chain goes on', async () => {
    const out = await chainHarness().run(offThenOn, { chain: offThenOn });
    expect(out.navigated).toEqual(['https://example.test/after']);
    expect(out.stepResults[0]).toMatchObject({ stepId: 'off', status: 'skipped', disabled: true });
    expect(out.result.success).toBe(true);
  });

  it('`disabled: false` runs the step', async () => {
    const chain = [{ ...offThenOn[0], disabled: false }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.navigated).toEqual(['https://example.test/should-not-open']);
  });

  it('a disabled step inside a branch is skipped too', async () => {
    const chain = [{ stepId: 'g', action: 'assess_state', stateGraph: { nodes: { here: { signals: [{ type: 'element_visible', selector: '#nowhere' }] } } }, expect: { state: 'here' }, onMismatch: 'branch:b' }];
    const branches = { b: { steps: offThenOn } };
    const out = await chainHarness().run(chain, { chain, branches });
    expect(out.navigated).toEqual(['https://example.test/after']);
  });

  it('okta/07-user-profile-actions: none of its disabled Deactivate clicks runs', async () => {
    document.body.innerHTML = '<button>Deactivate</button>';
    const q = recipe('okta/tasks/07-user-profile-actions');
    const off = q.chain.filter((s: any) => s.disabled === true);
    expect(off.map((s: any) => s.stepId)).toEqual(expect.arrayContaining(['s4-deactivate', 's6-deactivate', 's8-deactivate']));
    // The harness does not stub the click page functions, so a step that ran would end in 'error', not 'skipped'.
    const out = await chainHarness().run(off, q);
    expect(out.stepResults.map((r: any) => r.status)).toEqual(off.map(() => 'skipped'));
    expect(out.result.success).toBe(true);
  });

  it('is sensitive to the defect: with the check removed, the disabled step runs', async () => {
    const ignored = BACKGROUND.replace('if (step.disabled === true) {', 'if (false) {');
    expect(ignored).not.toBe(BACKGROUND);
    const out = await chainHarness(ignored).run(offThenOn, { chain: offThenOn });
    expect(out.navigated).toEqual(['https://example.test/should-not-open', 'https://example.test/after']);
  });
});
