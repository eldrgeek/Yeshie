// Tests for survey_page action — validates that StepExecutor returns the expected shape.
// The browser version runs PRE_SURVEY_PAGE via chrome.scripting.executeScript;
// this suite covers the jsdom version used for unit testing.

import { StepExecutor } from '../../src/step-executor.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeExec(html: string, params: Record<string, string> = {}) {
  document.body.innerHTML = html;
  return new StepExecutor(document, {}, params, {});
}

// Minimal HTML simulating a typical app page
const BASIC_HTML = `
<html>
<head><title>Test App</title></head>
<body>
  <h1>Dashboard</h1>
  <nav>
    <a href="/home">Home</a>
    <a href="/users">Users</a>
    <a href="/settings">Settings</a>
  </nav>
  <main>
    <button>Add User</button>
    <button aria-label="Delete">×</button>
    <form action="/search" method="get">
      <input type="text" name="q" placeholder="Search..." />
      <input type="submit" value="Go" />
    </form>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
      <tbody>
        <tr><td>Alice</td><td>alice@example.com</td><td>Admin</td></tr>
        <tr><td>Bob</td><td>bob@example.com</td><td>User</td></tr>
      </tbody>
    </table>
  </main>
</body>
</html>
`;

const LOGIN_HTML = `
<html>
<head><title>Sign In</title></head>
<body>
  <h1>Sign In</h1>
  <form action="/login" method="post">
    <input type="text" name="email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Sign In</button>
  </form>
</body>
</html>
`;

// ── top-level shape ───────────────────────────────────────────────────────────

describe('survey_page — top-level shape', () => {
  it('returns ok status', () => {
    const ex = makeExec(BASIC_HTML);
    const r = ex.execute({ stepId: 's1', action: 'survey_page' });
    expect(r.status).toBe('ok');
    expect(r.action).toBe('survey_page');
  });

  it('result has all required top-level keys', () => {
    const ex = makeExec(BASIC_HTML);
    const r = ex.execute({ stepId: 's1', action: 'survey_page' });
    const result = r.result as any;
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('heading');
    expect(result).toHaveProperty('ready_state');
    expect(result).toHaveProperty('framework_hints');
    expect(result).toHaveProperty('navigation');
    expect(result).toHaveProperty('interactive');
    expect(result).toHaveProperty('auth_signals');
  });

  it('navigation has sidebar, topnav, breadcrumbs, expandable', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.navigation).toHaveProperty('sidebar');
    expect(result.navigation).toHaveProperty('topnav');
    expect(result.navigation).toHaveProperty('breadcrumbs');
    expect(result.navigation).toHaveProperty('expandable');
    expect(Array.isArray(result.navigation.sidebar)).toBe(true);
    expect(Array.isArray(result.navigation.topnav)).toBe(true);
    expect(Array.isArray(result.navigation.breadcrumbs)).toBe(true);
    expect(Array.isArray(result.navigation.expandable)).toBe(true);
  });

  it('interactive has buttons, links, inputs, selects, tables, forms', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const { interactive } = result;
    expect(Array.isArray(interactive.buttons)).toBe(true);
    expect(Array.isArray(interactive.links)).toBe(true);
    expect(Array.isArray(interactive.inputs)).toBe(true);
    expect(Array.isArray(interactive.selects)).toBe(true);
    expect(Array.isArray(interactive.tables)).toBe(true);
    expect(Array.isArray(interactive.forms)).toBe(true);
  });

  it('auth_signals has logged_in boolean and indicators array', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(typeof result.auth_signals.logged_in).toBe('boolean');
    expect(Array.isArray(result.auth_signals.indicators)).toBe(true);
  });

  it('framework_hints is an array', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(Array.isArray(result.framework_hints)).toBe(true);
  });
});

// ── page metadata ─────────────────────────────────────────────────────────────

describe('survey_page — page metadata', () => {
  it('captures page title', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.title).toBe('Test App');
  });

  it('captures h1 heading', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.heading).toBe('Dashboard');
  });

  it('heading is null when no h1', () => {
    const ex = makeExec('<html><body><p>No heading</p></body></html>');
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.heading).toBeNull();
  });

  it('ready_state is complete', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.ready_state).toBe('complete');
  });
});

// ── interactive elements ──────────────────────────────────────────────────────

describe('survey_page — buttons', () => {
  it('finds buttons by tag', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const texts = result.interactive.buttons.map((b: any) => b.text);
    expect(texts).toContain('Add User');
  });

  it('captures aria-label on buttons', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const deleteBtn = result.interactive.buttons.find((b: any) => b.aria_label === 'Delete');
    expect(deleteBtn).toBeDefined();
  });

  it('each button has text, aria_label, selector fields', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    for (const btn of result.interactive.buttons) {
      expect(btn).toHaveProperty('text');
      expect(btn).toHaveProperty('aria_label');
      expect(btn).toHaveProperty('selector');
    }
  });
});

