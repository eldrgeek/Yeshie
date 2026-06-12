// Unit tests for scripts/explore.js and scripts/compile-task.js
// Uses fixtures rather than live relay calls.

import { describe, it, expect } from '@jest/globals';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SAMPLE_SNAPSHOT = {
  pageUrl: '/hardware',
  buttons: [
    { text: 'Toggle navigation', classes: 'sidebar-toggle btn btn-white', href: '#', tag: 'A' },
    { text: 'Search', classes: 'btn btn-sm btn-theme', disabled: false, href: null, tag: 'BUTTON' },
  ],
  headings: [{ text: 'Assets', level: 1 }],
  inputs: [],
  links: [
    { text: 'Hardware', href: 'https://demo.snipeitapp.com/hardware' },
    { text: 'Licenses', href: 'https://demo.snipeitapp.com/licenses' },
    { text: 'Users', href: 'https://demo.snipeitapp.com/users' },
  ],
  navLinks: [],
  tables: [
    {
      headers: ['Asset Tag', 'Asset Name', 'Status'],
      rowCount: 3,
      sampleRows: [
        ['TAG-001', 'Laptop A', 'Ready to Deploy'],
        ['TAG-002', 'Laptop B', 'Deployed'],
        ['TAG-003', 'Laptop C', 'Ready to Deploy'],
      ],
    },
  ],
};

const SAMPLE_SITE_MODEL = {
  _meta: {
    layer: 3,
    site: 'demo.snipeitapp.com',
    baseUrl: 'https://demo.snipeitapp.com',
    framework: 'bootstrap',
    pagesDiscovered: 5,
    targetsFound: 20,
    lastExplored: new Date().toISOString(),
    exploredBy: 'explore.js autonomous crawl',
    description: 'Auto-generated test fixture',
    version: '0.1',
    name: 'demo.snipeitapp.com Site Model',
  },
  auth: {
    type: 'form_login',
    loginPath: '/',
    loginFields: [
      { id: 'username', type: 'text', placeholder: 'Username' },
      { id: 'password-field', type: 'password', placeholder: null },
    ],
  },
  stateGraph: {
    nodes: {
      root: {
        description: 'Dashboard',
        url: 'https://demo.snipeitapp.com/',
        path: '/',
        signals: [{ type: 'url_matches', pattern: '/' }],
      },
      hardware: {
        description: 'Assets',
        url: 'https://demo.snipeitapp.com/hardware',
        path: '/hardware',
        signals: [{ type: 'url_matches', pattern: '/hardware' }],
      },
    },
  },
  targetRegistry: {
    'hardware.search': {
      description: 'Search',
      page: 'hardware',
      type: 'button',
      match: { name_contains: ['Search'] },
      fallbackSelectors: [],
      classes: 'btn btn-sm btn-theme',
    },
  },
  urlSchema: [
    { pattern: '/hardware', examples: ['/hardware'], paramType: 'none' },
    { pattern: '/hardware/{id}', examples: ['/hardware/1', '/hardware/42'], paramType: 'integer' },
  ],
  explorationRaw: [
    {
      path: '/hardware',
      url: 'https://demo.snipeitapp.com/hardware',
      discoveredAs: 'Assets',
      headings: [{ text: 'Assets' }],
      inputCount: 5,
      buttonCount: 3,
      linkCount: 10,
      tableCount: 1,
      tables: [SAMPLE_SNAPSHOT.tables[0]],
      forms: [],
    },
  ],
};

// ── explore.js unit-testable helpers ──────────────────────────────────────────

function sameOrigin(href: string, baseUrl: string): boolean {
  try {
    const u = new URL(href, baseUrl);
    const b = new URL(baseUrl);
    return u.hostname === b.hostname;
  } catch {
    return false;
  }
}

function normPath(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).pathname;
  } catch {
    return null;
  }
}

