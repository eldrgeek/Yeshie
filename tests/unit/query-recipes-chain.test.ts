/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://app.yeshid.com/organization/people"}
 *
 * The YeshID query recipes q01, q02 and q04, run as written (their JSON from
 * sites/yeshid/tasks) through the REAL runtime: the step loop and executeStep
 * are sliced out of background.ts (background-harness.ts). Each navigate puts
 * the page for its URL into jsdom, built the way YeshID renders a list: a
 * Vuetify table and its pagination footer, "Items per page:10 1-10 of 28".
 *
 * Why: until 2026-09-15 these recipes read the footers with `perceive`, which
 * ignores `selector` and stores a page summary, and they ended in `respond`,
 * which the runtime did not have. Their auth guard used an onMismatch the
 * runtime never implemented, so it never fired.
 */
import { readFileSync } from 'fs';
import { chainHarness } from './background-harness.js';

const recipe = (name: string) => JSON.parse(readFileSync(new URL(`../../sites/yeshid/tasks/${name}.payload.json`, import.meta.url), 'utf8'));

/** A YeshID list page: the table body (or "No data available") and the pagination footer. */
function listPage(total: number, rows: string[] = []): void {
  const body = rows.length ? rows.map((r) => `<tr><td>${r}</td></tr>`).join('') : '<tr><td>No data available</td></tr>';
  const range = total ? `1-${Math.min(total, 10)}` : '0-0';
  document.body.innerHTML = `<div class="v-data-table"><table><tbody>${body}</tbody></table><div class="v-data-table-footer">Items per page:10 ${range} of ${total}</div></div>`;
}

beforeEach(() => { history.replaceState({}, '', '/organization/people'); });

describe('q01-count-by-status (real loop, real recipe)', () => {
  const totals: Record<string, number> = { ACTIVE: 28, DEACTIVATED: 3, STAGED_OFFBOARDING: 0 };
  const onNavigate = (url: string) => {
    const status = /status=(\w+)/.exec(url)?.[1];
    listPage(status ? totals[status] : 31);
  };

  it('answers with the four counts, read from the footers', async () => {
    const q = recipe('q01-count-by-status');
    const out = await chainHarness().run(q.chain, q, { onNavigate });
    expect(out.result.error).toBeNull();
    expect(out.result.success).toBe(true);
    expect(out.buffer.response).toEqual({ active: 28, deactivated: 3, staged_offboarding: 0, total: 31 });
    expect(out.navigated).toEqual([
      'https://app.yeshid.com/organization/people?filters=status=ACTIVE',
      'https://app.yeshid.com/organization/people?filters=status=DEACTIVATED',
      'https://app.yeshid.com/organization/people?filters=status=STAGED_OFFBOARDING',
      'https://app.yeshid.com/organization/people',
    ]);
  });

  it('stops after the first navigate with a sign-in message when the page is a login page', async () => {
    const q = recipe('q01-count-by-status');
    const out = await chainHarness().run(q.chain, q, { onNavigate: (url) => { onNavigate(url); history.replaceState({}, '', '/login'); } });
    expect(out.result.success).toBe(false);
    expect(out.result.error).toMatch(/Not signed in to YeshID/);
    expect(out.navigated).toHaveLength(1);
  });

  it('fails instead of answering when a footer never says "of N"', async () => {
    const q = recipe('q01-count-by-status');
    const out = await chainHarness().run(q.chain, q, {
      onNavigate: (url) => { onNavigate(url); if (!url.includes('status=')) document.querySelector('.v-data-table-footer')!.textContent = 'Loading…'; },
    });
    expect(out.result.success).toBe(false);
    expect(out.result.error).toMatch(/respond \[s14\]: "total" \/of \(\\d\+\)\/ does not match "total_footer"/);
  });
});

describe('q02-pending-onboarding (real loop, real recipe)', () => {
  it('answers count 0 with the empty message on an org with no staged users', async () => {
    const q = recipe('q02-pending-onboarding');
    const out = await chainHarness().run(q.chain, q, { onNavigate: () => listPage(0) });
    expect(out.result.success).toBe(true);
    expect(out.buffer.response).toEqual({ count: 0, users: 'No data available', message: q.chain.find((s: any) => s.action === 'respond').empty_message });
  });

  it('answers the count and the rows\' text when users are staged', async () => {
    const q = recipe('q02-pending-onboarding');
    const out = await chainHarness().run(q.chain, q, { onNavigate: () => listPage(2, ['Ada Lovelace ada@example.com', 'Grace Hopper grace@example.com']) });
    expect(out.result.success).toBe(true);
    expect(out.buffer.response.count).toBe(2);
    expect(out.buffer.response.users).toBe('Ada Lovelace ada@example.comGrace Hopper grace@example.com');
    expect(out.buffer.response.message).toBeUndefined();
  });
});

describe('q04-group-membership-count (real loop, real recipe)', () => {
  it('stops at once when the group_name param is missing', async () => {
    const q = recipe('q04-group-membership-count');
    const out = await chainHarness().run(q.chain, q, { onNavigate: () => listPage(0) });
    expect(out.executed).toEqual(['s0']);
    expect(out.result.error).toMatch(/q04 needs the group_name param/);
  });

  it('stops with the plan message when the groups table shows "No data available"', async () => {
    const q = recipe('q04-group-membership-count');
    const out = await chainHarness().run(q.chain, q, { params: { group_name: 'Engineering' }, onNavigate: () => listPage(0) });
    expect(out.navigated).toEqual(['https://app.yeshid.com/organization/groups']);
    expect(out.result.success).toBe(false);
    expect(out.result.error).toMatch(/Groups are not available on the current YeshID plan/);
    expect(out.executed).not.toContain('s4');
  });

  it('goes past the plan guard when the groups table has rows', async () => {
    const q = recipe('q04-group-membership-count');
    // The next step types into the search box through the Chrome debugger, which this harness does not stub; reaching it is the point.
    const out = await chainHarness().run(q.chain, q, { params: { group_name: 'Engineering' }, onNavigate: () => listPage(1, ['Engineering 4 members']) });
    expect(out.executed).toContain('s4');
    expect(out.result.error ?? '').not.toMatch(/Groups are not available/);
  });
});
