/**
 * `respond`: the rule that turns a query recipe's buffer into its answer
 * (src/respond-step.ts). The chain-level test is query-recipes-chain.test.ts.
 */
import { buildResponse } from '../../src/respond-step.js';

const I = (params: Record<string, string>) => (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');

describe('buildResponse', () => {
  const footers = {
    active_footer: 'Items per page:10 1-10 of 28',
    deactivated_footer: 'Items per page:10 1-3 of 3',
    staged_offboarding_footer: 'Items per page:10 0-0 of 0',
  };

  it('pulls counts out of pagination footers, as numbers (q01)', () => {
    const out = buildResponse({
      stepId: 's14',
      extract_from: {
        active: { source: 'active_footer', pattern: 'of (\\d+)', capture: 1 },
        deactivated: { source: 'deactivated_footer', pattern: 'of (\\d+)', capture: 1 },
        staged_offboarding: { source: 'staged_offboarding_footer', pattern: 'of (\\d+)', capture: 1 },
      },
    }, footers, I({}));
    expect(out).toEqual({ ok: true, response: { active: 28, deactivated: 3, staged_offboarding: 0 } });
  });

  it('accepts `data` as the map, copies a source as it is, and fills {{params}} into strings', () => {
    const out = buildResponse({
      data: { group_name: '{{group_name}}', rows: { source: 'rows' }, limit: 100, exact: true },
    }, { rows: 'Ada Lovelace ada@example.com' }, I({ group_name: 'Engineering' }));
    expect(out).toEqual({ ok: true, response: { group_name: 'Engineering', rows: 'Ada Lovelace ada@example.com', limit: 100, exact: true } });
  });

  it('keeps a non-numeric capture as text, and uses the whole match without `capture`', () => {
    const out = buildResponse({
      data: { status: { source: 'chip', pattern: 'Status: (\\w+)', capture: 1 }, whole: { source: 'chip', pattern: 'Status: \\w+' } },
    }, { chip: 'Status: STAGED since 2026-09-01' }, I({}));
    expect(out).toEqual({ ok: true, response: { status: 'STAGED', whole: 'Status: STAGED' } });
  });

  it('counts a list', () => {
    const out = buildResponse({ data: { n: { source: 'people', extract: 'count' } } }, { people: [{ name: 'a' }, { name: 'b' }] }, I({}));
    expect(out).toEqual({ ok: true, response: { n: 2 } });
  });

  it('fails when a source is not in the buffer, naming the field and the source', () => {
    const out = buildResponse({ stepId: 's14', data: { active: { source: 'active_footer', pattern: 'of (\\d+)', capture: 1 } } }, {}, I({}));
    expect(out).toEqual({ ok: false, error: 'respond [s14]: "active" reads "active_footer", which is not in the buffer' });
  });

  it('fails when the pattern does not match, quoting the text it read', () => {
    const out = buildResponse({ stepId: 's7', data: { count: { source: 'footer', pattern: 'of (\\d+)', capture: 1 } } }, { footer: 'Loading…' }, I({}));
    expect(out).toEqual({ ok: false, error: 'respond [s7]: "count" /of (\\d+)/ does not match "footer" ("Loading…")' });
  });

  it('fails when a count source is not a list', () => {
    const out = buildResponse({ data: { n: { source: 'rows', extract: 'count' } } }, { rows: 'text' }, I({}));
    expect(out).toEqual({ ok: false, error: 'respond: "n" counts "rows", which is not a list' });
  });

  it('gives null for an optional rule that cannot be filled', () => {
    const out = buildResponse({ data: { a: { source: 'missing', optional: true }, b: { source: 'footer', pattern: 'x(\\d)', capture: 1, optional: true } } }, { footer: 'nothing' }, I({}));
    expect(out).toEqual({ ok: true, response: { a: null, b: null } });
  });

  it('adds empty_message when every count is 0 and every list is empty (q02 on an org with no staged users)', () => {
    const step = {
      data: { count: { source: 'staged_footer', pattern: 'of (\\d+)', capture: 1 }, users: { source: 'staged_rows' } },
      empty_message: 'No users are currently pending onboarding.',
    };
    const empty = buildResponse(step, { staged_footer: 'Items per page:10 0-0 of 0', staged_rows: 'No data available' }, I({}));
    expect(empty).toEqual({ ok: true, response: { count: 0, users: 'No data available', message: 'No users are currently pending onboarding.' } });
    const some = buildResponse(step, { staged_footer: 'Items per page:10 1-2 of 2', staged_rows: 'Ada … Grace …' }, I({}));
    expect(some.ok && some.response.message).toBeUndefined();
  });

  it('fails without a data map', () => {
    expect(buildResponse({ stepId: 'r' }, {}, I({}))).toEqual({ ok: false, error: 'respond [r]: needs a "data" map' });
  });
});
