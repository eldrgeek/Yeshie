/**
 * Chrome Web Store readiness for packages/extension (added 2026-11-17).
 *
 * Guards the fixes from packages/extension/store/REVIEW-2026-11-17.md and the
 * store's field limits, so a later edit cannot quietly undo them:
 *  - no page-to-extension postMessage bridge (any site could start runs),
 *  - privileged messages refused from content scripts,
 *  - the SOMA admin token script never matches every site,
 *  - manifest and listing text within the store's limits,
 *  - every requested permission has a justification in LISTING.md.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const EXT = join(ROOT, 'packages/extension');
const read = (p: string) => readFileSync(join(EXT, p), 'utf8');
const CONFIG = read('wxt.config.ts');
const LISTING = read('store/LISTING.md');
const BACKGROUND = read('src/entrypoints/background.ts');

function srcFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? srcFiles(p) : /\.(ts|js|html)$/.test(e.name) ? [p] : [];
  });
}

function fenced(afterHeading: string): string {
  const at = LISTING.indexOf(afterHeading);
  expect(at).toBeGreaterThanOrEqual(0);
  const m = LISTING.slice(at).match(/```text\n([\s\S]*?)\n```/);
  expect(m).not.toBeNull();
  return m![1];
}

describe('store readiness', () => {
  test('no source file bridges window.postMessage to the extension', () => {
    for (const f of srcFiles(join(EXT, 'src'))) {
      expect(`${f}: ${readFileSync(f, 'utf8').includes('__yeshieExt')}`).toBe(`${f}: false`);
    }
  });

  test('privileged messages are refused from web pages', () => {
    expect(BACKGROUND).toMatch(/if \(sender\.id !== chrome\.runtime\.id\) return false;/);
    expect(BACKGROUND).toMatch(/EXTENSION_PAGE_ONLY\.has\(msg\?\.type\) && !fromExtensionPage/);
    const set = BACKGROUND.match(/EXTENSION_PAGE_ONLY = new Set\(\[([\s\S]*?)\]\)/);
    expect(set).not.toBeNull();
    for (const t of ['skill_run', 'get_status', 'get_active_runs', 'chat_message', 'record_toggle', 'teach_start']) {
      expect(set![1]).toContain(`'${t}'`);
    }
  });

  test('the SOMA admin script is limited to SOMA sites and left out of the store build', () => {
    expect(CONFIG).toMatch(/e\.name === 'soma-admin'/);
    expect(CONFIG).toMatch(/wxt\.config\.mode === 'store'[\s\S]*?entrypoints\.splice\(i, 1\)/);
    const list = CONFIG.match(/DEFAULT_SOMA_ADMIN_MATCHES = \[([\s\S]*?)\]/);
    expect(list).not.toBeNull();
    expect(list![1]).not.toContain('<all_urls>');
    expect(list![1]).not.toMatch(/'\*:\/\/\*\/\*'|'https:\/\/\*\/\*'/);
  });

  test('manifest description fits the store limit of 132 characters', () => {
    const d = CONFIG.match(/description: '([^']+)'/);
    expect(d).not.toBeNull();
    expect(d![1].length).toBeLessThanOrEqual(132);
  });

  test('listing text fits the store limits', () => {
    expect(fenced('**Description**').length).toBeLessThanOrEqual(16000);
    expect(fenced('**Single purpose description:**').length).toBeLessThanOrEqual(1000);
    for (const row of LISTING.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)) {
      expect(`${row[1]}: ${row[2].length <= 1000}`).toBe(`${row[1]}: true`);
    }
  });

  test('every manifest permission has a justification', () => {
    const perms = CONFIG.match(/permissions: \[([^\]]*)\]/);
    expect(perms).not.toBeNull();
    for (const p of perms![1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)) {
      expect(`${p}: ${LISTING.includes('| `' + p + '` |')}`).toBe(`${p}: true`);
    }
    expect(LISTING).toContain('Host permission `<all_urls>`');
  });

  test('store version has a changelog line', () => {
    const version = JSON.parse(read('package.json')).version;
    expect(existsSync(join(EXT, 'CHANGELOG.md'))).toBe(true);
    expect(read('CHANGELOG.md')).toContain(`| ${version} |`);
  });
});
