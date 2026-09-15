/**
 * @jest-environment jsdom
 *
 * `wait_for` interpolation and `activate_tab`, run against the REAL runtime
 * code: executeStep and the page functions it calls are sliced out of
 * packages/extension/src/entrypoints/background.ts and run with the Chrome
 * APIs stubbed. execInTab runs page functions directly against jsdom.
 *
 * Why (2026-09-15): Suno's create-song proof step (s9) went red on real
 * creates on 2026-09-12 and 2026-09-14. Three faults stacked up:
 *   1. The live wait_for handed the page its raw step, so `text: "{{title}}"`
 *      searched for the literal "{{title}}" unless the caller had substituted
 *      params first. yeshie_run and POST /run do not substitute;
 *      scripts/run-async.mjs does. The StepExecutor mirror interpolated, and
 *      the older tests check the mirror, so CI never saw the gap.
 *   2. Chrome does not render a hidden tab. Suno's clip list stayed empty for
 *      60 s in a background tab and filled within 2 s of the tab being raised.
 *      activate_tab raises the tab.
 *   3. While a take is generating, Suno draws a skeleton where the title and
 *      its /song/<id> link go. Only the row's own attributes (aria-label and
 *      data-clip-status) carry the title and the state. The recipe's s9 now
 *      waits on those attributes, and this file runs the recipe's own
 *      selectors against Suno-shaped rows.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable } from '../../src/wait-for.js';
import { createSurpriseEvidence } from '../../src/runtime-contract.js';

const BACKGROUND = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');
const RECIPE = JSON.parse(readFileSync(new URL('../../sites/suno.com/tasks/03-create-song.payload.json', import.meta.url), 'utf8'));

/** Slice a two-space-indented function out of background.ts (it ends at the first "\n  }\n"). */
function sliceFn(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`not found in background.ts: ${header}`);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end + 4);
}

// The one thing jsdom cannot model on its own: whether Chrome renders the tab.
const page = { visibility: 'hidden' as 'hidden' | 'visible', showOnActivate: true };
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => page.visibility });

const chromeCalls: { tabs: unknown[]; windows: unknown[] } = { tabs: [], windows: [] };
let windowState = 'normal';
(globalThis as any).chrome = {
  tabs: {
    update: async (tabId: number, props: unknown) => {
      chromeCalls.tabs.push([tabId, props]);
      if (page.showOnActivate) page.visibility = 'visible';
      return { id: tabId, windowId: 3 };
    },
  },
  windows: {
    get: async (windowId: number) => ({ id: windowId, state: windowState }),
    update: async (windowId: number, props: unknown) => {
      chromeCalls.windows.push([windowId, props]);
      return { id: windowId };
    },
  },
};

