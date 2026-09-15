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

type Seen = { html?: string; text?: string; wholeContentSelected?: boolean };

/**
 * A stand-in for a ProseMirror/TipTap editor. Like the real ones, it handles
 * paste by reading clipboardData, cancels the event, and replaces the
 * selection: the whole content when everything is selected, else it appends.
 */
function mountEditor(initial = '<p>old draft text</p>'): { ed: HTMLElement; seen: Seen } {
  document.body.innerHTML = `<div id="ed" contenteditable="true">${initial}</div>`;
  const ed = document.getElementById('ed') as HTMLElement;
  const seen: Seen = {};
  ed.addEventListener('paste', (e: any) => {
    const sel = window.getSelection();
    const r = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    seen.wholeContentSelected = !!r && r.startContainer === ed && r.startOffset === 0
      && r.endContainer === ed && r.endOffset === ed.childNodes.length;
    seen.html = e.clipboardData.getData('text/html');
    seen.text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (seen.wholeContentSelected) ed.innerHTML = seen.html as string;
    else ed.insertAdjacentHTML('beforeend', seen.html as string);
  });
  return { ed, seen };
}

const ESSAY = '<h2>Beads on a Thread</h2><p>Mike holds the <em>thread</em>. <a href="https://ai-wtf.org/">More</a>.</p><blockquote><p>A quote.</p></blockquote>';

describe('paste_html (real background.ts executeStep)', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('pastes text/html into the editor and replaces its content by default', async () => {
    const { ed, seen } = mountEditor();
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: ESSAY });
    expect(r.status).toBe('ok');
    expect(seen.wholeContentSelected).toBe(true);
    expect(seen.html).toBe(ESSAY);
    expect(ed.innerHTML).toBe(ESSAY);
    expect(ed.textContent).not.toContain('old draft text');
    expect(r.textLength).toBe(ed.textContent?.length);
  });

  it('interpolates {{params}} and derives text/plain from the html', async () => {
    const { seen } = mountEditor();
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: '<p>Hello <strong>{{name}}</strong></p>' }, { name: 'Verso' });
    expect(r.status).toBe('ok');
    expect(seen.html).toBe('<p>Hello <strong>Verso</strong></p>');
    expect(seen.text).toBe('Hello Verso');
  });

  it('takes an explicit text/plain flavor when given', async () => {
    const { seen } = mountEditor();
    await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: '<p>x</p>', text: 'plain {{name}}' }, { name: 'Dee' });
    expect(seen.text).toBe('plain Dee');
  });

  it('with replace: false, adds to the existing content', async () => {
    const { ed, seen } = mountEditor();
    const r = await run({ stepId: 'p', action: 'paste_html', selector: '#ed', html: '<p>new</p>', replace: false });
    expect(r.status).toBe('ok');
    expect(seen.wholeContentSelected).toBe(false);
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
