/**
 * @jest-environment node
 */

// "Make split" side-panel button: tab selection logic, the relay endpoint's
// validation and plumbing, and the Accessibility helper's pure matching rules.

process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  splitCandidate,
  buildSplitRequest,
  isSplitTogether,
  type SplitTab,
} from '../../packages/extension/src/split-view';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, '../..');

const tab = (id: number, index: number, extra: Partial<SplitTab> = {}): SplitTab => ({
  id, index, windowId: 1, title: `Tab ${id}`, active: false, highlighted: false, splitViewId: -1, ...extra,
});

describe('splitCandidate', () => {
  it('offers a split for exactly two selected tabs, in tab-strip order', () => {
    const c = splitCandidate([tab(9, 5, { active: true }), tab(4, 2)]);
    expect(c).toEqual({ windowId: 1, tabIds: [4, 9], titles: ['Tab 4', 'Tab 9'] });
  });

  it('offers nothing for one or three selected tabs', () => {
    expect(splitCandidate([tab(1, 0)])).toBeNull();
    expect(splitCandidate([tab(1, 0), tab(2, 1), tab(3, 2)])).toBeNull();
  });

  it('offers nothing when a selected tab is already in a split view', () => {
    expect(splitCandidate([tab(1, 0, { splitViewId: 77 }), tab(2, 1)])).toBeNull();
  });

  it('offers nothing across windows', () => {
    expect(splitCandidate([tab(1, 0), tab(2, 1, { windowId: 2 })])).toBeNull();
  });
});

describe('buildSplitRequest', () => {
  const windowTabs = [tab(10, 0), tab(11, 1, { active: true }), tab(12, 2), tab(13, 3)];

  it('keeps the active tab and right-clicks the other one', () => {
    expect(buildSplitRequest(windowTabs, [11, 13])).toEqual({
      titles: ['Tab 10', 'Tab 11', 'Tab 12', 'Tab 13'], activeIndex: 1, targetIndex: 3,
    });
    expect(buildSplitRequest(windowTabs, [13, 11])).toMatchObject({ activeIndex: 1, targetIndex: 3 });
  });

  it('refuses when neither tab is active or a tab has gone', () => {
    expect(buildSplitRequest(windowTabs, [10, 12])).toBeNull();
    expect(buildSplitRequest(windowTabs, [11, 99])).toBeNull();
  });

  it('orders titles by tab index, not by query order', () => {
    const shuffled = [windowTabs[2], windowTabs[0], windowTabs[3], windowTabs[1]];
    expect(buildSplitRequest(shuffled, [11, 12])?.titles).toEqual(['Tab 10', 'Tab 11', 'Tab 12', 'Tab 13']);
  });
});

describe('isSplitTogether', () => {
  it('needs both tabs in the same, real split view', () => {
    expect(isSplitTogether([tab(1, 0, { splitViewId: 5 }), tab(2, 1, { splitViewId: 5 })])).toBe(true);
    expect(isSplitTogether([tab(1, 0, { splitViewId: 5 }), tab(2, 1, { splitViewId: 6 })])).toBe(false);
    expect(isSplitTogether([tab(1, 0), tab(2, 1)])).toBe(false);
  });
});

describe('side panel markup', () => {
  it('has the Make split bar', () => {
    const html = readFileSync(join(repo, 'packages/extension/src/entrypoints/sidepanel/index.html'), 'utf8');
    expect(html).toContain('id="split-bar"');
    expect(html).toContain('id="split-btn"');
  });
});

// ── Relay POST /chrome/split ──────────────────────────────────────────────────

