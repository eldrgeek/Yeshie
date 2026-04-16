import { TargetResolver, querySelectorAllDeep, querySelectorDeep } from '../../src/target-resolver.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDoc(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

/** Attach an open shadow root to `host` and place `innerHtml` inside it. */
function attachOpenShadow(host: Element, innerHtml: string): ShadowRoot {
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = innerHtml;
  return shadow;
}

// ── querySelectorAllDeep ──────────────────────────────────────────────────────

describe('querySelectorAllDeep', () => {
  it('finds elements in the light DOM', () => {
    makeDoc('<button id="light-btn">Light</button>');
    const results = querySelectorAllDeep('button');
    expect(results.some(el => el.id === 'light-btn')).toBe(true);
  });

  it('finds elements inside an open shadow root', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<button id="shadow-btn">Shadow</button>');
    const results = querySelectorAllDeep('button');
    expect(results.some(el => el.id === 'shadow-btn')).toBe(true);
  });

  it('finds elements in both light DOM and shadow DOM', () => {
    makeDoc('<button id="light-btn">Light</button><div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<button id="shadow-btn">Shadow</button>');
    const results = querySelectorAllDeep('button');
    expect(results.some(el => el.id === 'light-btn')).toBe(true);
    expect(results.some(el => el.id === 'shadow-btn')).toBe(true);
  });

  it('finds elements in nested shadow roots', () => {
    makeDoc('<div id="outer-host"></div>');
    const outerHost = document.getElementById('outer-host')!;
    const outerShadow = attachOpenShadow(outerHost, '<div id="inner-host"></div>');
    const innerHost = outerShadow.getElementById('inner-host')!;
    attachOpenShadow(innerHost, '<button id="deep-btn">Deep</button>');
    const results = querySelectorAllDeep('button');
    expect(results.some(el => el.id === 'deep-btn')).toBe(true);
  });

  it('does not find elements when selector does not match', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<span>No button here</span>');
    const results = querySelectorAllDeep('#nonexistent-id-xyz');
    expect(results).toHaveLength(0);
  });

  it('accepts a custom root element', () => {
    makeDoc('<div id="root"><button id="inside">Yes</button></div><button id="outside">No</button>');
    const root = document.getElementById('root')!;
    const results = querySelectorAllDeep('button', root);
    expect(results.some(el => el.id === 'inside')).toBe(true);
    expect(results.some(el => el.id === 'outside')).toBe(false);
  });
});

// ── querySelectorDeep ─────────────────────────────────────────────────────────

describe('querySelectorDeep', () => {
  it('returns first matching element from light DOM', () => {
    makeDoc('<input id="first" /><input id="second" />');
    const el = querySelectorDeep('input');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('first');
  });

  it('returns element from shadow DOM when light DOM has no match', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<input id="shadow-input" aria-label="Shadow field" />');
    const el = querySelectorDeep('[aria-label="Shadow field"]');
    expect(el).not.toBeNull();
    expect((el as HTMLElement).id).toBe('shadow-input');
  });

  it('returns null when no match anywhere', () => {
    makeDoc('<p>No inputs here</p>');
    const el = querySelectorDeep('input');
    expect(el).toBeNull();
  });
});

// ── data_se attribute resolution ──────────────────────────────────────────────