const RUNTIME = (() => {
  const fns = [
    '  function interpolate(',
    '  function PRE_MATCH_WAIT_FOR(',
    '  async function executeStep(',
  ].map((h) => sliceFn(BACKGROUND, h)).join('\n');
  const js = ts.transpileModule(`${fns}\nreturn executeStep;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    // shared modules, exactly as background.ts imports them
    ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable, createSurpriseEvidence,
    // Chrome/runtime stubs
    execInTab: async (_tabId: number, fn: (...a: any[]) => any, args: any[] = []) => fn(...args),
    resolveFrameId: async () => null,
    PRE_RESOLVE_TARGET: () => ({ found: false }),
  };
  const names = Object.keys(deps);
  return new Function(...names, js)(...names.map((n) => deps[n]));
})();

function run(step: Record<string, unknown>, params: Record<string, string> = {}): Promise<any> {
  return RUNTIME(step, { runId: 'test-run', tabId: 7, params, buffer: {}, abstractTargets: {}, payload: {} });
}

function mount(html: string): void {
  document.body.innerHTML = `<div id="host">${html}</div>`;
}

function recipeStep(id: string): Record<string, unknown> {
  const s = RECIPE.chain.find((x: { stepId: string }) => x.stepId === id);
  if (!s) throw new Error(`recipe has no step ${id}`);
  return s;
}

// Suno clip rows as surveyed on suno.com/create on 2026-09-15. A finished take
// shows its title as a /song/<id> link. A take that is still generating shows
// a skeleton there instead, so its title is only in the row's aria-label.
const TITLE = 'I Choose You';
const doneRow = (id: string, title = TITLE) =>
  `<div data-testid="clip-row" role="group" aria-label="${title}" data-clip-status="complete">`
  + `<div class="clip-title-wrapper"><a href="/song/${id}" class="hover:underline">${title}</a></div></div>`;
const generatingRow = (status: string, title = TITLE) =>
  `<div data-testid="clip-row" role="group" aria-label="${title}" data-clip-status="${status}">`
  + '<div class="clip-title-wrapper"><span class="inline-block h-2 rounded-full"></span></div></div>';

// Short timeouts keep the failing cases fast; the poll interval is 300 ms.
const FAST = { timeout: 400 };

describe('wait_for interpolates selector and text (real background.ts executeStep)', () => {
  it('finds text given as {{param}}', async () => {
    mount('<p>Nemo</p>');
    const r = await run({ stepId: 's', action: 'wait_for', text: '{{title}}', ...FAST }, { title: 'Nemo' });
    expect(r.status).toBe('ok');
  });

  it('never matches the literal "{{title}}"', async () => {
    mount('<p>{{title}}</p>');
    const r = await run({ stepId: 's', action: 'wait_for', text: '{{title}}', ...FAST }, { title: 'Nemo' });
    expect(r.status).toBe('error');
    expect(r.error).toBe('wait_for timeout: text "Nemo"');
  });

  it('interpolates the selector and reports the resolved one', async () => {
    mount('<div aria-label="Nemo">x</div>');
    const r = await run({ stepId: 's', action: 'wait_for', selector: '[aria-label="{{title}}"]', ...FAST }, { title: 'Nemo' });
    expect(r.status).toBe('ok');
    expect(r.selector).toBe('[aria-label="Nemo"]');
  });

  it('interpolates state.text', async () => {
    mount('<p>Nemo</p>');
    const r = await run({ stepId: 's', action: 'wait_for', state: { text: '{{title}}' }, ...FAST }, { title: 'Nemo' });
    expect(r.status).toBe('ok');
  });
});

describe("suno create-song proof: the recipe's own s1e and s9", () => {
  const params = { title: TITLE };

  it.each(['submitted', 'queued', 'processing', 'streaming'])('s9 sees a take that is still %s', async (status) => {
    mount(generatingRow(status) + doneRow('old-1'));
    const r = await run({ ...recipeStep('s9'), ...FAST }, params);
    expect(r.status).toBe('ok');
  });

  it('s9 does not count finished takes that share the title (no false green)', async () => {
    mount(doneRow('old-1') + doneRow('old-2'));
    const r = await run({ ...recipeStep('s9'), ...FAST }, params);
    expect(r.status).toBe('error');
  });

  it('s9 does not count a take that failed', async () => {
    mount(generatingRow('error'));
    const r = await run({ ...recipeStep('s9'), ...FAST }, params);
    expect(r.status).toBe('error');
  });

  it('s9 does not count a different song that is generating', async () => {
    mount(generatingRow('queued', 'Nemo'));
    const r = await run({ ...recipeStep('s9'), ...FAST }, params);
    expect(r.status).toBe('error');
  });

  it('the old text proof cannot see a generating take, because its title is a skeleton', async () => {
    mount(generatingRow('queued'));
    const r = await run({ stepId: 'old-s9', action: 'wait_for', text: '{{title}}', ...FAST }, params);
    expect(r.status).toBe('error');
  });

  it('s1e lets the run go on when no take with this title is generating', async () => {
    mount(doneRow('old-1') + generatingRow('queued', 'Nemo'));
    const r = await run({ ...recipeStep('s1e'), ...FAST }, params);
    expect(r.status).toBe('ok');
  });

  it('s1e stops the run while an earlier take with this title is still generating', async () => {
    mount(generatingRow('streaming') + doneRow('old-1'));
    const r = await run({ ...recipeStep('s1e'), ...FAST }, params);
    expect(r.status).toBe('error');
  });

  it('raises the tab before the guard reads the list, and again before the proof', () => {
    const ids = RECIPE.chain.map((s: { stepId: string }) => s.stepId);
    expect(recipeStep('s1a').action).toBe('activate_tab');
    expect(recipeStep('s8b').action).toBe('activate_tab');
    expect(ids.indexOf('s1a')).toBeLessThan(ids.indexOf('s1e'));
    expect(ids.indexOf('s8')).toBeLessThan(ids.indexOf('s8b'));
    expect(ids.indexOf('s8b')).toBe(ids.indexOf('s9') - 1);
  });
});

describe('activate_tab (real background.ts executeStep)', () => {
  beforeEach(() => {
    chromeCalls.tabs.length = 0;
    chromeCalls.windows.length = 0;
    windowState = 'normal';
    page.visibility = 'hidden';
    page.showOnActivate = true;
  });

  it('raises the tab, focuses its window, and waits until the page is visible', async () => {
    const r = await run({ stepId: 'a', action: 'activate_tab' });
    expect(r.status).toBe('ok');
    expect(r.visibility).toBe('visible');
    expect(chromeCalls.tabs).toEqual([[7, { active: true }]]);
    expect(chromeCalls.windows).toEqual([[3, { focused: true }]]);
  });

  it('restores a minimized window', async () => {
    windowState = 'minimized';
    const r = await run({ stepId: 'a', action: 'activate_tab' });
    expect(r.status).toBe('ok');
    expect(chromeCalls.windows).toEqual([[3, { state: 'normal', focused: true }]]);
  });

  it('fails when the tab stays hidden', async () => {
    page.showOnActivate = false;
    const r = await run({ stepId: 'a', action: 'activate_tab', timeout: 300 });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/still "hidden"/);
  });
});
