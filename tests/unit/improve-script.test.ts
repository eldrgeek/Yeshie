import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const improveScript = resolve(projectRoot, 'improve.js');

describe('improve.js', () => {
  it('runs under ESM and updates payload + site model using canonical runtime fields', () => {
    const root = mkdtempSync(join(tmpdir(), 'yeshie-improve-'));
    const siteDir = join(root, 'sites', 'demo');
    const taskDir = join(siteDir, 'tasks');
    mkdirSync(taskDir, { recursive: true });

    const payloadPath = join(taskDir, '01-task.payload.json');
    const siteModelPath = join(siteDir, 'site.model.json');
    const chainResultPath = join(root, 'chain-result.json');

    writeFileSync(payloadPath, JSON.stringify({
      _meta: { task: 'demo-task', runCount: 0 },
      mode: 'verification',
      abstractTargets: {
        search: {
          semanticKeys: ['Search'],
          cachedSelector: null,
          cachedConfidence: 0,
          resolvedOn: null,
        },
      },
    }, null, 2));

    writeFileSync(siteModelPath, JSON.stringify({
      _meta: {},
      abstractTargets: {
        search: {
          semanticKeys: ['Search'],
          cachedSelector: null,
          cachedConfidence: 0,
          resolvedOn: null,
        },
      },
    }, null, 2));

    writeFileSync(chainResultPath, JSON.stringify({
      event: 'chain_complete',
      goalReached: true,
      durationMs: 1234,
      modelUpdates: {
        resolvedTargets: {
          search: {
            selector: '[aria-label="Search"]',
            confidence: 0.91,
            resolvedVia: 'a11y_aria_label',
            resolvedOn: '2026-04-02T00:00:00.000Z',
          },
        },
        signaturesObserved: {
          s1: [{ kind: 'element_visible', selector: '[role="search"]' }],
        },
      },
    }, null, 2));

    execFileSync('node', [improveScript, payloadPath, chainResultPath], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
    const siteModel = JSON.parse(readFileSync(siteModelPath, 'utf8'));

    expect(payload.abstractTargets.search.cachedSelector).toBe('[aria-label="Search"]');
    expect(payload.abstractTargets.search.resolvedVia).toBe('a11y_aria_label');
    expect(payload.abstractTargets.search.resolutionMethod).toBe('a11y_aria_label');
    expect(payload.abstractTargets.search.anchors).toEqual({ ariaLabel: 'Search' });
    expect(payload._meta.runCount).toBe(1);
    expect(payload._meta.lastDurationMs).toBe(1234);

    expect(siteModel.abstractTargets.search.cachedSelector).toBe('[aria-label="Search"]');
    expect(siteModel.abstractTargets.search.anchors).toEqual({ ariaLabel: 'Search' });
    expect(siteModel.observedResponseSignatures['step-s1-observed']).toBeTruthy();
  });

  it('accepts legacy cachedAt and resolutionMethod fields', () => {
    const root = mkdtempSync(join(tmpdir(), 'yeshie-improve-legacy-'));
    const siteDir = join(root, 'sites', 'legacy');
    const taskDir = join(siteDir, 'tasks');
    mkdirSync(taskDir, { recursive: true });

    const payloadPath = join(taskDir, '01-task.payload.json');
    const siteModelPath = join(siteDir, 'site.model.json');
    const chainResultPath = join(root, 'chain-result.json');

    writeFileSync(payloadPath, JSON.stringify({
      _meta: { task: 'legacy-task', runCount: 4 },
      mode: 'verification',
      abstractTargets: {
        email: {
          semanticKeys: ['Email'],
          cachedSelector: null,
          cachedConfidence: 0,
          resolvedOn: null,
        },
      },
    }, null, 2));

    writeFileSync(siteModelPath, JSON.stringify({
      _meta: {},
      abstractTargets: {
        email: {
          semanticKeys: ['Email'],
          cachedSelector: null,
          cachedConfidence: 0,
          resolvedOn: null,
        },
      },
    }, null, 2));

    writeFileSync(chainResultPath, JSON.stringify({
      event: 'chain_complete',
      goalReached: true,
      durationMs: 200,
      modelUpdates: {
        resolvedTargets: {
          email: {
            selector: 'input[name="email"]',
            confidence: 0.87,
            resolutionMethod: 'a11y_placeholder',
            cachedAt: '2026-04-01T00:00:00.000Z',
          },
        },
      },
    }, null, 2));

    execFileSync('node', [improveScript, payloadPath, chainResultPath], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
    expect(payload.abstractTargets.email.resolvedOn).toBe('2026-04-01T00:00:00.000Z');
    expect(payload.abstractTargets.email.resolvedVia).toBe('a11y_placeholder');
    expect(payload.abstractTargets.email.anchors).toEqual({ name: 'email' });
    expect(payload.mode).toBe('production');
  });

  it('creates missing _meta and accepts success-based chain results', () => {
    const root = mkdtempSync(join(tmpdir(), 'yeshie-improve-success-'));
    const siteDir = join(root, 'sites', 'success');
    const taskDir = join(siteDir, 'tasks');
    mkdirSync(taskDir, { recursive: true });

    const payloadPath = join(taskDir, '01-task.payload.json');
    const chainResultPath = join(root, 'chain-result.json');

    writeFileSync(payloadPath, JSON.stringify({
      mode: 'verification',
      abstractTargets: {
        account: {
          cachedSelector: null,
          cachedConfidence: 0,
          resolvedOn: null,
        },
      },
    }, null, 2));

    writeFileSync(chainResultPath, JSON.stringify({
      success: true,
      durationMs: 50,
      modelUpdates: {
        resolvedTargets: {
          account: {
            selector: '#account-input',
            confidence: 0.9,
            resolvedVia: 'css_cascade',
            resolvedOn: '2026-04-04T00:00:00.000Z',
          },
        },
      },
    }, null, 2));

    execFileSync('node', [improveScript, payloadPath, chainResultPath], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
    expect(payload._meta.runCount).toBe(1);
    expect(payload.abstractTargets.account.anchors).toEqual({ id: 'account-input' });
  });
});
