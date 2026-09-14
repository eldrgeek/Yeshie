/**
 * @jest-environment jsdom
 *
 * `select` and `click` + `within_row`, run against the REAL runtime code:
 * executeStep and the page functions it calls are sliced out of
 * packages/extension/src/entrypoints/background.ts and run with the Chrome
 * APIs stubbed. execInTab runs page functions directly against jsdom.
 *
 * Why: until 2026-09-14 the live runtime had no `select` handler. The step fell
 * through to status 'unsupported', which does not halt a chain, so a recipe
 * that chose a dropdown value ran on with the dropdown unset. The StepExecutor
 * mirror (src/step-executor.ts) did have `select`, and background-actions.test.ts
 * checks the mirror, so CI never saw the gap. The GoDaddy DNS recipes
 * (sites/dcc.godaddy.com) need both actions.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { describeOptions, pickOptionIndex } from '../../src/select-option.js';
import { pickRowIndex, rowNeedles } from '../../src/row-scope.js';
import { createSurpriseEvidence } from '../../src/runtime-contract.js';

const BACKGROUND = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');

// The click page functions dispatch PointerEvents; jsdom may not define them.
if (typeof (globalThis as any).PointerEvent === 'undefined') (globalThis as any).PointerEvent = MouseEvent;

/** Slice a two-space-indented function out of background.ts (it ends at the first "\n  }\n"). */
function sliceFn(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`not found in background.ts: ${header}`);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end + 4);
}