describe('POST /chrome/split', () => {
  const work = mkdtempSync(join(tmpdir(), 'yeshie-split-'));
  const fakeScript = join(work, 'fake-split.cjs');
  let relay: any;
  let baseUrl: string;

  function post(body: unknown): Promise<{ status: number; data: any }> {
    return new Promise((res, rej) => {
      const url = new URL('/chrome/split', baseUrl);
      const req = http.request({ hostname: url.hostname, port: Number(url.port), path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } }, r => {
        let d = '';
        r.on('data', c => { d += c; });
        r.on('end', () => res({ status: r.statusCode!, data: JSON.parse(d) }));
      });
      req.on('error', rej);
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  beforeAll(async () => {
    process.env.DISPATCH_DIR = work;
    process.env.YESHIE_PYTHON = process.execPath;
    process.env.YESHIE_CHROME_SPLIT = fakeScript;
    const mod = await import('../../packages/relay/index.js');
    relay = mod.createRelay(0);
    const address = await relay.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await relay.close();
    delete process.env.YESHIE_CHROME_SPLIT;
    delete process.env.YESHIE_PYTHON;
    rmSync(work, { recursive: true, force: true });
  });

  it('passes a valid request to the helper and returns its result', async () => {
    writeFileSync(fakeScript, 'const r = JSON.parse(process.argv[2]); console.log(JSON.stringify({ ok: true, got: r }));');
    const body = { titles: ['A', 'B', 'C'], activeIndex: 0, targetIndex: 2 };
    const { status, data } = await post(body);
    expect(status).toBe(200);
    expect(data).toEqual({ ok: true, got: body });
  });

  it('reports a helper failure as 422 with its error', async () => {
    writeFileSync(fakeScript, 'console.log(JSON.stringify({ ok: false, error: "tab menu did not open" })); process.exit(1);');
    const { status, data } = await post({ titles: ['A', 'B'], activeIndex: 1, targetIndex: 0 });
    expect(status).toBe(422);
    expect(data.error).toBe('tab menu did not open');
  });

  it.each([
    [{ titles: [], activeIndex: 0, targetIndex: 1 }, 'titles'],
    [{ titles: ['A', 'B'], activeIndex: 0, targetIndex: 0 }, 'must differ'],
    [{ titles: ['A', 'B'], activeIndex: 0, targetIndex: 5 }, 'targetIndex'],
    [{ titles: ['A', 'B'], activeIndex: 0, targetIndex: 1, command: 'rm' }, 'unknown field: command'],
  ])('rejects %j', async (body, message) => {
    const { status, data } = await post(body);
    expect(status).toBe(400);
    expect(data.error).toContain(message);
  });
});

// ── scripts/chrome-split.py pure rules (no Accessibility calls) ───────────────

const hasPython = (() => { try { execFileSync('python3', ['--version']); return true; } catch { return false; } })();

(hasPython ? describe : describe.skip)('chrome-split.py matching rules', () => {
  const py = (code: string) => execFileSync('python3', ['-c',
    `import importlib.util,json\nspec=importlib.util.spec_from_file_location("cs", ${JSON.stringify(join(repo, 'scripts/chrome-split.py'))})\ncs=importlib.util.module_from_spec(spec); spec.loader.exec_module(cs)\n${code}`,
  ]).toString().trim();

  it('matches Chrome tab titles against Accessibility titles with status suffixes', () => {
    expect(py(`print(json.dumps([
      cs.title_matches("Docs - Memory usage - 182 MB", "Docs"),
      cs.title_matches("Docs - Left view - Memory usage - 1 MB", "Docs"),
      cs.title_matches("Docs", "Docs"),
      cs.title_matches("Docsify - Memory usage", "Docs"),
      cs.title_matches("anything", ""),
    ]))`)).toBe('[true, true, true, false, true]');
  });

  it('needs the whole tab strip to match', () => {
    expect(py(`print(json.dumps([
      cs.window_score(["A - Inactive tab", "B"], ["A", "B"]),
      cs.window_score(["A", "B"], ["A", "B", "C"]),
      cs.window_score(["A", "X"], ["A", "B"]),
    ]))`)).toBe('[true, false, false]');
  });

  it('recognises the split menu item and nothing else', () => {
    expect(py(`print(json.dumps([cs.is_split_item(t) for t in
      ["New Split View with Current Tab", "Add Tab to New Split View", "Separate Split View", "Add Tab to New Group", ""]]))`))
      .toBe('[true, true, false, false, false]');
  });

  it('rejects malformed requests before touching Accessibility', () => {
    expect(py(`print(cs.validate({"titles": ["A", "B"], "activeIndex": 0, "targetIndex": 3}))`)).toContain('must be an index');
    expect(py(`print(cs.validate({"titles": ["A", "B"], "activeIndex": True, "targetIndex": 1}))`)).toContain('activeIndex');
  });
});
