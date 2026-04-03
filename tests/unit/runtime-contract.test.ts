import {
  createResolvedTargetUpdate,
  createSurpriseEvidence,
  normalizeResolvedTargetUpdate,
} from '../../src/runtime-contract.js';

describe('runtime contract helpers', () => {
  it('creates canonical resolved target updates', () => {
    const update = createResolvedTargetUpdate('[aria-label="Search"]', 0.92, 'a11y_aria_label', '2026-04-02T00:00:00.000Z');
    expect(update).toEqual({
      selector: '[aria-label="Search"]',
      confidence: 0.92,
      resolvedVia: 'a11y_aria_label',
      resolvedOn: '2026-04-02T00:00:00.000Z',
      resolutionMethod: 'a11y_aria_label',
    });
  });

  it('normalizes legacy cachedAt/resolutionMethod fields into canonical fields', () => {
    const update = normalizeResolvedTargetUpdate({
      selector: 'input[placeholder="Search"]',
      confidence: 0.88,
      resolutionMethod: 'a11y_placeholder',
      cachedAt: '2026-04-01T00:00:00.000Z',
    });
    expect(update.resolvedVia).toBe('a11y_placeholder');
    expect(update.resolvedOn).toBe('2026-04-01T00:00:00.000Z');
    expect(update.resolutionMethod).toBe('a11y_placeholder');
  });

  it('creates structured surprise evidence', () => {
    const evidence = createSurpriseEvidence('url_mismatch', {
      stepId: 's4',
      expected: '/organization/people/.+/details',
      observed: '/login',
      details: 'Navigation redirected to login',
    });
    expect(evidence.kind).toBe('url_mismatch');
    expect(evidence.stepId).toBe('s4');
    expect(evidence.observed).toBe('/login');
  });
});
