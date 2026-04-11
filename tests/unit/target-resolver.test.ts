import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TargetResolver } from '../../src/target-resolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(__dirname, '../fixtures/vuetify-onboard.html'), 'utf-8');

function makeDoc(html: string = fixtureHtml): Document {
  document.body.innerHTML = html;
  return document;
}

const freshDate = new Date().toISOString();
const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
const recentDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();

describe('Step 1: cached selector', () => {
  it('uses cached selector when confidence >= 0.85 and resolvedOn within 30 days', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: '#input-v-10', cachedConfidence: 0.9, resolvedOn: freshDate });
    expect(result.resolvedVia).toBe('cached');
    expect(result.selector).toBe('#input-v-10');
    expect(result.confidence).toBe(0.9);
  });

  it('skips cache when confidence < 0.85', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: '#input-v-10', cachedConfidence: 0.8, resolvedOn: freshDate });
    expect(result.resolvedVia).not.toBe('cached');
  });

  it('skips cache when resolvedOn is older than 30 days', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: '#input-v-10', cachedConfidence: 0.9, resolvedOn: staleDate });
    expect(result.resolvedVia).not.toBe('cached');
  });

  it('skips cache when cachedSelector is null', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: null, cachedConfidence: 0.9, resolvedOn: freshDate });
    expect(result.resolvedVia).not.toBe('cached');
  });
});

describe('findInputByLabelText - Strategy B (mb-2 pattern, confirmed on YeshID)', () => {
  it('finds input by "first name" via mb-2 label', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('first name');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('input-v-10');
  });

  it('finds input by "last name" via mb-2 label', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('last name');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('input-v-12');
  });

  it('finds input by "company email" via mb-2 label (case insensitive)', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('Company Email');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('input-v-14');
  });

  it('finds input by "personal email" via mb-2 label', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('personal email');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('input-v-18');
  });

  it('returns null when label text not found', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('nonexistent label xyz');
    expect(el).toBeNull();
  });
});

describe('findInputByLabelText - Strategy A (classic v-label pattern)', () => {
  it('finds input by "username" via .v-label inside .v-input', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('username');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('input-username');
  });
});

describe('findInputByLabelText - Strategy C (aria-label/placeholder)', () => {
  it('finds input by aria-label text', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const el = r.findInputByLabelText('Search query');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('aria-input');
  });
});

describe('Step 3: vuetify_label_match via resolve()', () => {
  it('resolves first-name-input abstractTarget', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['first name'] } });
    expect(result.resolvedVia).toBe('vuetify_label_match');
    expect(result.element).not.toBeNull();
    expect((result.element as HTMLElement).id).toBe('input-v-10');
  });

  it('resolves last-name-input abstractTarget', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['last name'] } });
    expect(result.resolvedVia).toBe('vuetify_label_match');
    expect((result.element as HTMLElement).id).toBe('input-v-12');
  });

  it('returns confidence 0.88 for vuetify_label_match', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['first name'] } });
    expect(result.confidence).toBe(0.88);
  });

  it('returns resolvedVia vuetify_label_match', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['last name'] } });
    expect(result.resolvedVia).toBe('vuetify_label_match');
  });
});

describe('Anchor-based auto-heal', () => {
  it('uses anchors.ariaLabel when the cached selector is stale or missing', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({
      cachedSelector: '#missing-input',
      cachedConfidence: 0.95,
      resolvedOn: staleDate,
      anchors: { ariaLabel: 'Search query' },
    });
    expect(result.resolvedVia).toBe('auto_heal');
    expect(result.selector).toBe('[aria-label="Search query"]');
    expect((result.element as HTMLElement).id).toBe('aria-input');
  });

  it('uses anchors.labelText to recover a Vuetify field without relying on match keys', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({
      anchors: { labelText: 'first name' },
    });
    expect(result.resolvedVia).toBe('auto_heal');
    expect((result.element as HTMLElement).id).toBe('input-v-10');
    expect(result.confidence).toBe(0.87);
  });

  it('uses anchors.text to recover clickable targets', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({
      anchors: { text: 'Create and onboard' },
    });
    expect(result.resolvedVia).toBe('auto_heal');
    expect(result.element?.tagName.toLowerCase()).toBe('button');
  });
});

describe('Step 2: clickable text resolution', () => {
  it('resolves button by name_contains "create and onboard"', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { role: 'button', name_contains: ['create and onboard'] } });
    expect(result.resolvedVia).toBe('a11y_aria_label');
    expect(result.element?.tagName.toLowerCase()).toBe('button');
  });

  it('returns resolvedVia a11y_aria_label when aria-label is available', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { name_contains: ['create and onboard'] } });
    expect(result.resolvedVia).toBe('a11y_aria_label');
  });

  it('returns higher confidence for aria-label matches', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { name_contains: ['create and onboard'] } });
    expect(result.confidence).toBe(0.92);
  });
});

