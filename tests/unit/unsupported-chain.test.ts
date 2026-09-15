/**
 * @jest-environment jsdom
 *
 * A step whose action has no handler in the live runtime halts the chain,
 * unless the step is optional. Run against the REAL runtime code: the step
 * loop and executeStep are sliced out of
 * packages/extension/src/entrypoints/background.ts (see background-harness.ts).
 *
 * Why: until 2026-09-15 executeStep returned status 'unsupported' for an
 * action it had no handler for, and the loop halted only on 'error'. The step
 * did nothing and the chain ran on. `select` behaved that way until #66, so a
 * recipe that chose a dropdown value ran on with the dropdown unset.
 *
 * Also here: `clear` and `scroll`, added in the same change. Fourteen recipes
 * used them while the runtime had no handler; twelve GitHub recipes clear a
 * field right before typing into it.
 */
import { BACKGROUND, chainHarness } from './background-harness.js';

const after = { stepId: 'after', action: 'navigate', url: 'https://example.test/after' };

describe('an unsupported step halts the chain (real background.ts loop + executeStep)', () => {
  it('stops at a step whose action has no handler, and names the step and the action', async () => {
    const chain = [{ stepId: 'u', action: 'no_such_action' }, after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['u']);
    expect(out.navigated).toEqual([]);
    expect(out.stepResults).toHaveLength(1);
    expect(out.stepResults[0].status).toBe('unsupported');
    expect(out.result.success).toBe(false);
    expect(out.result.error).toBe('Unsupported action [u]: "no_such_action" has no handler in the extension runtime');
  });

  it('runs on past an optional unsupported step and records the failure', async () => {
    const chain = [{ stepId: 'u', action: 'no_such_action', optional: true }, after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['u', 'after']);
    expect(out.navigated).toEqual(['https://example.test/after']);
    expect(out.stepResults[0]).toMatchObject({ status: 'skipped_error', failedStatus: 'unsupported', optionalFailure: true });
    expect(out.result.success).toBe(true);
  });

  it('still runs on past an optional step that errors', async () => {
    document.body.innerHTML = '';
    const chain = [{ stepId: 'c', action: 'clear', selector: '#missing', optional: true }, after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['c', 'after']);
    expect(out.stepResults[0]).toMatchObject({ status: 'skipped_error', failedStatus: 'error', optionalFailure: true });
    expect(out.result.success).toBe(true);
  });

  const notReady = {
    stateGraph: { nodes: { ready: { signals: [{ type: 'element_visible', selector: '#ready' }] } } },
  };
  const assess = { stepId: 's0', action: 'assess_state', expect: { state: 'ready' }, onMismatch: 'branch:not-ready' };

  it('halts on an unsupported step inside an assess_state branch', async () => {
    document.body.innerHTML = '';
    const payload = { ...notReady, branches: { 'not-ready': { steps: [{ stepId: 'b1', action: 'no_such_action' }] } } };
    const chain = [assess, after];
    const out = await chainHarness().run(chain, { ...payload, chain });
    expect(out.executed).toEqual(['s0', 'b1']);
    expect(out.navigated).toEqual([]);
    expect(out.result.success).toBe(false);
    expect(out.result.error).toBe('Unsupported action [b1]: "no_such_action" has no handler in the extension runtime');
  });

  it('runs on past an optional unsupported step inside a branch', async () => {
    document.body.innerHTML = '';
    const payload = { ...notReady, branches: { 'not-ready': { steps: [{ stepId: 'b1', action: 'no_such_action', optional: true }] } } };
    const chain = [assess, after];
    const out = await chainHarness().run(chain, { ...payload, chain });
    expect(out.executed).toEqual(['s0', 'b1', 'after']);
    expect(out.navigated).toEqual(['https://example.test/after']);
    expect(out.result.success).toBe(true);
  });

  it('skips a section comment ({"_": ...}) and runs on', async () => {
    const chain = [{ _: 'PHASE 1 — land on the page' }, after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.stepResults[0]).toMatchObject({ status: 'skipped', comment: true });
    expect(out.navigated).toEqual(['https://example.test/after']);
    expect(out.result.success).toBe(true);
  });

  it('halts on an item with no action that is not a comment (a misspelled key)', async () => {
    const chain = [{ stepId: 't', acton: 'click', selector: '#x' }, after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.executed).toEqual(['t']);
    expect(out.navigated).toEqual([]);
    expect(out.result.error).toBe('Unsupported action [t]: "undefined" has no handler in the extension runtime');
  });

  it('is sensitive to the defect: when only error halts, the chain runs on past an unsupported step', async () => {
    const broken = BACKGROUND.replace(
      "if (res.status !== 'error' && res.status !== 'unsupported') return false;",
      "if (res.status !== 'error') return false;",
    );
    expect(broken).not.toBe(BACKGROUND);
    const chain = [{ stepId: 'u', action: 'no_such_action' }, after];
    const out = await chainHarness(broken).run(chain, { chain });
    expect(out.executed).toEqual(['u', 'after']);
    expect(out.navigated).toEqual(['https://example.test/after']);
    expect(out.result.success).toBe(true);
  });
});

