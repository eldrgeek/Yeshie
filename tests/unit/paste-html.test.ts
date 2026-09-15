/**
 * @jest-environment jsdom
 *
 * `paste_html`, run against the REAL runtime code: executeStep and
 * PRE_PASTE_HTML are sliced out of
 * packages/extension/src/entrypoints/background.ts and run in jsdom, with
 * execInTab calling page functions directly.
 *
 * Why (2026-09-15): Substack's editors (posts, the About page, the welcome
 * emails) are TipTap/ProseMirror. `type` delivers plain text through
 * Input.insertText, so an essay moved from ai-wtf.org would lose its
 * headings, italics, links and quotes. A paste event whose clipboardData
 * carries text/html goes through the editor's own paste rules and keeps them.
 * That was checked live on a Substack draft on 2026-09-15: an h2, bold,
 * italic, a link, a blockquote and a bullet list all arrived intact.
 *
 * The first live run of 02-create-draft then showed a second fault. The
 * replace step selected the old content through the DOM, which ProseMirror
 * reads as a TextSelection, and the pasted credit line merged into the
 * heading that had opened the old draft. Replace now sends Cmd-A (Ctrl-A off
 * the Mac), which ProseMirror answers with an AllSelection, and marks the
 * HTML as a closed slice. Both were checked live the same day.
 *
 * jsdom has no DataTransfer or ClipboardEvent, so these tests exercise the
 * fallback (a plain Event carrying a getData shim). Chrome takes the
 * ClipboardEvent path; the editor reads clipboardData the same way in both.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable } from '../../src/wait-for.js';
import { createSurpriseEvidence } from '../../src/runtime-contract.js';

const BACKGROUND = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');

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
    '  async function PRE_PASTE_HTML(',
    '  async function executeStep(',
  ].map((h) => sliceFn(BACKGROUND, h)).join('\n');
  const js = ts.transpileModule(`${fns}\nreturn executeStep;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    ContentStabilityTracker, expectedWaitState, quietMsOf, stateWaitMatched, waitStateGraph, wantsStable, createSurpriseEvidence,
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

const CLOSED = ' data-pm-slice="0 0 []"';
type Seen = { html?: string; text?: string; allSelected?: boolean; wholeContentSelected?: boolean };

/**
 * A stand-in for a ProseMirror/TipTap editor. Like the real ones, it handles
 * paste by reading clipboardData, cancels the event, and replaces the
 * selection. With `selectAll`, it also answers Ctrl-A or Cmd-A the way
 * ProseMirror does, by selecting the whole document and cancelling the key.
 */
function mountEditor(opts: { initial?: string; selectAll?: boolean } = {}): { ed: HTMLElement; seen: Seen } {
  const { initial = '<h2>Old heading</h2><p>old draft text</p>', selectAll = false } = opts;
  document.body.innerHTML = `<div id="ed" contenteditable="true">${initial}</div>`;
  const ed = document.getElementById('ed') as HTMLElement;
  const seen: Seen = {};
  if (selectAll) {
    ed.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { seen.allSelected = true; e.preventDefault(); }
    });
  }
  ed.addEventListener('paste', (e: any) => {
    const sel = window.getSelection();
    const r = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    seen.wholeContentSelected = !!r && r.startContainer === ed && r.startOffset === 0
      && r.endContainer === ed && r.endOffset === ed.childNodes.length;
    seen.html = e.clipboardData.getData('text/html');
    seen.text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (seen.allSelected || seen.wholeContentSelected) ed.innerHTML = seen.html as string;
    else ed.insertAdjacentHTML('beforeend', seen.html as string);
  });
  return { ed, seen };
}

const ESSAY = '<p><em>First published on ai-wtf.org, January 2026.</em></p><h2>Beads on a Thread</h2><p>Mike holds the <em>thread</em>. <a href="https://ai-wtf.org/">More</a>.</p><blockquote><p>A quote.</p></blockquote>';

describe('paste_html (real background.ts executeStep)', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("selects everything with the editor's own select-all, then replaces it", async () => {
    const { ed, seen } = mountEditor({ selectAll: true });
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: ESSAY });
    expect(r.status).toBe('ok');
    expect(seen.allSelected).toBe(true);
    expect(r.selectedBy).toBe('editor');
    expect(ed.textContent).not.toContain('old draft text');
    expect(ed.textContent).toContain('First published on ai-wtf.org');
    expect(r.textLength).toBe(ed.textContent?.length);
  });

  it('falls back to a DOM selection when no editor answers the key', async () => {
    const { ed, seen } = mountEditor();
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: ESSAY });
    expect(r.status).toBe('ok');
    expect(r.selectedBy).toBe('dom');
    expect(seen.wholeContentSelected).toBe(true);
    expect(ed.textContent).not.toContain('old draft text');
  });

  it('marks the pasted HTML as a closed slice when replacing, so blocks go in whole', async () => {
    const { seen } = mountEditor({ selectAll: true });
    await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: ESSAY });
    expect(seen.html).toBe(ESSAY.replace('<p>', `<p${CLOSED}>`));
  });

  it('keeps a data-pm-slice the caller already set', async () => {
    const { seen } = mountEditor({ selectAll: true });
    const html = '<p data-pm-slice="1 1 []">x</p>';
    await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html });
    expect(seen.html).toBe(html);
  });

  it('interpolates {{params}} and derives text/plain from the html', async () => {
    const { seen } = mountEditor({ selectAll: true });
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: '<p>Hello <strong>{{name}}</strong></p>' }, { name: 'Verso' });
    expect(r.status).toBe('ok');
    expect(seen.html).toBe(`<p${CLOSED}>Hello <strong>Verso</strong></p>`);
    expect(seen.text).toBe('Hello Verso');
  });

  it('takes an explicit text/plain flavor when given', async () => {
    const { seen } = mountEditor({ selectAll: true });
    await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: '<p>x</p>', text: 'plain {{name}}' }, { name: 'Dee' });
    expect(seen.text).toBe('plain Dee');
  });

  it('with replace: false, adds to the existing content and leaves the HTML open', async () => {
    const { ed, seen } = mountEditor({ selectAll: true });
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: '<p>new</p>', replace: false });
    expect(r.status).toBe('ok');
    expect(r.selectedBy).toBe('none');
    expect(seen.allSelected).toBeUndefined();
    expect(seen.html).toBe('<p>new</p>');
    expect(ed.textContent).toContain('old draft text');
    expect(ed.textContent).toContain('new');
  });

  it('fails when the selector finds nothing', async () => {
    mountEditor();
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#missing', html: '<p>x</p>' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/not found: #missing/);
  });

  it('fails when nothing handles the paste, because nothing was inserted', async () => {
    document.body.innerHTML = '<div id="plain" contenteditable="true"><p>old</p></div>';
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#plain', html: '<p>x</p>' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/did not handle the paste/);
  });

  it('requireHandled: false lets an unhandled paste pass', async () => {
    document.body.innerHTML = '<div id="plain" contenteditable="true"><p>old</p></div>';
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#plain', html: '<p>x</p>', requireHandled: false });
    expect(r.status).toBe('ok');
  });

  it('fails when the step has no html', async () => {
    mountEditor();
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed' });
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/needs html/);
  });
});
