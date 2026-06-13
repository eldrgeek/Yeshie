import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// Import StepExecutor for delay tests
import { StepExecutor } from '../../src/step-executor';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('step-executor action coverage', () => {
  let bgSource: string;

  beforeAll(() => {
    // Action handlers live in src/step-executor.ts (the canonical executor).
    // The old check against packages/extension/background.js was wrong — that
    // compiled artifact was never checked into git and the WXT build output is
    // minified (patterns won't match).
    bgSource = readFileSync(resolve(__dirname, '../../src/step-executor.ts'), 'utf-8');
  });

  const requiredActions = ['navigate','type','click','wait_for','read','assess_state','js','find_row','click_text','delay','hover','scroll','select','probe_affordances','assert','click_preset'];

  for (const action of requiredActions) {
    it(`handles action type '${action}'`, () => {
      expect(bgSource).toContain(`a === '${action}'`);
    });
  }

  it('has no unsupported fallthrough reachable by known action types', () => {
    const unsupportedIdx = bgSource.indexOf("status: 'unsupported'");
    for (const action of requiredActions) {
      const actionIdx = bgSource.indexOf(`a === '${action}'`);
      expect(actionIdx).toBeGreaterThan(0);
      expect(actionIdx).toBeLessThan(unsupportedIdx);
    }
  });
});

describe('delay action (via StepExecutor)', () => {
  // Note: StepExecutor.execute() is synchronous. The delay action in StepExecutor
  // returns ok status without actually waiting (it does not return an ms field).
  it('returns ok status', () => {
    document.body.innerHTML = '<div></div>';
    const ex = new StepExecutor(document, {}, {}, {});
    const r = ex.execute({ stepId: 'd1', action: 'delay', ms: 500 });
    expect(r.status).toBe('ok');
  });

  it('returns ok status when ms not specified', () => {
    document.body.innerHTML = '<div></div>';
    const ex = new StepExecutor(document, {}, {}, {});
    const r = ex.execute({ stepId: 'd1', action: 'delay' });
    expect(r.status).toBe('ok');
  });
});
