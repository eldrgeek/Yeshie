import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { StepExecutor, StateGraph } from '../../src/step-executor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(__dirname, '../fixtures/vuetify-onboard.html'), 'utf-8');

const abstractTargets = {
  'first-name-input':    { match: { vuetify_label: ['first name'] },    cachedSelector: null, cachedConfidence: 0 },
  'last-name-input':     { match: { vuetify_label: ['last name'] },     cachedSelector: null, cachedConfidence: 0 },
  'company-email-input': { match: { vuetify_label: ['company email', 'company email address'] }, cachedSelector: null, cachedConfidence: 0 },
  'create-onboard-button': { match: { role: 'button', name_contains: ['create and onboard'] }, cachedSelector: null, cachedConfidence: 0 },
};

const stateGraph: StateGraph = {
  nodes: {
    authenticated: { signals: [{ type: 'element_visible', selector: '.v-navigation-drawer' }] },
    onboard_form:  { signals: [{ type: 'element_visible', selector: 'input#input-v-10' }] },
  }
};

function makeExec(params: Record<string,string> = {}) {
  document.body.innerHTML = fixtureHtml;
  return new StepExecutor(document, abstractTargets, params, {});
}

// ── condition gate ────────────────────────────────────────────────────────────
describe('condition gate', () => {
  it('skips step when condition interpolates to empty string', () => {
    const ex = makeExec({ optional_email: '' });
    const r = ex.execute({ stepId: 's1', action: 'navigate', url: 'https://x.com', condition: '{{optional_email}}' });
    expect(r.status).toBe('skipped');
  });

  it('skips step when condition is literal false', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's1', action: 'navigate', url: 'https://x.com', condition: 'false' });
    expect(r.status).toBe('skipped');
  });

  it('runs step when condition interpolates to non-empty value', () => {
    const ex = makeExec({ optional_email: 'test@example.com' });
    const r = ex.execute({ stepId: 's1', action: 'navigate', url: 'https://x.com', condition: '{{optional_email}}' });
    expect(r.status).toBe('ok');
  });

  it('runs step when no condition set', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's1', action: 'navigate', url: 'https://x.com' });
    expect(r.status).toBe('ok');
  });
});

// ── assess_state ──────────────────────────────────────────────────────────────
describe('assess_state', () => {
  it('returns authenticated when .v-navigation-drawer present', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's1', action: 'assess_state', expect: { state: 'authenticated' } }, stateGraph);
    expect(r.status).toBe('ok');
    expect(r.state).toBe('authenticated');
  });

  it('returns unknown when no signals match', () => {
    document.body.innerHTML = '<div>nothing here</div>';
    const ex = new StepExecutor(document, {}, {}, {});
    const r = ex.execute({ stepId: 's1', action: 'assess_state' }, stateGraph);
    expect(r.state).toBe('unknown');
  });

  it('matched: true when state equals expect.state', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's1', action: 'assess_state', expect: { state: 'authenticated' } }, stateGraph);
    expect(r.matched).toBe(true);
  });

  it('matched: false when state does not equal expect.state', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's1', action: 'assess_state', expect: { state: 'unauthenticated' } }, stateGraph);
    expect(r.matched).toBe(false);
  });
});

// ── type ──────────────────────────────────────────────────────────────────────
describe('type action', () => {
  it('types into first-name-input via abstract target', () => {
    const ex = makeExec({ first_name: 'Alice' });
    const r = ex.execute({ stepId: 's3', action: 'type', target: 'first-name-input', value: '{{first_name}}' });
    expect(r.status).toBe('ok');
    expect(r.value).toBe('Alice');
    expect((document.querySelector('#input-v-10') as HTMLInputElement).value).toBe('Alice');
  });

  it('types via direct selector', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's3', action: 'type', selector: '#input-v-12', value: 'DirectValue' });
    expect(r.status).toBe('ok');
    expect(r.value).toBe('DirectValue');
  });

  it('interpolates {{first_name}} param into value', () => {
    const ex = makeExec({ first_name: 'Bob' });
    const r = ex.execute({ stepId: 's3', action: 'type', target: 'first-name-input', value: '{{first_name}}' });
    expect(r.value).toBe('Bob');
  });

  it('returns resolvedVia vuetify_label_match for abstract target', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's3', action: 'type', target: 'first-name-input', value: 'X' });
    expect(r.resolvedVia).toBe('vuetify_label_match');
  });

  it('returns error when target not found', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's3', action: 'type', target: 'nonexistent-target', value: 'X' });
    expect(r.status).toBe('error');
    expect(r.error).toContain('nonexistent-target');
  });
});