describe('survey_page — links', () => {
  it('finds links from nav', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const hrefs = result.interactive.links.map((l: any) => l.href);
    expect(hrefs).toContain('/home');
    expect(hrefs).toContain('/users');
  });

  it('each link has text, href, selector fields', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    for (const link of result.interactive.links) {
      expect(link).toHaveProperty('text');
      expect(link).toHaveProperty('href');
      expect(link).toHaveProperty('selector');
    }
  });
});

describe('survey_page — inputs', () => {
  it('finds text inputs', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const names = result.interactive.inputs.map((i: any) => i.name);
    expect(names).toContain('q');
  });

  it('each input has type, placeholder, name, aria_label, label, selector', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    for (const inp of result.interactive.inputs) {
      expect(inp).toHaveProperty('type');
      expect(inp).toHaveProperty('placeholder');
      expect(inp).toHaveProperty('name');
      expect(inp).toHaveProperty('aria_label');
      expect(inp).toHaveProperty('label');
      expect(inp).toHaveProperty('selector');
    }
  });

  it('captures placeholder text', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const searchInput = result.interactive.inputs.find((i: any) => i.name === 'q');
    expect(searchInput?.placeholder).toBe('Search...');
  });
});

describe('survey_page — tables', () => {
  it('finds tables and captures headers', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.interactive.tables).toHaveLength(1);
    const table = result.interactive.tables[0];
    expect(table.headers).toContain('Name');
    expect(table.headers).toContain('Email');
    expect(table.headers).toContain('Role');
  });

  it('counts rows correctly', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.interactive.tables[0].row_count).toBe(2);
  });

  it('each table has headers array and row_count number', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    for (const table of result.interactive.tables) {
      expect(Array.isArray(table.headers)).toBe(true);
      expect(typeof table.row_count).toBe('number');
    }
  });
});

describe('survey_page — forms', () => {
  it('finds forms and captures action/method', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    expect(result.interactive.forms).toHaveLength(1);
    const form = result.interactive.forms[0];
    expect(form.action).toBe('/search');
    expect(form.method).toBe('get');
  });

  it('each form has action, method, fields', () => {
    const ex = makeExec(BASIC_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    for (const form of result.interactive.forms) {
      expect(form).toHaveProperty('action');
      expect(form).toHaveProperty('method');
      expect(Array.isArray(form.fields)).toBe(true);
    }
  });

  it('login form has password field', () => {
    const ex = makeExec(LOGIN_HTML);
    const result = (ex.execute({ stepId: 's1', action: 'survey_page' }).result) as any;
    const form = result.interactive.forms[0];
    const types = form.fields.map((f: any) => f.type);
    expect(types).toContain('password');
  });
});

// ── store_as ──────────────────────────────────────────────────────────────────

describe('survey_page — store_as', () => {
  it('stores result in buffer when store_as set', () => {
    const ex = makeExec(BASIC_HTML);
    ex.execute({ stepId: 's1', action: 'survey_page', store_as: 'page_survey' });
    const buf = ex.getBuffer();
    expect(buf['page_survey']).toBeDefined();
    expect((buf['page_survey'] as any).title).toBe('Test App');
  });

  it('storedAs field in result matches store_as', () => {
    const ex = makeExec(BASIC_HTML);
    const r = ex.execute({ stepId: 's1', action: 'survey_page', store_as: 'my_survey' });
    expect(r.storedAs).toBe('my_survey');
  });

  it('does not set storedAs when store_as omitted', () => {
    const ex = makeExec(BASIC_HTML);
    const r = ex.execute({ stepId: 's1', action: 'survey_page' });
    expect(r.storedAs).toBeUndefined();
  });
});

// ── empty pages ───────────────────────────────────────────────────────────────

describe('survey_page — empty / minimal pages', () => {
  it('returns valid shape for empty body', () => {
    const ex = makeExec('<html><head><title>Empty</title></head><body></body></html>');
    const r = ex.execute({ stepId: 's1', action: 'survey_page' });
    expect(r.status).toBe('ok');
    const result = r.result as any;
    expect(result.interactive.buttons).toHaveLength(0);
    expect(result.interactive.links).toHaveLength(0);
    expect(result.interactive.inputs).toHaveLength(0);
    expect(result.interactive.tables).toHaveLength(0);
    expect(result.interactive.forms).toHaveLength(0);
  });

  it('returns valid shape for page with no nav', () => {
    const ex = makeExec('<html><body><h1>Hello</h1><p>World</p></body></html>');
    const r = ex.execute({ stepId: 's1', action: 'survey_page' });
    const result = r.result as any;
    expect(result.navigation.sidebar).toHaveLength(0);
    expect(result.navigation.topnav).toHaveLength(0);
  });
});