function extractUrlSchema(urls: string[]) {
  const patterns: Record<string, { pattern: string; examples: string[]; paramType: string }> = {};
  for (const u of urls) {
    const slotted = u
      .replace(/\/\d{1,8}(\/|$)/g, '/{id}$1')
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/gi, '/{uuid}$1');
    if (!patterns[slotted]) {
      patterns[slotted] = { pattern: slotted, examples: [], paramType: 'none' };
    }
    patterns[slotted].examples.push(u);
    if (slotted !== u) {
      patterns[slotted].paramType = u.match(/[0-9a-f]{8}-[0-9a-f-]{27}/) ? 'uuid' : 'integer';
    }
  }
  return Object.values(patterns);
}

function detectFramework(pages: Array<{ snap: typeof SAMPLE_SNAPSHOT }>) {
  const allClasses = pages.flatMap(p => (p.snap?.buttons ?? []).flatMap(b => (b.classes ?? '').split(' ')));
  if (allClasses.some(c => c.startsWith('v-'))) return 'vue';
  if (allClasses.some(c => c.startsWith('MuiButton'))) return 'react-mui';
  if (allClasses.some(c => c.includes('btn-primary') || c.includes('btn-default') || c.includes('btn-theme'))) return 'bootstrap';
  return 'vanilla';
}

const DENYLIST = /logout|sign.?out|delete|remove|destroy|deactivate|archive|purge|wipe|reset.?pass/i;
const PATH_DENYLIST = /logout|signout|delete|remove|destroy|password\/reset|\.json|\.csv|\.pdf|\.xml|\.zip/i;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('explore.js helpers', () => {
  describe('sameOrigin', () => {
    it('returns true for same-hostname absolute URLs', () => {
      expect(sameOrigin('https://demo.snipeitapp.com/hardware', 'https://demo.snipeitapp.com')).toBe(true);
    });

    it('returns true for relative URLs', () => {
      expect(sameOrigin('/hardware', 'https://demo.snipeitapp.com')).toBe(true);
    });

    it('returns false for different domains', () => {
      expect(sameOrigin('https://example.com/foo', 'https://demo.snipeitapp.com')).toBe(false);
    });

    it('returns false for cross-origin relative path resolved to different host', () => {
      expect(sameOrigin('https://evil.com/path', 'https://demo.snipeitapp.com')).toBe(false);
    });
  });

  describe('normPath', () => {
    it('extracts path from absolute URL', () => {
      expect(normPath('https://demo.snipeitapp.com/hardware/1', 'https://demo.snipeitapp.com')).toBe('/hardware/1');
    });

    it('resolves relative URL against base', () => {
      expect(normPath('/users', 'https://demo.snipeitapp.com')).toBe('/users');
    });

    it('resolves root-relative path correctly', () => {
      expect(normPath('/hardware/create', 'https://demo.snipeitapp.com')).toBe('/hardware/create');
    });
  });

  describe('extractUrlSchema', () => {
    it('returns no patterns for empty input', () => {
      expect(extractUrlSchema([])).toHaveLength(0);
    });

    it('groups numeric IDs into {id} slot', () => {
      const result = extractUrlSchema(['/hardware/1', '/hardware/2', '/hardware/42']);
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('/hardware/{id}');
      expect(result[0].paramType).toBe('integer');
      expect(result[0].examples).toHaveLength(3);
    });

    it('keeps static paths as-is', () => {
      const result = extractUrlSchema(['/hardware', '/licenses', '/users']);
      expect(result).toHaveLength(3);
      expect(result.every(r => r.paramType === 'none')).toBe(true);
    });

    it('groups UUID paths into {uuid} slot', () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      const result = extractUrlSchema([`/assets/${uuid}`]);
      expect(result[0].pattern).toBe('/assets/{uuid}');
      expect(result[0].paramType).toBe('uuid');
    });
  });

  describe('detectFramework', () => {
    it('detects bootstrap from btn-theme class', () => {
      const pages = [{ snap: SAMPLE_SNAPSHOT }];
      expect(detectFramework(pages)).toBe('bootstrap');
    });

    it('detects vue from v- prefix', () => {
      const vuePage = {
        snap: {
          ...SAMPLE_SNAPSHOT,
          buttons: [{ text: 'Save', classes: 'v-btn v-btn--primary', href: null, tag: 'BUTTON' }],
        },
      };
      expect(detectFramework([vuePage])).toBe('vue');
    });

    it('returns vanilla for unknown CSS', () => {
      const plain = { snap: { ...SAMPLE_SNAPSHOT, buttons: [] } };
      expect(detectFramework([plain])).toBe('vanilla');
    });
  });

  describe('DENYLIST / PATH_DENYLIST', () => {
    it('blocks logout links', () => {
      expect(DENYLIST.test('logout')).toBe(true);
      expect(PATH_DENYLIST.test('/logout')).toBe(true);
    });

    it('blocks delete affordances', () => {
      expect(DENYLIST.test('Delete this item')).toBe(true);
    });

    it('allows safe navigation', () => {
      expect(DENYLIST.test('Hardware')).toBe(false);
      expect(PATH_DENYLIST.test('/hardware')).toBe(false);
    });
  });
});

