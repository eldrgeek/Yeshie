import { StepExecutor } from '../../src/step-executor.js';
import {
  ContentStabilityTracker,
  evaluateWaitFor,
  fingerprintContent,
  quietMsOf,
  wantsStable,
} from '../../src/wait-for.js';

function exec(html: string) {
  document.body.innerHTML = html;
  return new StepExecutor(document, {}, {}, {});
}

describe('wait_for text / selector / state.stable', () => {
  it('matches when selector exists', () => {
    document.body.innerHTML = '<div></div>';
    expect(evaluateWaitFor({ selector: '#ok' }, { href: 'https://x.test/', doc: document }).matched).toBe(false);
    document.body.innerHTML = '<div id="ok">hi</div>';
    expect(evaluateWaitFor({ selector: '#ok' }, { href: 'https://x.test/', doc: document }).matched).toBe(true);
  });

  it('matches when body text contains the needle', () => {
    document.body.innerHTML = '<main>Workflow created.</main>';
    const r = evaluateWaitFor({ text: 'Workflow created' }, { href: 'https://x.test/', doc: document });
    expect(r.matched).toBe(true);
    expect(r.pageText).toContain('Workflow created');
  });

  it('does not match missing text', () => {
    document.body.innerHTML = '<main>still thinking</main>';
    const r = evaluateWaitFor({ text: 'Workflow created' }, { href: 'https://x.test/', doc: document });
    expect(r.matched).toBe(false);
  });

  it('scopes text to a selector when both are set', () => {
    document.body.innerHTML = '<div id="a">alpha</div><div id="b">beta</div>';
    expect(evaluateWaitFor({ selector: '#a', text: 'alpha' }, { href: 'https://x.test/', doc: document }).matched).toBe(true);
    expect(evaluateWaitFor({ selector: '#a', text: 'beta' }, { href: 'https://x.test/', doc: document }).matched).toBe(false);
  });

  it('treats state.stable as a wait (not a delay)', () => {
    expect(wantsStable({ state: { stable: true } })).toBe(true);
    expect(wantsStable({ state: { stable: 1200 } })).toBe(true);
    expect(wantsStable({ state: { visible: true } })).toBe(false);
    expect(quietMsOf({ state: { stable: 1200 } })).toBe(1200);
    expect(quietMsOf({ quietMs: 400, state: { stable: true } })).toBe(400);
  });

  it('ContentStabilityTracker requires two unchanged samples across the quiet window', () => {
    let now = 1_000;
    const tracker = new ContentStabilityTracker(() => now);
    const hash = fingerprintContent('hello');
    expect(tracker.observe('s', hash, 800)).toBe(false);
    now = 1_400;
    expect(tracker.observe('s', hash, 800)).toBe(false);
    now = 1_900;
    expect(tracker.observe('s', hash, 800)).toBe(true);
  });

  it('ContentStabilityTracker resets when content grows (streaming)', () => {
    let now = 1_000;
    const tracker = new ContentStabilityTracker(() => now);
    expect(tracker.observe('s', fingerprintContent('hel'), 100)).toBe(false);
    now = 1_200;
    expect(tracker.observe('s', fingerprintContent('hello'), 100)).toBe(false);
    now = 1_400;
    expect(tracker.observe('s', fingerprintContent('hello'), 100)).toBe(true);
  });

  it('StepExecutor wait_for text succeeds when the needle is present', () => {
    const r = exec('<p>Done</p>').execute({ stepId: 's1', action: 'wait_for', text: 'Done' });
    expect(r.status).toBe('ok');
  });

  it('StepExecutor wait_for text errors when the needle is absent', () => {
    const r = exec('<p>pending</p>').execute({ stepId: 's1', action: 'wait_for', text: 'Done' });
    expect(r.status).toBe('error');
    expect(r.error).toContain('text "Done"');
  });

  it('StepExecutor state.stable is false on the first snapshot', () => {
    const ex = exec('<div id="stream">token</div>');
    const r = ex.execute({ stepId: 's1', action: 'wait_for', selector: '#stream', state: { stable: true }, quietMs: 0 });
    expect(r.status).toBe('error');
  });

  it('StepExecutor state.stable succeeds after an unchanged second snapshot', () => {
    const ex = exec('<div id="stream">token</div>');
    ex.execute({ stepId: 's1', action: 'wait_for', selector: '#stream', state: { stable: true }, quietMs: 0 });
    const r = ex.execute({ stepId: 's1', action: 'wait_for', selector: '#stream', state: { stable: true }, quietMs: 0 });
    expect(r.status).toBe('ok');
  });

  it('StepExecutor state.stable does not succeed while content is still changing', () => {
    const ex = exec('<div id="stream">a</div>');
    ex.execute({ stepId: 's1', action: 'wait_for', selector: '#stream', state: { stable: true }, quietMs: 0 });
    document.querySelector('#stream')!.textContent = 'ab';
    const r = ex.execute({ stepId: 's1', action: 'wait_for', selector: '#stream', state: { stable: true }, quietMs: 0 });
    expect(r.status).toBe('error');
  });
});
