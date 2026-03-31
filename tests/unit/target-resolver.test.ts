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

describe('Step 2: aria role+name resolution', () => {
  it('resolves button by name_contains "create and onboard"', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { role: 'button', name_contains: ['create and onboard'] } });
    expect(result.resolvedVia).toBe('aria');
    expect(result.element?.tagName.toLowerCase()).toBe('button');
  });

  it('returns resolvedVia aria', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { name_contains: ['create and onboard'] } });
    expect(result.resolvedVia).toBe('aria');
  });

  it('returns confidence 0.85', () => {
    const doc = makeDoc();
    const r = new TargetResolver(doc);
    const result = r.resolve({ match: { name_contains: ['create and onboard'] } });
    expect(result.confidence).toBe(0.85);
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