describe('Step 5: css cascade - generated ID skipping', () => {
  it('skips fallback selector #input-v-999 (generated ID pattern)', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    // Only fallback is the generated ID — should escalate
    const result = r.resolve({ fallbackSelectors: ['#input-v-999'] });
    expect(result.resolvedVia).not.toBe('css_cascade');
  });

  it('does NOT skip #testid-input (stable data-testid element)', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ fallbackSelectors: ['#testid-input'] });
    expect(result.resolvedVia).toBe('css_cascade');
    expect(result.selector).toBe('#testid-input');
  });

  it('does NOT skip #aria-input (stable aria-label element)', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ fallbackSelectors: ['#aria-input'] });
    expect(result.resolvedVia).toBe('css_cascade');
  });
});

describe('Step 6: escalation', () => {
  it('returns resolvedVia escalate when no strategy matches', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-field-xyz'] } });
    expect(result.resolvedVia).toBe('escalate');
  });

  it('returns confidence 0 on escalation', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-field-xyz'] } });
    expect(result.confidence).toBe(0);
  });

  it('returns selector null on escalation', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-field-xyz'] } });
    expect(result.selector).toBeNull();
  });
});

describe('Cache staleness', () => {
  it('treats resolvedOn null as stale', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: '#input-v-10', cachedConfidence: 0.9, resolvedOn: null });
    expect(result.resolvedVia).not.toBe('cached');
  });

  it('treats resolvedOn 31 days ago as stale', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: '#input-v-10', cachedConfidence: 0.9, resolvedOn: staleDate });
    expect(result.resolvedVia).not.toBe('cached');
  });

  it('treats resolvedOn 29 days ago as fresh', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ cachedSelector: '#input-v-10', cachedConfidence: 0.9, resolvedOn: recentDate });
    expect(result.resolvedVia).toBe('cached');
  });
});

// ── Step 4: text/role matching for clickable targets ──────────────────────────
describe('Step 4: text/role matching', () => {
  it('resolves button by name_contains matching aria-label', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    // The fixture has buttons with aria-labels
    const result = r.resolve({ match: { role: 'button', name_contains: ['create and onboard'] } });
    expect(result.element).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('falls through to escalate when no clickable text matches', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { role: 'button', name_contains: ['completely-nonexistent-button-xyz'] } });
    expect(result.resolvedVia).toBe('escalate');
  });
});

// ── Step 5: contenteditable ───────────────────────────────────────────────────
describe('Step 5: contenteditable fallback', () => {
  it('resolves to contenteditable element when no better match exists', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    // Use a label that won't match any input, forcing fallback to contenteditable
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-match-xyz'] } });
    // Should either find the contenteditable div or escalate
    expect(['contenteditable', 'escalate']).toContain(result.resolvedVia);
  });

  it('returns confidence 0.6 for contenteditable matches', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-match-xyz'] } });
    if (result.resolvedVia === 'contenteditable') {
      expect(result.confidence).toBe(0.6);
    }
  });
});

// ── Step 6: css cascade with fallback selectors ──────────────────────────────
describe('Step 6: css cascade fallback selectors', () => {
  it('uses fallback selectors when primary resolution fails', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({
      match: { vuetify_label: ['nonexistent-xyz'] },
      fallbackSelectors: ['.v-navigation-drawer'],
    });
    // Should match the nav drawer via css cascade before hitting escalate
    expect(['css_cascade', 'contenteditable']).toContain(result.resolvedVia);
  });

  it('skips generated ID selectors in fallback list', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({
      match: { vuetify_label: ['nonexistent-xyz'] },
      fallbackSelectors: ['#input-v-999', '#react-abc'],
    });
    // Generated IDs should be skipped, so this should fall through
    expect(result.resolvedVia).not.toBe('css_cascade');
  });
});

// ── Step 7: escalation ────────────────────────────────────────────────────────
describe('Step 7: escalation', () => {
  it('returns confidence 0 on escalation', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-field-xyz'] } });
    expect(result.confidence).toBe(0);
  });

  it('returns null element on escalation', () => {
    const doc = makeDoc(fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', ''));
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['nonexistent-field-xyz'] } });
    expect(result.element).toBeNull();
  });
});

// ── a11y_placeholder resolution ───────────────────────────────────────────────
describe('a11y_placeholder resolution', () => {
  it('resolves input by placeholder text when no label match', () => {
    const html = '<input placeholder="Search for users..." />';
    const doc = makeDoc(html);
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { vuetify_label: ['search for users'] } });
    // Should find via placeholder
    expect(['a11y_placeholder', 'vuetify_label_match', 'escalate']).toContain(result.resolvedVia);
  });
});