const RUNTIME = (() => {
  const fns = [
    '  function interpolate(',
    '  function PRE_GUARDED_CLICK(',
    '  function PRE_SELECT_SNAPSHOT(',
    '  function PRE_SET_SELECT_INDEX(',
    '  function PRE_ROW_TEXTS(',
    '  function PRE_CLICK_NTH(',
    '  async function executeStep(',
  ].map((h) => sliceFn(BACKGROUND, h)).join('\n');
  const js = ts.transpileModule(`${fns}\nreturn executeStep;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    // shared modules, exactly as background.ts imports them
    describeOptions, pickOptionIndex, pickRowIndex, rowNeedles, createSurpriseEvidence,
    // Chrome/runtime stubs
    execInTab: async (_tabId: number, fn: (...a: any[]) => any, args: any[] = []) => fn(...args),
    resolveFrameId: async () => null,
    PRE_ARM_MUTATION_OBSERVER: () => {},
    PRE_CAPTURE_SIGNATURE_BASELINE: () => ({}),
    PRE_RESOLVE_TARGET: () => ({ found: false }),
    evaluateActionOutcome: async () => ({}),
    trustedCoordClick: async () => ({ ok: false, error: 'trusted clicks are not stubbed' }),
  };
  const names = Object.keys(deps);
  return new Function(...names, js)(...names.map((n) => deps[n]));
})();

function run(step: Record<string, unknown>, params: Record<string, string> = {}): Promise<any> {
  return RUNTIME(step, { runId: 'test-run', tabId: 7, params, buffer: {}, abstractTargets: {}, payload: {} });
}

/** Fresh markup inside a host element, so listeners from one test never reach the next. */
function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="host">${html}</div>`;
  return document.getElementById('host')!;
}

// GoDaddy's Record Type dropdown, as surveyed on dcc.godaddy.com 2026-09-14.
const TYPE_SELECT = '<select id="dnsRecordIdDropdown"><option value="">Choose an option</option>'
  + '<option value="a">A</option><option value="aaaa">AAAA</option><option value="txt">TXT</option></select>';

describe('select-option matching rule', () => {
  const opts = [
    { value: '', text: 'Choose an option' },
    { value: 'a', text: 'A' },
    { value: 'aaaa', text: 'AAAA' },
    { value: 'txt', text: 'TXT' },
  ];

  it('matches exact value, then exact text, then either ignoring case', () => {
    expect(pickOptionIndex(opts, 'txt')).toBe(3);
    expect(pickOptionIndex(opts, 'TXT')).toBe(3);
    expect(pickOptionIndex(opts, 'Txt')).toBe(3);
    expect(pickOptionIndex(opts, 'A')).toBe(1);
    expect(pickOptionIndex(opts, 'mx')).toBe(-1);
  });

  it('never lets a loose match shadow an exact one', () => {
    const tricky = [{ value: 'X', text: 'first' }, { value: 'y', text: 'x' }];
    expect(pickOptionIndex(tricky, 'x')).toBe(1);
  });

  it('describes the options for the failure message', () => {
    expect(describeOptions([{ value: 'a', text: 'A' }, { value: 'txt', text: 'txt' }])).toBe('a=A, txt');
  });
});

describe('select (real background.ts executeStep)', () => {
  it('sets a native <select> by its visible label and fires change once', async () => {
    const host = mount(TYPE_SELECT);
    const changes: string[] = [];
    host.addEventListener('change', (e) => changes.push((e.target as HTMLSelectElement).value));
    const r = await run({ stepId: 's', action: 'select', selector: '#dnsRecordIdDropdown', value: 'TXT' });
    expect(r.status).toBe('ok');
    expect(r.value).toBe('txt');
    expect((document.querySelector('#dnsRecordIdDropdown') as HTMLSelectElement).value).toBe('txt');
    expect(changes).toEqual(['txt']);
  });

  it('interpolates the value from params', async () => {
    mount(TYPE_SELECT);
    const r = await run({ stepId: 's', action: 'select', selector: '#dnsRecordIdDropdown', value: '{{type}}' }, { type: 'aaaa' });
    expect(r.status).toBe('ok');
    expect((document.querySelector('#dnsRecordIdDropdown') as HTMLSelectElement).value).toBe('aaaa');
  });

  it('confirms on the new node when the page re-renders the <select> on change', async () => {
    const host = mount(`<div id="row">${TYPE_SELECT}</div>`);
    host.addEventListener('change', (e) => {
      const chosen = (e.target as HTMLSelectElement).value;
      host.querySelector('#row')!.innerHTML = TYPE_SELECT;
      (host.querySelector('#dnsRecordIdDropdown') as HTMLSelectElement).value = chosen;
    });
    const r = await run({ stepId: 's', action: 'select', selector: '#dnsRecordIdDropdown', value: 'txt' });
    expect(r.status).toBe('ok');
  });

  it('fails, listing the options, when nothing matches', async () => {
    mount(TYPE_SELECT);
    const r = await run({ stepId: 's', action: 'select', selector: '#dnsRecordIdDropdown', value: 'MX' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/no option "MX".*a=A, aaaa=AAAA, txt=TXT/);
    expect((document.querySelector('#dnsRecordIdDropdown') as HTMLSelectElement).value).toBe('');
  });

  it('fails when the page puts the old value back', async () => {
    const host = mount(TYPE_SELECT);
    host.addEventListener('change', (e) => { (e.target as HTMLSelectElement).value = ''; });
    const r = await run({ stepId: 's', action: 'select', selector: '#dnsRecordIdDropdown', value: 'txt', timeout: 300 });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/reads "" after choosing "txt"/);
  });

  it('refuses an element that is not a <select>', async () => {
    mount('<input id="x">');
    const r = await run({ stepId: 's', action: 'select', selector: '#x', value: 'a' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/is a <input>, not a <select>/);
  });
});

describe('row-scope rule', () => {
  it('normalizes within_row to its non-empty, interpolated strings', () => {
    expect(rowNeedles('a')).toEqual(['a']);
    expect(rowNeedles(['a', '', null, 'b'])).toEqual(['a', 'b']);
    expect(rowNeedles(['{{n}}'], (s) => s.replace('{{n}}', 'x'))).toEqual(['x']);
  });

  it('needs exactly one matching row', () => {
    expect(pickRowIndex(['a b', 'a c', null], ['a', 'c'])).toEqual({ ok: true, index: 1 });
    expect(pickRowIndex(['a b', 'a c'], ['a']).ok).toBe(false);
    expect(pickRowIndex(['a b'], ['z']).ok).toBe(false);
    expect(pickRowIndex(['a b'], []).ok).toBe(false);
  });
});

// GoDaddy's DNS table shape: one Delete button per row, told apart only by the row's text.
const DNS_TABLE = '<table class="ux-table"><tbody>'
  + '<tr class="ux-tr"><td>TXT</td><td>@</td><td>v=spf1 include:_spf.google.com ~all</td><td><button aria-label="Delete" id="d1"></button></td></tr>'
  + '<tr class="ux-tr"><td>TXT</td><td>_yeshie-test</td><td>ok-2026-09-14</td><td><button aria-label="Delete" id="d2"></button></td></tr>'
  + '<tr class="ux-tr"><td>TXT</td><td>_yeshie-test2</td><td>ok-2026-09-13</td><td><button aria-label="Delete" id="d3"></button></td></tr>'
  + '</tbody></table>';

function clicksOn(host: HTMLElement): string[] {
  const hits: string[] = [];
  host.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => hits.push(b.id)));
  return hits;
}

describe('click within_row (real background.ts executeStep)', () => {
  const DELETE = "button[aria-label='Delete']";

  it('clicks the control in the one row containing every string', async () => {
    const hits = clicksOn(mount(DNS_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: ['_yeshie-test', 'ok-2026-09-14'] });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['d2']);
  });

  it('interpolates within_row from params', async () => {
    const hits = clicksOn(mount(DNS_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: ['{{name}}', '{{value}}'] },
      { name: '_yeshie-test2', value: 'ok-2026-09-13' });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['d3']);
  });

  it('fails closed, clicking nothing, when several rows match', async () => {
    const hits = clicksOn(mount(DNS_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: '_yeshie-test' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/click within_row: 2 rows contain/);
    expect(hits).toEqual([]);
  });

  it('fails closed, clicking nothing, when no row matches', async () => {
    const hits = clicksOn(mount(DNS_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: ['_yeshie-test', 'wrong-value'] });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/click within_row: no row contains/);
    expect(hits).toEqual([]);
  });

  it('leaves a plain click (no within_row) unchanged', async () => {
    const hits = clicksOn(mount(DNS_TABLE));
    const r = await run({ stepId: 'c', action: 'click', selector: '#d1' });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['d1']);
  });
});
