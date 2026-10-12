/**
 * scripts/substack.mjs helpers, and the Substack recipes' shape.
 *
 * The recipes prove a save by finding text in Substack's own JSON, which
 * escapes quotes and non-ASCII characters. jsonEscape must produce the same
 * form, or every check on a title with an apostrophe or a dash fails (or,
 * worse, a check written loosely passes on the wrong draft).
 */
import { readFileSync, readdirSync } from 'fs';
import { jsonEscape, parsePost } from '../../scripts/substack.mjs';

const TASKS = new URL('../../sites/substack.com/tasks/', import.meta.url);

describe('jsonEscape: text as it appears inside Substack JSON', () => {
  it('leaves plain ASCII and apostrophes alone', () => {
    expect(jsonEscape("The Three Me's")).toBe("The Three Me's");
  });
  it('escapes non-ASCII as lowercase \\uXXXX, as Substack does', () => {
    expect(jsonEscape('What It’s Like — a note')).toBe('What It\\u2019s Like \\u2014 a note');
  });
  it('escapes quotes and backslashes', () => {
    expect(jsonEscape('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye');
  });
});

describe('parsePost', () => {
  it('reads front matter and returns the Markdown body', () => {
    const { meta, body } = parsePost('---\ntitle: "Beads on a Thread"\nsubtitle: A metaphor\nproof: Mike holds the thread\n---\n# Heading\n\nText.\n');
    expect(meta).toEqual({ title: 'Beads on a Thread', subtitle: 'A metaphor', proof: 'Mike holds the thread' });
    expect(body).toBe('# Heading\n\nText.\n');
  });
  it('treats a file without front matter as all body', () => {
    expect(parsePost('Just text.').meta).toEqual({});
  });
});

describe('sites/substack.com recipes', () => {
  const files = readdirSync(TASKS).filter((f) => f.endsWith('.payload.json'));
  const recipes = files.map((f) => [f, JSON.parse(readFileSync(new URL(f, TASKS), 'utf8'))] as const);

  it.each(recipes)('%s refuses to run on a tab that is not on substack.com', (_f, r) => {
    const first = r.chain[0];
    expect(first.action).toBe('assert');
    expect(first.url_pattern).toMatch(/substack/);
  });

  it.each(recipes.filter(([, r]) => r.dryRunUntil))('%s: dryRunUntil names a step, and nothing before it types, pastes, saves, sends or publishes', (_f, r) => {
    const i = r.chain.findIndex((s: { stepId: string }) => s.stepId === r.dryRunUntil);
    expect(i).toBeGreaterThan(0);
    const safe = r.chain.slice(0, i + 1);
    expect(safe.filter((s: { action: string }) => ['type', 'paste_html', 'key'].includes(s.action))).toEqual(
      // 06-add-byline types a search query before its dry-run stop; nothing is added until s09.
      r.task === 'add-byline' ? [expect.objectContaining({ stepId: 's07', action: 'type' })] : [],
    );
    const clicksText = safe.filter((s: { action: string; text?: string }) => s.action === 'click_text').map((s: { text: string }) => s.text);
    expect(clicksText.filter((t: string) => /save|send|publish|invite/i.test(t) && t !== 'Invite')).toEqual([]);
  });

  it('publish-no-email clicks only "Publish now" then "Publish on web only", each after waiting for it', () => {
    // Since 2026-09-23 Substack asks "Do you want to send this post via email?" after
    // Publish now; "Publish on web only" is the no-email answer. "Also send via email"
    // must never be clicked.
    const r = recipes.find(([f]) => f.startsWith('07-'))![1];
    const textClicks = r.chain.filter((s: { action: string }) => s.action === 'click_text');
    expect(textClicks.map((s: { text: string }) => s.text)).toEqual(['Publish now', 'Publish on web only']);
    expect(JSON.stringify(r.chain)).not.toMatch(/"text":\s*"Also send via email"/);
    const ids = r.chain.map((s: { stepId: string }) => s.stepId);
    for (const click of textClicks) {
      const wait = r.chain.find((s: { action: string; text?: string }) => s.action === 'wait_for' && s.text === click.text);
      expect(wait).toBeDefined();
      expect(ids.indexOf(wait.stepId)).toBe(ids.indexOf(click.stepId) - 1);
    }
  });
});
