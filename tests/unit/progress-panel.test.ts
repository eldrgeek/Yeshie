import { jest } from '@jest/globals';
import { createProgressPanel } from '../../packages/extension/src/overlay/progress-panel.js';
import type { StepInfo } from '../../packages/extension/src/overlay/progress-panel.js';

function makeSteps(n: number): StepInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `step-${i}`,
    label: `Step ${i + 1}`,
  }));
}

describe('Progress panel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('creates shadow DOM with overlay element', () => {
    const panel = createProgressPanel(container);
    expect(panel.shadowRoot).toBeDefined();
    const overlay = panel.shadowRoot.getElementById('yeshie-overlay');
    expect(overlay).not.toBeNull();
  });

  it('renders all steps as pending', () => {
    const panel = createProgressPanel(container);
    panel.show('run-1', 'Offboarding John', makeSteps(5));
    const steps = panel.shadowRoot.querySelectorAll('.yeshie-step');
    expect(steps.length).toBe(5);
    steps.forEach((step) => {
      expect(step.classList.contains('pending')).toBe(true);
    });
  });

  it('transitions step through running → ok', () => {
    const panel = createProgressPanel(container);
    panel.show('run-1', 'Test task', makeSteps(3));
    const getStep = () => panel.shadowRoot.querySelector('[data-step-id="step-0"]') as HTMLElement;

    panel.updateStep('step-0', 'running');
    expect(getStep().classList.contains('running')).toBe(true);
    expect(getStep().textContent).toContain('⏳');

    panel.updateStep('step-0', 'ok', { durationMs: 150 });
    expect(getStep().classList.contains('ok')).toBe(true);
    expect(getStep().textContent).toContain('✅');
  });

  it('shows error state with detail text', () => {
    const panel = createProgressPanel(container);
    panel.show('run-1', 'Test', makeSteps(2));

    panel.updateStep('step-0', 'error', { detail: 'Element not found' });
    const step = panel.shadowRoot.querySelector('[data-step-id="step-0"]') as HTMLElement;
    expect(step.classList.contains('error')).toBe(true);
    expect(step.textContent).toContain('❌');
    const detail = step.querySelector('.detail');
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toBe('Element not found');
  });

  it('fires cancel callback with runId', () => {
    const onCancel = jest.fn();
    const panel = createProgressPanel(container, { onCancel });
    panel.show('run-42', 'Cancel test', makeSteps(1));

    const cancelBtn = panel.shadowRoot.querySelector('.yeshie-cancel-btn') as HTMLButtonElement;
    cancelBtn.click();
    expect(onCancel).toHaveBeenCalledWith('run-42');
  });

  it('suggest flow: shows input, fires callback with suggestion', () => {
    const onSuggest = jest.fn();
    const panel = createProgressPanel(container, { onSuggest });
    panel.show('run-7', 'Suggest test', makeSteps(1));

    const suggestBtn = panel.shadowRoot.querySelector('.yeshie-suggest-btn') as HTMLButtonElement;
    const suggestArea = panel.shadowRoot.querySelector('.yeshie-suggest-input') as HTMLElement;
    const input = suggestArea.querySelector('input') as HTMLInputElement;
    const sendBtn = suggestArea.querySelector('button') as HTMLButtonElement;

    // Initially hidden
    expect(suggestArea.classList.contains('active')).toBe(false);

    // Click suggest → input appears
    suggestBtn.click();
    expect(suggestArea.classList.contains('active')).toBe(true);

    // Type and send
    input.value = 'try the blue button';
    sendBtn.click();
    expect(onSuggest).toHaveBeenCalledWith({ runId: 'run-7', suggestion: 'try the blue button' });
    // Input area hidden after send
    expect(suggestArea.classList.contains('active')).toBe(false);
  });

  it('hide/show toggles overlay visibility', () => {
    const panel = createProgressPanel(container);
    const overlay = panel.shadowRoot.getElementById('yeshie-overlay') as HTMLElement;

    // Initially hidden
    expect(overlay.classList.contains('visible')).toBe(false);

    panel.show('run-1', 'Show test', makeSteps(1));
    expect(overlay.classList.contains('visible')).toBe(true);

    panel.hide();
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('minimize toggles body visibility', () => {
    const panel = createProgressPanel(container);
    panel.show('run-1', 'Min test', makeSteps(2));

    const minimizeBtn = panel.shadowRoot.querySelector('.yeshie-minimize') as HTMLButtonElement;
    const body = panel.shadowRoot.querySelector('.yeshie-body') as HTMLElement;

    expect(body.classList.contains('minimized')).toBe(false);

    minimizeBtn.click();
    expect(body.classList.contains('minimized')).toBe(true);

    minimizeBtn.click();
    expect(body.classList.contains('minimized')).toBe(false);
  });
});
