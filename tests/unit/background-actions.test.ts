import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// Import StepExecutor for delay tests
import { StepExecutor } from '../../src/step-executor';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('background.js action coverage', () => {
  let bgSource: string;

  beforeAll(() => {
    bgSource = readFileSync(resolve(__dirname, '../../packages/extension/background.js'), 'utf-8');
  });

  const requiredActions = ['navigate','open_tab','type','click','wait_for','read','assess_state','js','find_row','click_text','delay','hover','scroll','select','probe_affordances','assert','click_preset'];

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
