/**
 * Tests for Bead 8b: chain executor → overlay wiring.
 *
 * Since startRun lives inside the extension's defineBackground closure and
 * depends on chrome.* APIs, we re-implement the overlay-signalling logic
 * here as a portable function and verify the message sequence.
 */

type OverlayMsg = { type: string; runId?: string; [k: string]: any };
type StepResult = { stepId: string; action: string; status: string; error?: string; durationMs: number };

/** Minimal replica of the overlay-wiring logic in startRun */
async function runChainWithOverlay(opts: {
  runId: string;
  chain: { stepId: string; action: string; note?: string; target?: string; selector?: string; text?: string }[];
  taskName: string;
  executeStep: (step: any) => Promise<StepResult>;
  abortFlags: Map<string, boolean>;
  messages: OverlayMsg[];
}) {
  const { runId, chain, taskName, executeStep, abortFlags, messages } = opts;

  // overlay_show
  messages.push({
    type: 'overlay_show',
    runId,
    taskName,
    steps: chain.map(s => ({
      stepId: s.stepId,
      label: s.note || s.action + ' ' + (s.target || s.selector || s.text || ''),
      status: 'pending'
    }))
  });

  const stepResults: StepResult[] = [];

  for (let i = 0; i < chain.length; i++) {
    // Abort check
    if (abortFlags.get(runId)) {
      for (let j = i; j < chain.length; j++) {
        messages.push({ type: 'overlay_step_update', runId, stepId: chain[j].stepId, status: 'skipped' });
      }
      break;
    }

    const step = chain[i];
    messages.push({ type: 'overlay_step_update', runId, stepId: step.stepId, status: 'running' });

    const res = await executeStep(step);
    stepResults.push(res);

    messages.push({
      type: 'overlay_step_update',
      runId,
      stepId: step.stepId,
      status: res.status === 'ok' || res.status === 'skipped' ? res.status : 'error',
      detail: res.error || null,
      durationMs: res.durationMs
    });

    if (res.status === 'error') break;
  }

  // overlay_hide (simulating the 3s delay conceptually — just push the message)
  messages.push({ type: 'overlay_hide', runId });

  return stepResults;
}

function makeChain(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    stepId: `s${i + 1}`,
    action: 'click',
    note: `Step ${i + 1}`,
  }));
}

function okExecutor(step: any): Promise<StepResult> {
  return Promise.resolve({ stepId: step.stepId, action: step.action, status: 'ok', durationMs: 10 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Chain overlay wiring', () => {

  it('emits overlay_show + running/ok pairs for each step', async () => {
    const messages: OverlayMsg[] = [];
    const abortFlags = new Map<string, boolean>();
    abortFlags.set('run-1', false);

    await runChainWithOverlay({
      runId: 'run-1',
      chain: makeChain(3),
      taskName: 'Test task',
      executeStep: okExecutor,
      abortFlags,
      messages,
    });

    // overlay_show
    expect(messages[0].type).toBe('overlay_show');
    expect(messages[0].steps).toHaveLength(3);
    expect(messages[0].taskName).toBe('Test task');

    // 3 steps × 2 messages each (running + ok) = 6 step updates
    const stepUpdates = messages.filter(m => m.type === 'overlay_step_update');
    expect(stepUpdates).toHaveLength(6);

    // Verify running/ok pairs
    for (let i = 0; i < 3; i++) {
      expect(stepUpdates[i * 2].status).toBe('running');
      expect(stepUpdates[i * 2].stepId).toBe(`s${i + 1}`);
      expect(stepUpdates[i * 2 + 1].status).toBe('ok');
      expect(stepUpdates[i * 2 + 1].stepId).toBe(`s${i + 1}`);
    }

    // overlay_hide at end
    expect(messages[messages.length - 1].type).toBe('overlay_hide');
  });

  it('abort stops execution and marks remaining steps as skipped', async () => {
    const messages: OverlayMsg[] = [];
    const abortFlags = new Map<string, boolean>();
    abortFlags.set('run-2', false);

    let stepCount = 0;
    const executor = async (step: any): Promise<StepResult> => {
      stepCount++;
      // Set abort after step 2
      if (stepCount === 2) abortFlags.set('run-2', true);
      return { stepId: step.stepId, action: step.action, status: 'ok', durationMs: 5 };
    };

    await runChainWithOverlay({
      runId: 'run-2',
      chain: makeChain(5),
      taskName: 'Abort test',
      executeStep: executor,
      abortFlags,
      messages,
    });

    // Only 2 steps should have executed
    expect(stepCount).toBe(2);

    // Steps 3-5 should be marked skipped
    const skipped = messages.filter(m => m.type === 'overlay_step_update' && m.status === 'skipped');
    expect(skipped).toHaveLength(3);
    expect(skipped.map(m => m.stepId)).toEqual(['s3', 's4', 's5']);

    // overlay_hide still sent
    expect(messages[messages.length - 1].type).toBe('overlay_hide');
  });

  it('error step shows in overlay with detail', async () => {
    const messages: OverlayMsg[] = [];
    const abortFlags = new Map<string, boolean>();
    abortFlags.set('run-3', false);

    let callCount = 0;
    const executor = async (step: any): Promise<StepResult> => {
      callCount++;
      if (callCount === 2) {
        return { stepId: step.stepId, action: step.action, status: 'error', error: 'Element not found', durationMs: 50 };
      }
      return { stepId: step.stepId, action: step.action, status: 'ok', durationMs: 10 };
    };

    await runChainWithOverlay({
      runId: 'run-3',
      chain: makeChain(3),
      taskName: 'Error test',
      executeStep: executor,
      abortFlags,
      messages,
    });

    const errorMsgs = messages.filter(m => m.type === 'overlay_step_update' && m.status === 'error');
    expect(errorMsgs).toHaveLength(1);
    expect(errorMsgs[0].stepId).toBe('s2');
    expect(errorMsgs[0].detail).toBe('Element not found');

    // Step 3 should NOT have run (chain stops on error)
    expect(callCount).toBe(2);
  });

  it('overlay_hide is sent after chain completes', async () => {
    const messages: OverlayMsg[] = [];
    const abortFlags = new Map<string, boolean>();
    abortFlags.set('run-4', false);

    await runChainWithOverlay({
      runId: 'run-4',
      chain: makeChain(2),
      taskName: 'Hide test',
      executeStep: okExecutor,
      abortFlags,
      messages,
    });

    const hideMessages = messages.filter(m => m.type === 'overlay_hide');
    expect(hideMessages).toHaveLength(1);
    expect(hideMessages[0].runId).toBe('run-4');
  });
});