describe('clear (real background.ts executeStep)', () => {
  it('empties an input through the value setter and fires input, then change', async () => {
    document.body.innerHTML = '<input id="f" value="old-name">';
    const f = document.getElementById('f') as HTMLInputElement;
    const seen: string[] = [];
    f.addEventListener('input', () => seen.push(`input:${f.value}`));
    f.addEventListener('change', () => seen.push(`change:${f.value}`));
    const chain = [{ stepId: 'c', action: 'clear', selector: '#f' }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.stepResults[0]).toMatchObject({ status: 'ok', selector: '#f', previousLength: 8 });
    expect(f.value).toBe('');
    expect(seen).toEqual(['input:', 'change:']);
  });

  it('empties a textarea found through an abstract target', async () => {
    document.body.innerHTML = '<textarea class="bio">An old bio.</textarea>';
    const chain = [{ stepId: 'c', action: 'clear', target: 'bio' }];
    const out = await chainHarness().run(chain, { chain, abstractTargets: { bio: { cachedSelector: 'textarea.bio' } } });
    expect(out.stepResults[0]).toMatchObject({ status: 'ok', selector: 'textarea.bio', resolvedVia: 'cached' });
    expect((document.querySelector('textarea.bio') as HTMLTextAreaElement).value).toBe('');
  });

  it('fails on an element that is not a text field, and the chain halts', async () => {
    document.body.innerHTML = '<div id="wrap"><input id="inner" value="x"></div>';
    const chain = [{ stepId: 'c', action: 'clear', selector: '#wrap, #inner' }, after];
    const out = await chainHarness().run(chain, { chain });
    expect(out.navigated).toEqual([]);
    expect(out.result.error).toMatch(/clear: #wrap, #inner is a <div>; clear empties a text <input> or a <textarea>/);
    expect((document.getElementById('inner') as HTMLInputElement).value).toBe('x');
  });

  it('fails on a checkbox, whose value is not text', async () => {
    document.body.innerHTML = '<input id="cb" type="checkbox" value="on">';
    const chain = [{ stepId: 'c', action: 'clear', selector: '#cb' }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.result.error).toMatch(/clear: #cb is a <input type=checkbox>/);
    expect((document.getElementById('cb') as HTMLInputElement).value).toBe('on');
  });
});

describe('scroll (real background.ts executeStep)', () => {
  const realScrollBy = window.scrollBy;
  const realScrollIntoView = (Element.prototype as any).scrollIntoView;
  let calls: unknown[][];

  // jsdom does not lay out or scroll, so record the calls PRE_SCROLL makes.
  beforeEach(() => {
    calls = [];
    window.scrollBy = ((x: number, y: number) => { calls.push(['scrollBy', x, y]); }) as typeof window.scrollBy;
    (Element.prototype as any).scrollIntoView = function (this: Element, opts: unknown) { calls.push(['scrollIntoView', this.id, opts]); };
  });
  afterEach(() => {
    window.scrollBy = realScrollBy;
    (Element.prototype as any).scrollIntoView = realScrollIntoView;
  });

  it('scrolls the page by `amount` in `direction`', async () => {
    const chain = [{ stepId: 's', action: 'scroll', direction: 'down', amount: 2000 }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.stepResults[0]).toMatchObject({ status: 'ok', selector: null, direction: 'down', amount: 2000 });
    expect(calls).toEqual([['scrollBy', 0, 2000]]);
  });

  it('defaults to 600 px down, and scrolls up and left by negative distances', async () => {
    const chain = [
      { stepId: 'd', action: 'scroll' },
      { stepId: 'u', action: 'scroll', direction: 'up', amount: 50 },
      { stepId: 'l', action: 'scroll', direction: 'left', amount: 30 },
    ];
    const out = await chainHarness().run(chain, { chain });
    expect(out.result.success).toBe(true);
    expect(calls).toEqual([['scrollBy', 0, 600], ['scrollBy', 0, -50], ['scrollBy', -30, 0]]);
  });

  it('scrolls an abstract target into view', async () => {
    document.body.innerHTML = '<textarea id="scopes"></textarea>';
    const chain = [{ stepId: 's', action: 'scroll', target: 'scope-manual-textarea' }];
    const out = await chainHarness().run(chain, { chain, abstractTargets: { 'scope-manual-textarea': { cachedSelector: '#scopes' } } });
    expect(out.stepResults[0]).toMatchObject({ status: 'ok', selector: '#scopes', direction: null, amount: null });
    expect(calls).toEqual([['scrollIntoView', 'scopes', { block: 'center', inline: 'nearest' }]]);
  });

  it('fails on a direction it does not know, before scrolling', async () => {
    const chain = [{ stepId: 's', action: 'scroll', direction: 'sideways' }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.result.error).toMatch(/scroll: direction "sideways" is not up, down, left or right/);
    expect(calls).toEqual([]);
  });

  it('fails when a named target is not defined, instead of scrolling the page', async () => {
    const chain = [{ stepId: 's', action: 'scroll', target: 'nowhere' }];
    const out = await chainHarness().run(chain, { chain });
    expect(out.result.error).toMatch(/No selector for: nowhere/);
    expect(calls).toEqual([]);
  });
});
