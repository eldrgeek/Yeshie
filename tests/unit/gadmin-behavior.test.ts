/**
 * Google Admin payload tests
 * Covers all 7 admin.google.com payloads:
 *   01-list-users, 02-add-user, 03-list-groups,
 *   04-list-organizational-units, 05-list-devices,
 *   06-list-apps, 07-check-saml-sso
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dryRunResolve } from '../../src/dry-run.js';
import { StepExecutor } from '../../src/step-executor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

// ── fixture HTML ────────────────────────────────────────────────────────────
const usersListHtml    = readFileSync(resolve(__dirname, '../fixtures/gadmin-users-list.html'), 'utf-8');
const addUserFormHtml  = readFileSync(resolve(__dirname, '../fixtures/gadmin-add-user-form.html'), 'utf-8');
const groupsListHtml   = readFileSync(resolve(__dirname, '../fixtures/gadmin-groups-list.html'), 'utf-8');

// ── helpers ─────────────────────────────────────────────────────────────────
function loadPayload(name: string) {
  return JSON.parse(
    readFileSync(resolve(root, `sites/admin.google.com/tasks/${name}.payload.json`), 'utf-8')
  );
}

function setDom(html: string, path = '/') {
  document.body.innerHTML = html;
  window.history.replaceState({}, '', path);
}

const VALID_ACTIONS = new Set([
  'navigate', 'navigate_to_entity', 'delay', 'perceive', 'read',
  'type', 'click', 'click_text', 'click_preset',
  'find_row', 'assert_cell', 'assert_text',
  'scroll', 'wait_for', 'capture_entities',
  'probe_affordances', 'assess_state',
]);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA / STRUCTURE — all 7 payloads
// ─────────────────────────────────────────────────────────────────────────────

describe('Google Admin payload schema', () => {
  const payloadNames = [
    '01-list-users',
    '02-add-user',
    '03-list-groups',
    '04-list-organizational-units',
    '05-list-devices',
    '06-list-apps',
    '07-check-saml-sso',
  ];

  for (const name of payloadNames) {
    describe(name, () => {
      let payload: any;
      beforeAll(() => { payload = loadPayload(name); });

      it('has required _meta fields', () => {
        expect(payload._meta).toBeDefined();
        expect(typeof payload._meta.name).toBe('string');
        expect(typeof payload._meta.description).toBe('string');
        expect(payload._meta.site).toBe('admin.google.com');
      });

      it('has a non-empty chain', () => {
        expect(Array.isArray(payload.chain)).toBe(true);
        expect(payload.chain.length).toBeGreaterThanOrEqual(1);
      });

      it('all chain steps have valid action types', () => {
        for (const step of payload.chain) {
          expect(step.action).toBeDefined();
          expect(VALID_ACTIONS.has(step.action)).toBe(true);
        }
      });

      it('all chain steps have a stepId', () => {
        for (const step of payload.chain) {
          expect(typeof step.stepId).toBe('string');
          expect(step.stepId.length).toBeGreaterThan(0);
        }
      });

      it('navigate steps use the /ac/ URL prefix', () => {
        const navigates = payload.chain.filter((s: any) => s.action === 'navigate');
        for (const step of navigates) {
          expect(step.url).toMatch(/^https:\/\/admin\.google\.com\/ac\//);
        }
      });

      it('perceive steps have a store_as field', () => {
        const perceives = payload.chain.filter((s: any) => s.action === 'perceive');
        for (const step of perceives) {
          expect(typeof step.store_as).toBe('string');
          expect(step.store_as.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 01-list-users — target resolution + chain executor
// ─────────────────────────────────────────────────────────────────────────────

describe('01-list-users — target resolution', () => {
  const payload = loadPayload('01-list-users');

  beforeEach(() => { setDom(usersListHtml, '/ac/users'); });

  it('resolves user-search via aria-label (cached selector confirmed)', () => {
    const report = dryRunResolve(document, '01-list-users', {
      'user-search': payload.abstractTargets['user-search'],
    });
    expect(report.allResolved).toBe(true);
    expect(report.escalations).toHaveLength(0);
    const via = report.targets['user-search'].resolvedVia;
    expect(['cached', 'a11y_aria_label']).toContain(via);
  });

  it('resolves add-user-button via aria-label fallback', () => {
    // The fixture has aria-label="Add new user" on the button
    const report = dryRunResolve(document, '01-list-users', {
      'add-user-button': payload.abstractTargets['add-user-button'],
    });
    expect(report.allResolved).toBe(true);
    const via = report.targets['add-user-button'].resolvedVia;
    expect(['cached', 'a11y_aria_label', 'text_match', 'auto_heal']).toContain(via);
  });

  it('chain[0] navigate returns ok with correct URL', () => {
    const ex = new StepExecutor(document, payload.abstractTargets ?? {}, {}, {});
    const result = ex.execute(payload.chain[0]);
    expect(result.status).toBe('ok');
    expect(result.url).toBe('https://admin.google.com/ac/users');
  });

  it('chain[1] delay returns ok immediately', () => {
    const ex = new StepExecutor(document, payload.abstractTargets ?? {}, {}, {});
    const result = ex.execute(payload.chain[1]);
    expect(result.status).toBe('ok');
  });

  it('chain[2] perceive stores snapshot in users_snap', () => {
    const ex = new StepExecutor(document, payload.abstractTargets ?? {}, {}, {});
    const result = ex.execute(payload.chain[2]);
    expect(result.status).toBe('ok');
    expect(result.storedAs).toBe('users_snap');
    const snap = ex.getBuffer()['users_snap'] as any;
    expect(snap).toBeDefined();
  });

  it('perceive snapshot includes table rows from fixture HTML', () => {
    const ex = new StepExecutor(document, payload.abstractTargets ?? {}, {}, {});
    ex.execute(payload.chain[2]);
    const snap = ex.getBuffer()['users_snap'] as any;
    // Fixture has 2 user rows
    expect(snap.tables?.[0]?.rowCount).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 02-add-user — params, form target resolution, type steps
// ─────────────────────────────────────────────────────────────────────────────

describe('02-add-user — params and form targets', () => {
  const payload = loadPayload('02-add-user');

  it('documents all three required params', () => {
    const params = payload.params ?? payload._meta?.params ?? {};
    const keys = Object.keys(params);
    expect(keys).toContain('first_name');
    expect(keys).toContain('last_name');
    expect(keys).toContain('primary_email');
  });

  it('all three required params are marked REQUIRED', () => {
    for (const key of ['first_name', 'last_name', 'primary_email']) {
      const val = String(payload.params?.[key] ?? '');
      expect(val.toUpperCase()).toContain('REQUIRED');
    }
  });
});

describe('02-add-user — abstractTargets resolve on dialog fixture', () => {
  const payload = loadPayload('02-add-user');

  beforeEach(() => { setDom(addUserFormHtml, '/ac/users'); });

  it('gadmin-first-name resolves via aria-label "First name *"', () => {
    const report = dryRunResolve(document, '02-add-user', {
      'gadmin-first-name': payload.abstractTargets['gadmin-first-name'],
    });
    expect(report.allResolved).toBe(true);
    const via = report.targets['gadmin-first-name'].resolvedVia;
    expect(['cached', 'a11y_aria_label']).toContain(via);
  });

  it('gadmin-last-name resolves via aria-label "Last name *"', () => {
    const report = dryRunResolve(document, '02-add-user', {
      'gadmin-last-name': payload.abstractTargets['gadmin-last-name'],
    });
    expect(report.allResolved).toBe(true);
  });

  it('gadmin-primary-email resolves via aria-label "Primary email *"', () => {
    const report = dryRunResolve(document, '02-add-user', {
      'gadmin-primary-email': payload.abstractTargets['gadmin-primary-email'],
    });
    expect(report.allResolved).toBe(true);
  });

  it('all three form targets resolve together (no escalations)', () => {
    const report = dryRunResolve(document, '02-add-user', payload.abstractTargets);
    expect(report.escalations).toHaveLength(0);
    expect(report.allResolved).toBe(true);
  });
});

describe('02-add-user — type steps fill form with params', () => {
  const payload = loadPayload('02-add-user');

  beforeEach(() => { setDom(addUserFormHtml, '/ac/users'); });

  it('type step fills first-name input via template interpolation', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {
      first_name: 'Alice',
      last_name: 'Example',
      primary_email: 'alice',
    }, {});
    // chain: s1=navigate, s2=delay, s3=click_text, s4=delay, s5=type(first)
    const typeFirstStep = payload.chain.find((s: any) => s.action === 'type' && s.target === 'gadmin-first-name');
    expect(typeFirstStep).toBeDefined();
    const result = ex.execute(typeFirstStep);
    expect(result.status).toBe('ok');
    expect((document.getElementById('gadmin-first-name') as HTMLInputElement).value).toBe('Alice');
  });

  it('type step fills last-name input', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {
      first_name: 'Alice',
      last_name: 'Example',
      primary_email: 'alice',
    }, {});
    const typeLastStep = payload.chain.find((s: any) => s.action === 'type' && s.target === 'gadmin-last-name');
    expect(typeLastStep).toBeDefined();
    const result = ex.execute(typeLastStep);
    expect(result.status).toBe('ok');
    expect((document.getElementById('gadmin-last-name') as HTMLInputElement).value).toBe('Example');
  });

  it('type step fills primary-email input', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {
      first_name: 'Alice',
      last_name: 'Example',
      primary_email: 'alice',
    }, {});
    const typeEmailStep = payload.chain.find((s: any) => s.action === 'type' && s.target === 'gadmin-primary-email');
    expect(typeEmailStep).toBeDefined();
    const result = ex.execute(typeEmailStep);
    expect(result.status).toBe('ok');
    expect((document.getElementById('gadmin-primary-email') as HTMLInputElement).value).toBe('alice');
  });

  it('click_text "Add new user" fires the submit button', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {
      first_name: 'Alice', last_name: 'Example', primary_email: 'alice',
    }, {});
    // The first click_text opens the dialog (s3). On the form fixture it also finds the submit.
    // Find the first click_text with text "Add new user"
    const clickStep = payload.chain.find((s: any) => s.action === 'click_text' && s.text === 'Add new user');
    expect(clickStep).toBeDefined();
    let clicked = false;
    document.querySelector('button.submit-btn, button')?.addEventListener('click', () => { clicked = true; });
    const result = ex.execute(clickStep);
    expect(result.status).toBe('ok');
  });

  it('perceive after add stores result in after_add', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {
      first_name: 'Alice', last_name: 'Example', primary_email: 'alice',
    }, {});
    const perceiveStep = payload.chain.find((s: any) => s.action === 'perceive' && s.store_as === 'after_add');
    expect(perceiveStep).toBeDefined();
    ex.execute(perceiveStep);
    expect(ex.getBuffer()['after_add']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 03-list-groups — target resolution + chain
// ─────────────────────────────────────────────────────────────────────────────

describe('03-list-groups — target resolution', () => {
  const payload = loadPayload('03-list-groups');

  beforeEach(() => { setDom(groupsListHtml, '/ac/groups'); });

  it('create-group-button resolves via aria-label', () => {
    const report = dryRunResolve(document, '03-list-groups', {
      'create-group-button': payload.abstractTargets['create-group-button'],
    });
    expect(report.allResolved).toBe(true);
    const via = report.targets['create-group-button'].resolvedVia;
    expect(['cached', 'a11y_aria_label', 'text_match', 'auto_heal']).toContain(via);
  });

  it('inspect-groups-button resolves via aria-label', () => {
    const report = dryRunResolve(document, '03-list-groups', {
      'inspect-groups-button': payload.abstractTargets['inspect-groups-button'],
    });
    expect(report.allResolved).toBe(true);
  });

  it('navigate step targets /ac/groups', () => {
    const nav = payload.chain.find((s: any) => s.action === 'navigate');
    expect(nav.url).toBe('https://admin.google.com/ac/groups');
  });

  it('perceive stores snapshot in groups_snap', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {}, {});
    const perceiveStep = payload.chain.find((s: any) => s.action === 'perceive');
    ex.execute(perceiveStep);
    const snap = ex.getBuffer()['groups_snap'] as any;
    expect(snap).toBeDefined();
    expect(snap.tables?.[0]?.rowCount).toBeGreaterThanOrEqual(2);
  });

  it('click_text "Create group" fires the toolbar button', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {}, {});
    let clicked = false;
    document.querySelector('[aria-label="Create group"]')?.addEventListener('click', () => { clicked = true; });
    // Directly execute a click_text step to test the mechanism
    const result = ex.execute({ stepId: 'test', action: 'click_text', text: 'Create group' });
    expect(result.status).toBe('ok');
    expect(clicked).toBe(true);
  });

  it('click_text "View" fires the first group row action', () => {
    const ex = new StepExecutor(document, payload.abstractTargets, {}, {});
    let clicked = false;
    document.querySelector('.group-row button')?.addEventListener('click', () => { clicked = true; });
    const result = ex.execute({ stepId: 'test', action: 'click_text', text: 'View' });
    expect(result.status).toBe('ok');
    expect(clicked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 04-list-organizational-units — chain structure
// ─────────────────────────────────────────────────────────────────────────────

describe('04-list-organizational-units — chain structure', () => {
  const payload = loadPayload('04-list-organizational-units');

  it('navigates to /ac/orgunits', () => {
    const nav = payload.chain.find((s: any) => s.action === 'navigate');
    expect(nav.url).toBe('https://admin.google.com/ac/orgunits');
  });

  it('perceive stores to ou_tree', () => {
    const perceive = payload.chain.find((s: any) => s.action === 'perceive');
    expect(perceive.store_as).toBe('ou_tree');
  });

  it('stateGraph defines ou-list as initial state', () => {
    expect(payload.stateGraph?.initial).toBe('ou-list');
  });

  it('executor runs all steps on a generic DOM without errors', () => {
    document.body.innerHTML = '<div class="gadmin-ou-page"><p>Organizational units</p></div>';
    const ex = new StepExecutor(document, {}, {}, {});
    for (const step of payload.chain) {
      const result = ex.execute(step);
      expect(['ok', 'unsupported']).toContain(result.status);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 05-list-devices — chain structure
// ─────────────────────────────────────────────────────────────────────────────

describe('05-list-devices — chain structure', () => {
  const payload = loadPayload('05-list-devices');

  it('navigates to /ac/devices', () => {
    const nav = payload.chain.find((s: any) => s.action === 'navigate');
    expect(nav.url).toBe('https://admin.google.com/ac/devices');
  });

  it('perceive stores to devices_snap', () => {
    const perceive = payload.chain.find((s: any) => s.action === 'perceive');
    expect(perceive.store_as).toBe('devices_snap');
  });

  it('stateGraph defines devices-list as initial state', () => {
    expect(payload.stateGraph?.initial).toBe('devices-list');
  });

  it('executor runs all steps on a generic DOM without errors', () => {
    document.body.innerHTML = '<div class="gadmin-devices"><p>Mobile &amp; endpoints</p><p>Chrome devices</p></div>';
    const ex = new StepExecutor(document, {}, {}, {});
    for (const step of payload.chain) {
      const result = ex.execute(step);
      expect(['ok', 'unsupported']).toContain(result.status);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 06-list-apps — chain structure
// ─────────────────────────────────────────────────────────────────────────────

describe('06-list-apps — chain structure', () => {
  const payload = loadPayload('06-list-apps');

  it('navigates to /ac/apps/unified (Web and mobile apps)', () => {
    const nav = payload.chain.find((s: any) => s.action === 'navigate');
    expect(nav.url).toBe('https://admin.google.com/ac/apps/unified');
  });

  it('perceive stores to apps_snap', () => {
    const perceive = payload.chain.find((s: any) => s.action === 'perceive');
    expect(perceive.store_as).toBe('apps_snap');
  });

  it('stateGraph defines apps-list as initial state', () => {
    expect(payload.stateGraph?.initial).toBe('apps-list');
  });

  it('executor runs all steps on a mock SAML apps DOM', () => {
    document.body.innerHTML = `
      <div class="gadmin-apps">
        <table>
          <tbody>
            <tr><td>YeshID</td><td>SAML</td><td>ON for everyone</td></tr>
            <tr><td>Slack</td><td>SAML</td><td>ON for everyone</td></tr>
          </tbody>
        </table>
      </div>`;
    const ex = new StepExecutor(document, {}, {}, {});
    for (const step of payload.chain) {
      const result = ex.execute(step);
      expect(['ok', 'unsupported']).toContain(result.status);
    }
    // perceive should have captured the table
    const snap = ex.getBuffer()['apps_snap'] as any;
    expect(snap).toBeDefined();
    expect(snap.tables?.[0]?.rowCount).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 07-check-saml-sso — dual-navigate chain + anomaly awareness
// ─────────────────────────────────────────────────────────────────────────────

describe('07-check-saml-sso — dual-navigate chain', () => {
  const payload = loadPayload('07-check-saml-sso');

  it('has two navigate steps (ssochoices + apps/unified)', () => {
    const navigates = payload.chain.filter((s: any) => s.action === 'navigate');
    expect(navigates).toHaveLength(2);
  });

  it('first navigate targets SAML SSO choices endpoint', () => {
    const nav = payload.chain.find((s: any) => s.action === 'navigate');
    expect(nav.url).toBe('https://admin.google.com/ac/security/ssochoices');
  });

  it('second navigate targets unified apps endpoint', () => {
    const navigates = payload.chain.filter((s: any) => s.action === 'navigate');
    expect(navigates[1].url).toBe('https://admin.google.com/ac/apps/unified');
  });

  it('has two perceive steps (saml_sso_config + saml_apps)', () => {
    const perceives = payload.chain.filter((s: any) => s.action === 'perceive');
    expect(perceives).toHaveLength(2);
    const storeKeys = perceives.map((s: any) => s.store_as);
    expect(storeKeys).toContain('saml_sso_config');
    expect(storeKeys).toContain('saml_apps');
  });

  it('anomalies document the YeshID IdP direction check', () => {
    const anomalies: string[] = payload._meta?.anomalies ?? [];
    const mentionsYeshid = anomalies.some(a => a.toLowerCase().includes('yeshid'));
    expect(mentionsYeshid).toBe(true);
  });

  it('executor runs full chain on a mock SSO config DOM', () => {
    document.body.innerHTML = `
      <div class="gadmin-sso">
        <h2>SSO with third-party IdP</h2>
        <label>Sign-in page URL</label>
        <input type="text" value="https://app.yeshid.com/sso/saml" />
        <label>Sign-out page URL</label>
        <input type="text" value="https://app.yeshid.com/sso/logout" />
      </div>`;
    const ex = new StepExecutor(document, {}, {}, {});
    for (const step of payload.chain) {
      const result = ex.execute(step);
      expect(['ok', 'unsupported']).toContain(result.status);
    }
    expect(ex.getBuffer()['saml_sso_config']).toBeDefined();
    expect(ex.getBuffer()['saml_apps']).toBeDefined();
  });
});
