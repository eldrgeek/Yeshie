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
 *
 * The cells form of within_row (2026-09-15) exists because the text form could
 * not delete GoDaddy's `sala` A record: sala65 through sala105 hold the same
 * address, so six rows contain both strings.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { describeOptions, pickOptionIndex } from '../../src/select-option.js';
import { pickRowIndex, rowMatches, rowScope } from '../../src/row-scope.js';
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

/** Runs after each page function. A test sets it to change the page between two page calls. */
let afterPageCall: ((fn: (...a: any[]) => any) => void) | null = null;
afterEach(() => { afterPageCall = null; });

const RUNTIME = (() => {
  const fns = [
    '  function interpolate(',
    '  function PRE_GUARDED_CLICK(',
    '  function PRE_SELECT_SNAPSHOT(',
    '  function PRE_SET_SELECT_INDEX(',
    '  function PRE_ROW_SNAPSHOTS(',
    '  function PRE_CLICK_NTH(',
    '  async function executeStep(',
  ].map((h) => sliceFn(BACKGROUND, h)).join('\n');
  const js = ts.transpileModule(`${fns}\nreturn executeStep;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    // shared modules, exactly as background.ts imports them
    describeOptions, pickOptionIndex, pickRowIndex, rowScope, createSurpriseEvidence,
    // Chrome/runtime stubs
    execInTab: async (_tabId: number, fn: (...a: any[]) => any, args: any[] = []) => {
      const out = await fn(...args);
      afterPageCall?.(fn);
      return out;
    },
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
  const PARAMS: Record<string, string> = { name: 'sala', value: '217.77.6.197', empty: '' };
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => PARAMS[k] ?? '');

  it('reads the text form: a string or a list, each filled in from params', () => {
    expect(rowScope('a')).toEqual({ mode: 'text', needles: ['a'] });
    expect(rowScope(['{{name}}', '{{value}}'], fill)).toEqual({ mode: 'text', needles: ['sala', '217.77.6.197'] });
  });

  it('reads the cells form, trimming and collapsing whitespace', () => {
    expect(rowScope({ cells: [' {{name}} ', '217.77.6.197'] }, fill)).toEqual({ mode: 'cells', needles: ['sala', '217.77.6.197'] });
    expect(rowScope({ cells: 'a \n b' })).toEqual({ mode: 'cells', needles: ['a b'] });
  });

  it('refuses a within_row that could match rows it does not name', () => {
    expect(() => rowScope([])).toThrow(/no text to match/);
    expect(() => rowScope({ cells: [] })).toThrow(/no text to match/);
    expect(() => rowScope(['a', ''])).toThrow(/entry 1 \(""\) is empty/);
    expect(() => rowScope({ cells: ['{{empty}}', 'x'] }, fill)).toThrow(/entry 0 \("\{\{empty\}\}"\) is empty once params are filled in/);
    expect(() => rowScope({ cells: ['   '] })).toThrow(/is empty/);
    expect(() => rowScope([null])).toThrow(/entry 0 is null/);
    expect(() => rowScope({ cell: ['a'] })).toThrow(/exactly one key, "cells"/);
    expect(() => rowScope({ cells: ['a'], text: ['b'] })).toThrow(/exactly one key, "cells"/);
  });

  it('text form: every string somewhere in the row text; exactly one row', () => {
    const rows = [{ text: 'a b', cells: [] }, { text: 'a c', cells: [] }, null];
    expect(pickRowIndex(rows, rowScope(['a', 'c']))).toEqual({ ok: true, index: 1 });
    expect(pickRowIndex(rows, rowScope('a'))).toMatchObject({ ok: false, reason: expect.stringMatching(/^2 rows contain/) });
    expect(pickRowIndex(rows, rowScope('z'))).toMatchObject({ ok: false, reason: expect.stringMatching(/^no row contains/) });
  });

  it('cells form: whole cells, in the listed order, one cell per string, case-sensitive', () => {
    const row = { text: '', cells: ['', 'A', ' sala\n', '217.77.6.197', '600 seconds'] };
    expect(rowMatches(row, rowScope({ cells: ['sala', '217.77.6.197'] }))).toBe(true);
    expect(rowMatches(row, rowScope({ cells: ['A', '217.77.6.197'] }))).toBe(true);
    expect(rowMatches(row, rowScope({ cells: ['217.77.6.197', 'sala'] }))).toBe(false);
    expect(rowMatches(row, rowScope({ cells: ['sal'] }))).toBe(false);
    expect(rowMatches(row, rowScope({ cells: ['Sala'] }))).toBe(false);
    expect(rowMatches(row, rowScope({ cells: ['sala', 'sala'] }))).toBe(false);
    expect(rowMatches(null, rowScope({ cells: ['sala'] }))).toBe(false);
  });

  it('cells form: a record with the name and value swapped does not stand in', () => {
    // Deleting (name "@", value "x") must not reach the record (name "x", value "@").
    const swapped = { text: 'CNAME x @', cells: ['CNAME', 'x', '@'] };
    expect(rowMatches(swapped, rowScope({ cells: ['@', 'x'] }))).toBe(false);
    expect(rowMatches(swapped, rowScope(['@', 'x']))).toBe(true);
  });

  it('cells form: a miss shows the cells of rows whose text holds every string', () => {
    const rows = [{ text: 'A sala (primary) 217.77.6.197', cells: ['A', 'sala (primary)', '217.77.6.197'] }];
    expect(pickRowIndex(rows, rowScope({ cells: ['sala', '217.77.6.197'] }))).toEqual({
      ok: false,
      reason: 'no row has cells ["sala","217.77.6.197"] in that order (1 candidates); rows whose text holds them have cells ["A","sala (primary)","217.77.6.197"]',
    });
  });
});

// GoDaddy's DNS table as surveyed live on mike-wolf.com, 2026-09-15: a checkbox
// column, then Type | Name | Data | TTL | Propagation | Copy | Delete | Edit. In
// the A rows, the Name cell reads exactly the host label and the Data cell
// exactly the address.
function dnsRow(type: string, name: string, data: string, deleteId: string): string {
  return `<tr class="ux-tr"><td><input type="checkbox"></td><td>${type}</td><td>${name}</td><td>${data}</td><td>600 seconds</td><td></td>`
    + `<td><button aria-label="Copy"></button></td><td><button aria-label="Delete" id="${deleteId}"></button></td>`
    + '<td><button aria-label="Edit"></button></td></tr>';
}
const table = (rows: string[]) => `<table class="ux-table"><tbody>${rows.join('')}</tbody></table>`;

const DNS_TABLE = table([
  dnsRow('TXT', '@', 'v=spf1 include:_spf.google.com ~all', 'd1'),
  dnsRow('TXT', '_yeshie-test', 'ok-2026-09-14', 'd2'),
  dnsRow('TXT', '_yeshie-test2', 'ok-2026-09-13', 'd3'),
]);

// The A records the text form could not tell apart (mike-wolf.com, 2026-09-15), in the table's order.
const SALA = ['sala', 'sala105', 'sala65', 'sala75', 'sala85', 'sala95'];
const SALA_TABLE = table([
  dnsRow('A', '@', '217.77.6.197', 'del-apex'),
  dnsRow('A', 'playmaker', '217.77.6.197', 'del-playmaker'),
  ...SALA.map((n) => dnsRow('A', n, '217.77.6.197', `del-${n}`)),
  dnsRow('A', 'vps', '217.77.6.197', 'del-vps'),
]);

function clicksOn(host: HTMLElement): string[] {
  const hits: string[] = [];
  host.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => hits.push(b.id)));
  return hits;
}

describe('click within_row, text form (real background.ts executeStep)', () => {
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

  it('cannot pick sala: six rows contain both strings, so it fails closed', async () => {
    const hits = clicksOn(mount(SALA_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: ['sala', '217.77.6.197'] });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/click within_row: 6 rows contain \["sala","217\.77\.6\.197"\]/);
    expect(hits).toEqual([]);
  });

  it('leaves a plain click (no within_row) unchanged', async () => {
    const hits = clicksOn(mount(DNS_TABLE));
    const r = await run({ stepId: 'c', action: 'click', selector: '#d1' });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['d1']);
  });
});

describe('click within_row, cells form (real background.ts executeStep)', () => {
  const DELETE = "button[aria-label='Delete']";
  const SALA_CELLS = { cells: ['sala', '217.77.6.197'] };

  it('clicks Delete in the one row whose cells read exactly sala and 217.77.6.197', async () => {
    const hits = clicksOn(mount(SALA_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: SALA_CELLS });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['del-sala']);
  });

  it('fills the cells from params, as the delete recipe does, for each sala record', async () => {
    for (const name of SALA) {
      const hits = clicksOn(mount(SALA_TABLE));
      const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: { cells: ['{{name}}', '{{value}}'] } },
        { name, value: '217.77.6.197' });
      expect({ name, status: r.status, hits }).toEqual({ name, status: 'ok', hits: [`del-${name}`] });
    }
  });

  it('ignores whitespace around and inside a cell', async () => {
    const hits = clicksOn(mount(table([dnsRow('A', '\n   sala  ', ' 217.77.6.197\n', 'del-sala'), dnsRow('A', 'sala65', '217.77.6.197', 'del-sala65')])));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: SALA_CELLS });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['del-sala']);
  });

  it('fails closed, clicking nothing, when two rows have the same cells', async () => {
    const hits = clicksOn(mount(table([dnsRow('A', 'sala', '217.77.6.197', 'x1'), dnsRow('A', 'sala', '217.77.6.197', 'x2')])));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: SALA_CELLS });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/click within_row: 2 rows have cells/);
    expect(hits).toEqual([]);
  });

  it('fails closed when a cell holds more than the name, and the error shows that cell', async () => {
    const hits = clicksOn(mount(table([dnsRow('A', 'sala <span>primary</span>', '217.77.6.197', 'del-sala')])));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: SALA_CELLS });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/^click within_row: no row has cells/);
    expect(r.error).toContain('"sala primary"');
    expect(hits).toEqual([]);
  });

  it('fails closed, clicking nothing, when a param is empty', async () => {
    const hits = clicksOn(mount(SALA_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: { cells: ['{{name}}', '{{value}}'] } },
      { name: '', value: '217.77.6.197' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/is empty once params are filled in/);
    expect(hits).toEqual([]);
  });

  it('fails closed, clicking nothing, on a malformed object', async () => {
    const hits = clicksOn(mount(SALA_TABLE));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: { cell: ['sala'] } });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/exactly one key, "cells"/);
    expect(hits).toEqual([]);
  });

  it('checks the row again at the click, and clicks nothing if it changed', async () => {
    const host = mount(SALA_TABLE);
    const hits = clicksOn(host);
    afterPageCall = (fn) => {
      if (fn.name !== 'PRE_ROW_SNAPSHOTS') return;
      (host.querySelector('#del-sala')!.closest('tr') as HTMLTableRowElement).cells[2].textContent = 'sala-old';
    };
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: SALA_CELLS });
    expect(r.status).toBe('error');
    expect(r.error).toBe('the row changed before the click');
    expect(hits).toEqual([]);
  });

  it('reads ARIA grid rows: role=row with role=cell children', async () => {
    const ariaRow = (name: string, id: string) => `<div role="row"><div role="cell">A</div><div role="cell">${name}</div>`
      + `<div role="cell">217.77.6.197</div><div role="cell"><button aria-label="Delete" id="${id}"></button></div></div>`;
    const hits = clicksOn(mount(`<div role="grid">${ariaRow('sala65', 'g1')}${ariaRow('sala', 'g2')}</div>`));
    const r = await run({ stepId: 'del', action: 'click', selector: DELETE, within_row: SALA_CELLS });
    expect(r.status).toBe('ok');
    expect(hits).toEqual(['g2']);
  });
});