// ── click ─────────────────────────────────────────────────────────────────────
describe('click action', () => {
  it('clicks button via abstract target (name_contains)', () => {
    const ex = makeExec();
    let clicked = false;
    const btn = document.querySelector('button.v-btn');
    btn?.addEventListener('click', () => { clicked = true; });
    const r = ex.execute({ stepId: 's7', action: 'click', target: 'create-onboard-button' });
    expect(r.status).toBe('ok');
    expect(clicked).toBe(true);
  });

  it('clicks element via direct selector', () => {
    const ex = makeExec();
    let clicked = false;
    document.querySelector('#aria-input')?.addEventListener('click', () => { clicked = true; });
    const r = ex.execute({ stepId: 's7', action: 'click', selector: '#aria-input' });
    expect(r.status).toBe('ok');
    expect(clicked).toBe(true);
  });

  it('returns error when target not found', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's7', action: 'click', target: 'ghost-button' });
    expect(r.status).toBe('error');
  });
});

// ── navigate ──────────────────────────────────────────────────────────────────
describe('navigate action', () => {
  it('returns ok with url', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's2', action: 'navigate', url: 'https://app.yeshid.com/people' });
    expect(r.status).toBe('ok');
    expect(r.value).toBe('https://app.yeshid.com/people');
  });

  it('interpolates {{base_url}} param', () => {
    const ex = makeExec({ base_url: 'https://app.yeshid.com' });
    const r = ex.execute({ stepId: 's2', action: 'navigate', url: '{{base_url}}/organization/people/onboard' });
    expect(r.value).toBe('https://app.yeshid.com/organization/people/onboard');
  });
});

// ── wait_for ──────────────────────────────────────────────────────────────────
describe('wait_for action', () => {
  it('returns ok when element exists in DOM', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's2', action: 'wait_for', selector: '#input-v-10' });
    expect(r.status).toBe('ok');
    expect(r.selector).toBe('#input-v-10');
  });

  it('returns error when element not found', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's2', action: 'wait_for', selector: '#does-not-exist' });
    expect(r.status).toBe('error');
  });
});

// ── read ──────────────────────────────────────────────────────────────────────
describe('read action', () => {
  it('reads text from first matching candidate selector', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's8', action: 'read', candidates: ['.v-snackbar__content'] });
    expect(r.status).toBe('ok');
    expect(r.text).toBe('User added successfully');
  });

  it('stores text to buffer via store_as', () => {
    const buffer: Record<string, any> = {};
    document.body.innerHTML = fixtureHtml;
    const ex = new StepExecutor(document, {}, {}, buffer);
    ex.execute({ stepId: 's8', action: 'read', candidates: ['.v-snackbar__content'], store_as: 'confirmation' });
    expect(buffer['confirmation']).toBe('User added successfully');
  });

  it('returns null text when no candidate matches', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's8', action: 'read', candidates: ['.v-nonexistent'] });
    expect(r.status).toBe('ok');
    expect(r.text).toBeNull();
  });

  it('skips non-matching candidates and uses first match', () => {
    const ex = makeExec();
    const r = ex.execute({ stepId: 's8', action: 'read', candidates: ['.v-nonexistent', '.v-snackbar__content'] });
    expect(r.text).toBe('User added successfully');
    expect(r.selector).toBe('.v-snackbar__content');
  });
});