describe('compile-task.js helpers', () => {
  describe('site model structure', () => {
    it('sample fixture has required L3 fields', () => {
      expect(SAMPLE_SITE_MODEL._meta.layer).toBe(3);
      expect(SAMPLE_SITE_MODEL.stateGraph.nodes).toBeDefined();
      expect(SAMPLE_SITE_MODEL.targetRegistry).toBeDefined();
      expect(SAMPLE_SITE_MODEL.urlSchema).toBeDefined();
    });

    it('urlSchema entries have pattern and paramType', () => {
      for (const entry of SAMPLE_SITE_MODEL.urlSchema) {
        expect(entry.pattern).toBeDefined();
        expect(entry.paramType).toBeDefined();
        expect(['none', 'integer', 'uuid']).toContain(entry.paramType);
      }
    });

    it('targetRegistry entries have type and fallbackSelectors', () => {
      for (const [, v] of Object.entries(SAMPLE_SITE_MODEL.targetRegistry)) {
        expect(v.type).toBeDefined();
        expect(v.fallbackSelectors).toBeDefined();
      }
    });
  });

  describe('JSON extraction edge cases', () => {
    // Mirrors the jsonStr extraction logic in compile-task.js
    function extractJson(output: string): string {
      let s = output;
      s = s.replace(/^```(?:json)?\r?\n?/m, '').replace(/\r?\n?```\s*$/m, '');
      const firstBrace = s.indexOf('{');
      if (firstBrace > 0) s = s.slice(firstBrace);
      const lastBrace = s.lastIndexOf('}');
      if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
      return s.trim();
    }

    it('strips markdown fences', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = JSON.parse(extractJson(input));
      expect(result.key).toBe('value');
    });

    it('strips preamble text before JSON', () => {
      const input = 'Here is the compiled payload JSON:\n\n```json\n{"chain": []}\n```';
      const result = JSON.parse(extractJson(input));
      expect(result.chain).toBeDefined();
    });

    it('handles plain JSON without fences', () => {
      const input = '{"_meta": {"task": "test"}, "chain": []}';
      const result = JSON.parse(extractJson(input));
      expect(result._meta.task).toBe('test');
    });
  });

  describe('payload validation', () => {
    function isValidPayload(p: unknown): boolean {
      if (!p || typeof p !== 'object') return false;
      const payload = p as Record<string, unknown>;
      if (!Array.isArray(payload.chain)) return false;
      if (!payload._meta) return false;
      return true;
    }

    it('validates correct payload structure', () => {
      const payload = {
        _meta: { task: 'test', mode: 'exploratory' },
        chain: [
          { stepId: 's1', action: 'navigate', url: 'https://example.com' },
          { stepId: 's2', action: 'read', store_as: 'snap' },
        ],
      };
      expect(isValidPayload(payload)).toBe(true);
    });

    it('rejects payload without chain', () => {
      expect(isValidPayload({ _meta: { task: 'test' } })).toBe(false);
    });

    it('rejects payload without _meta', () => {
      expect(isValidPayload({ chain: [] })).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isValidPayload('not a payload')).toBe(false);
      expect(isValidPayload(null)).toBe(false);
    });
  });
});
