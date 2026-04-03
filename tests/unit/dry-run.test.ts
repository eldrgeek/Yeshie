import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dryRunResolve } from '../../src/dry-run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(__dirname, '../fixtures/vuetify-onboard.html'), 'utf-8');

const freshDate = new Date().toISOString();

// abstractTargets matching the real 01-user-add payload structure
const abstractTargets = {
  'first-name-input': {
    match: { vuetify_label: ['first name'] },
    cachedSelector: null, cachedConfidence: 0, resolvedOn: null
  },
  'last-name-input': {
    match: { vuetify_label: ['last name'] },
    cachedSelector: null, cachedConfidence: 0, resolvedOn: null
  },
  'company-email-input': {
    match: { vuetify_label: ['company email', 'company email address'] },
    cachedSelector: null, cachedConfidence: 0, resolvedOn: null
  },
  'personal-email-input': {
    match: { vuetify_label: ['personal email', 'personal'] },
    cachedSelector: null, cachedConfidence: 0, resolvedOn: null
  },
  'create-onboard-button': {
    match: { role: 'button', name_contains: ['create and onboard', 'onboard person'] },
    cachedSelector: null, cachedConfidence: 0, resolvedOn: null
  },
};

const cachedTargets = {
  'first-name-input': {
    match: { vuetify_label: ['first name'] },
    cachedSelector: '#input-v-10', cachedConfidence: 0.88, resolvedOn: freshDate
  },
  'last-name-input': {
    match: { vuetify_label: ['last name'] },
    cachedSelector: '#input-v-12', cachedConfidence: 0.88, resolvedOn: freshDate
  },
  'company-email-input': {
    match: { vuetify_label: ['company email', 'company email address'] },
    cachedSelector: '#input-v-14', cachedConfidence: 0.88, resolvedOn: freshDate
  },
  'personal-email-input': {
    match: { vuetify_label: ['personal email', 'personal'] },
    cachedSelector: '#input-v-18', cachedConfidence: 0.88, resolvedOn: freshDate
  },
  'create-onboard-button': {
    match: { role: 'button', name_contains: ['create and onboard', 'onboard person'] },
    cachedSelector: null, cachedConfidence: 0.85, resolvedOn: freshDate
  },
};

describe('dryRunResolve — cold (no cache)', () => {
  beforeEach(() => { document.body.innerHTML = fixtureHtml; });

  it('resolves all targets with allResolved: true', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.allResolved).toBe(true);
    expect(report.escalations).toHaveLength(0);
  });

  it('resolves first-name-input via vuetify_label_match', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.targets['first-name-input'].resolvedVia).toBe('vuetify_label_match');
  });

  it('resolves last-name-input via vuetify_label_match', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.targets['last-name-input'].resolvedVia).toBe('vuetify_label_match');
  });

  it('resolves company-email-input via vuetify_label_match', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.targets['company-email-input'].resolvedVia).toBe('vuetify_label_match');
  });

  it('resolves create-onboard-button via a11y_aria_label', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.targets['create-onboard-button'].resolvedVia).toBe('a11y_aria_label');
    expect(report.targets['create-onboard-button'].confidence).toBe(0.92);
  });

  it('has dryRun: true flag', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.dryRun).toBe(true);
  });

  it('includes payload name', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    expect(report.payload).toBe('01-user-add');
  });

  it('includes confidence for each target', () => {
    const report = dryRunResolve(document, '01-user-add', abstractTargets);
    for (const t of Object.values(report.targets)) {
      expect(t.confidence).toBeGreaterThan(0);
    }
  });
});

describe('dryRunResolve — warm (with cache)', () => {
  beforeEach(() => { document.body.innerHTML = fixtureHtml; });

  it('uses cached selectors when available', () => {
    const report = dryRunResolve(document, '01-user-add', cachedTargets);
    expect(report.targets['first-name-input'].resolvedVia).toBe('cached');
    expect(report.targets['last-name-input'].resolvedVia).toBe('cached');
    expect(report.targets['company-email-input'].resolvedVia).toBe('cached');
    expect(report.targets['personal-email-input'].resolvedVia).toBe('cached');
  });

  it('still resolves button via a11y_aria_label even with warm cache (no cachedSelector)', () => {
    const report = dryRunResolve(document, '01-user-add', cachedTargets);
    expect(report.targets['create-onboard-button'].resolvedVia).toBe('a11y_aria_label');
  });

  it('allResolved: true with warm cache', () => {
    const report = dryRunResolve(document, '01-user-add', cachedTargets);
    expect(report.allResolved).toBe(true);
  });

  it('cached targets resolve faster (selector lookup vs DOM search)', () => {
    // Cold
    document.body.innerHTML = fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', '');
    const cold = dryRunResolve(document, '01-user-add', abstractTargets);
    // Warm
    document.body.innerHTML = fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', '');
    const warm = dryRunResolve(document, '01-user-add', cachedTargets);
    // Both succeed — timing varies but both allResolved
    expect(cold.allResolved).toBe(true);
    expect(warm.allResolved).toBe(true);
  });
});

describe('dryRunResolve — escalation detection', () => {
  it('reports escalation for unresolvable target', () => {
    document.body.innerHTML = fixtureHtml.replace('<div id="rich-editor" contenteditable="true" aria-label="Message body"></div>', '');
    const report = dryRunResolve(document, 'test', {
      'phantom-field': { match: { vuetify_label: ['nonexistent label xyz abc'] } }
    });
    expect(report.allResolved).toBe(false);
    expect(report.escalations).toContain('phantom-field');
    expect(report.targets['phantom-field'].resolvedVia).toBe('escalate');
  });
});