describe('data_se attribute resolution', () => {
  it('resolves element by data_se in light DOM', () => {
    makeDoc('<button data-se="header-admin-button">Admin</button>');
    const r = new TargetResolver(document);
    const result = r.resolve({ data_se: 'header-admin-button' });
    expect(result.resolvedVia).toBe('data_se');
    expect(result.confidence).toBe(0.92);
    expect(result.selector).toBe('[data-se="header-admin-button"]');
    expect(result.element).not.toBeNull();
  });

  it('resolves element by data_se inside shadow DOM', () => {
    makeDoc('<div id="shadow-host"></div>');
    const host = document.getElementById('shadow-host')!;
    attachOpenShadow(host, '<button data-se="shadow-admin-btn">Shadow Admin</button>');
    const r = new TargetResolver(document);
    const result = r.resolve({ data_se: 'shadow-admin-btn' });
    expect(result.resolvedVia).toBe('data_se');
    expect(result.confidence).toBe(0.92);
    expect(result.element).not.toBeNull();
    expect((result.element as HTMLElement).getAttribute('data-se')).toBe('shadow-admin-btn');
  });

  it('falls through to next step when data_se does not match', () => {
    makeDoc('<button aria-label="Admin">Admin</button>');
    const r = new TargetResolver(document);
    const result = r.resolve({ data_se: 'nonexistent-data-se', match: { name_contains: ['Admin'] } });
    expect(result.resolvedVia).not.toBe('data_se');
    expect(result.resolvedVia).not.toBe('escalate');
  });

  it('data_se resolves before cache check only when cache is stale', () => {
    makeDoc('<button data-se="stable-btn">Stable</button>');
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const r = new TargetResolver(document);
    const result = r.resolve({
      cachedSelector: '#nonexistent',
      cachedConfidence: 0.95,
      resolvedOn: staleDate,
      data_se: 'stable-btn',
    });
    expect(result.resolvedVia).toBe('data_se');
  });
});

// ── Shadow DOM target resolution ──────────────────────────────────────────────

describe('Target resolution inside shadow DOM', () => {
  it('resolves aria-label inside shadow root via a11y_aria_label', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<input id="shadow-field" aria-label="Email address" />');
    const r = new TargetResolver(document);
    const result = r.resolve({ match: { vuetify_label: ['email address'] } });
    expect(result.resolvedVia).toBe('a11y_aria_label');
    expect(result.element).not.toBeNull();
    expect((result.element as HTMLElement).id).toBe('shadow-field');
  });

  it('resolves button by name_contains inside shadow root via text_match', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<button id="shadow-save">Save Changes</button>');
    const r = new TargetResolver(document);
    const result = r.resolve({ match: { name_contains: ['save changes'] } });
    expect(['text_match', 'a11y_aria_label']).toContain(result.resolvedVia);
    expect(result.element).not.toBeNull();
    expect((result.element as HTMLElement).id).toBe('shadow-save');
  });

  it('resolves placeholder inside shadow root via a11y_placeholder', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<input id="shadow-search" placeholder="Search users..." />');
    const r = new TargetResolver(document);
    const result = r.resolve({ match: { vuetify_label: ['search users'] } });
    expect(result.resolvedVia).toBe('a11y_placeholder');
    expect(result.element).not.toBeNull();
  });
});

// ── read action: elements from shadow roots via snapshot ──────────────────────
// The PRE_PAGE_SNAPSHOT and PRE_GUARDED_READ functions run in the extension context
// (page via executeScript). Here we test the same querySelectorAllDeep logic
// that backs those functions, verifying it returns shadow DOM content.

describe('read action coverage via querySelectorAllDeep', () => {
  it('finds inputs inside shadow root (simulates PRE_PAGE_SNAPSHOT input scan)', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<input id="shadow-input" type="text" placeholder="Username" />');
    const inputs = querySelectorAllDeep('input, textarea, select');
    expect(inputs.some(el => el.id === 'shadow-input')).toBe(true);
  });

  it('finds buttons inside shadow root (simulates PRE_PAGE_SNAPSHOT button scan)', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<button id="shadow-submit" type="submit">Submit</button>');
    const buttons = querySelectorAllDeep('button, [role=button]');
    expect(buttons.some(el => el.id === 'shadow-submit')).toBe(true);
  });

  it('reads text from element inside shadow root (simulates PRE_GUARDED_READ)', () => {
    makeDoc('<div id="host"></div>');
    const host = document.getElementById('host')!;
    attachOpenShadow(host, '<p id="shadow-text" data-se="status-message">Active</p>');
    const el = querySelectorDeep('[data-se="status-message"]');
    expect(el).not.toBeNull();
    expect(el!.textContent?.trim()).toBe('Active');
  });
});
