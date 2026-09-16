/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://app.yeshid.com/organization/groups/9b1c-44"}
 *
 * State-graph nodes are judged in the order the recipe wrote them. Run against
 * the REAL runtime (background-harness.ts), whose execInTab stub serialises
 * arguments and results the way Chrome does.
 *
 * Why: chrome.scripting.executeScript passes arguments and results through
 * Chromium's base::Value, whose dictionaries sort their keys. Measured inside
 * the live extension on 2026-09-16: a graph whose nodes were written
 * groups-unavailable, groups-available, zeta, alpha, mid arrived in the page as
 * alpha, groups-available, groups-unavailable, mid, zeta; an object returned
 * from the page came back sorted; an array argument kept its order. So
 * PRE_ASSESS_STATE judged nodes alphabetically. On 2026-09-15 q04's two-node
 * guard answered "groups-available" although "groups-unavailable" was written
 * first and held, and q04's `wait_for` on "group-detail" could never pass,
 * because "authenticated" holds on the same page and was judged first.
 */
import { readFileSync } from 'fs';
import { BACKGROUND, chainHarness, sortKeysDeep } from './background-harness.js';

const recipe = (name: string) => JSON.parse(readFileSync(new URL(`../../sites/${name}.payload.json`, import.meta.url), 'utf8'));
const urlNode = (pattern: string) => ({ signals: [{ type: 'url_matches', pattern }] });

describe('the harness serialises executeScript arguments the way Chrome does', () => {
  it('sorts object keys (as measured in the live extension) and keeps arrays in order', () => {
    const graph = { nodes: { 'groups-unavailable': {}, 'groups-available': {}, zeta: {}, alpha: {}, mid: {} } };
    expect(Object.keys(sortKeysDeep(graph).nodes)).toEqual(['alpha', 'groups-available', 'groups-unavailable', 'mid', 'zeta']);
    expect(sortKeysDeep(['zeta', 'alpha', 'mid'])).toEqual(['zeta', 'alpha', 'mid']);
  });
});

describe('assess_state judges nodes in the order written', () => {
  const q04Case = { nodes: { 'groups-unavailable': urlNode('/organization/groups'), 'groups-available': urlNode('yeshid\\.com') } };

  it('reports the first node written that holds: the 2026-09-15 q04 case', async () => {
    const chain = [{ stepId: 'g', action: 'assess_state', stateGraph: q04Case }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.stepResults[0]).toMatchObject({ state: 'groups-unavailable', states: ['groups-unavailable', 'groups-available'] });
  });

  it('keeps the written order for names that sort the other way, in the payload graph too', async () => {
    const stateGraph = { nodes: { zeta: urlNode('yeshid'), mid: urlNode('groups'), alpha: urlNode('app\\.') } };
    const chain = [{ stepId: 'g', action: 'assess_state' }];
    const out = await chainHarness().run(chain, { chain, stateGraph });
    expect(out.stepResults[0]).toMatchObject({ state: 'zeta', states: ['zeta', 'mid', 'alpha'] });
  });

  it('is sensitive to the defect: without the order array, the sorted keys decide', async () => {
    const unordered = BACKGROUND.replace(
      'execInTab(tabId, PRE_ASSESS_STATE, assessArgs(sg))',
      'execInTab(tabId, PRE_ASSESS_STATE, [sg])',
    );
    expect(unordered).not.toBe(BACKGROUND);
    const chain = [{ stepId: 'g', action: 'assess_state', stateGraph: q04Case }];
    const out = await chainHarness(unordered).run(chain, { chain });
    expect(out.stepResults[0]).toMatchObject({ state: 'groups-available', states: ['groups-available', 'groups-unavailable'] });
  });
});

describe('wait_for with a named state judges that node itself', () => {
  const q04 = recipe('yeshid/tasks/q04-group-membership-count');
  const s6 = q04.chain.find((s: any) => s.stepId === 's6');

  it('q04 s6 reaches "group-detail" on a signed-in group page, where "authenticated" is judged first', async () => {
    expect(s6).toMatchObject({ action: 'wait_for', state: 'group-detail' });
    const out = await chainHarness().run([s6], q04);
    expect(out.result.success).toBe(true);
    expect(out.stepResults[0].state).toBe('authenticated');
    expect(out.stepResults[0].states).toEqual(expect.arrayContaining(['authenticated', 'group-detail']));
    expect(out.stepResults[0].durationMs).toBeLessThan(2000);
  });

  it('is sensitive to the defect: comparing with the first node that held, the wait times out', async () => {
    const firstNode = BACKGROUND.replace('stateWaitMatched(step, lastState, r?.holds)', 'stateWaitMatched(step, lastState)');
    expect(firstNode).not.toBe(BACKGROUND);
    const out = await chainHarness(firstNode).run([{ ...s6, timeout: 700 }], q04);
    expect(out.result.error).toBe('wait_for timeout: state "group-detail" (last seen "authenticated")');
  });
});
