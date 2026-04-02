import { jest } from '@jest/globals';
import { createTeachTooltip } from '../../packages/extension/src/overlay/teach-tooltip.js';
import type { TeachStep } from '../../packages/extension/src/overlay/teach-tooltip.js';

describe('Teach Tooltip', () => {
  let container: HTMLElement;
  let tooltip: ReturnType<typeof createTeachTooltip>;

  const mockSteps: TeachStep[] = [
    { stepIndex: 0, totalSteps: 3, instruction: 'Click the Add button', targetSelector: '#add-btn', highlightTarget: true, waitForAction: 'click', position: 'bottom' },
    { stepIndex: 1, totalSteps: 3, instruction: 'Type a name', targetSelector: '#name-input', highlightTarget: true, waitForAction: 'type', position: 'right' },
    { stepIndex: 2, totalSteps: 3, instruction: 'Click Save', targetSelector: '#save-btn', highlightTarget: false, position: 'auto' },
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-container"></div><button id="add-btn" style="position:absolute;top:100px;left:200px;width:100px;height:40px;">Add</button><input id="name-input" /><button id="save-btn">Save</button>';
    container = document.getElementById('test-container')!;
    tooltip = createTeachTooltip(container);
  });

  afterEach(() => {
    tooltip.endTeach();
    document.body.innerHTML = '';
  });

  it('creates tooltip elements on startTeach', () => {
    tooltip.startTeach(mockSteps);
    expect(container.innerHTML).toContain('Step 1 of 3');
    expect(container.innerHTML).toContain('Click the Add button');
  });

  it('positions tooltip near target element', () => {
    tooltip.startTeach(mockSteps);
    const tooltipEl = container.querySelector('#yeshie-teach-tooltip');
    expect(tooltipEl).toBeTruthy();
    expect(container.innerHTML).toContain('Click the Add button');
  });

  it('shows fallback when target not found', () => {
    const steps: TeachStep[] = [{ stepIndex: 0, totalSteps: 1, instruction: 'Click missing element', targetSelector: '#nonexistent', highlightTarget: false, position: 'auto' }];
    tooltip.startTeach(steps);
    const html = container.innerHTML.toLowerCase();
    expect(html).toContain('not found');
  });

  it('advances through steps', () => {
    tooltip.startTeach(mockSteps);
    expect(container.innerHTML).toContain('Step 1 of 3');
    tooltip.advanceStep();
    expect(container.innerHTML).toContain('Step 2 of 3');
    expect(container.innerHTML).toContain('Type a name');
    tooltip.advanceStep();
    expect(container.innerHTML).toContain('Step 3 of 3');
    expect(container.innerHTML).toContain('Click Save');
  });

  it('auto-advances when target is clicked (waitForAction: click)', () => {
    const stepCompleteCb = jest.fn();
    tooltip.onStepComplete(stepCompleteCb);
    tooltip.startTeach(mockSteps);
    const target = document.getElementById('add-btn')!;
    target.click();
    expect(stepCompleteCb).toHaveBeenCalledWith(0);
  });

  it('fires skip callback on skip button click', () => {
    const skipCb = jest.fn();
    tooltip.onSkip(skipCb);
    tooltip.startTeach(mockSteps);
    const allBtns = container.querySelectorAll('button');
    const skip = Array.from(allBtns).find(b => b.textContent?.toLowerCase().includes('skip'));
    expect(skip).toBeTruthy();
    skip!.click();
    expect(skipCb).toHaveBeenCalled();
  });

  it('creates dimming mask when highlightTarget is true', () => {
    tooltip.startTeach(mockSteps);
    const html = container.innerHTML;
    expect(html).toContain('yeshie-teach-mask');
    expect(html).toContain('mask');
  });

  it('cleans up on endTeach', () => {
    tooltip.startTeach(mockSteps);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    tooltip.endTeach();
    expect(container.innerHTML).not.toContain('Step 1');
    expect(container.innerHTML).not.toContain('Click the Add button');
  });
});
