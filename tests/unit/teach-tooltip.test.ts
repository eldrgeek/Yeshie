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

describe('Teach Tooltip doneWhen (guides)', () => {
  let container: HTMLElement;
  let tooltip: ReturnType<typeof createTeachTooltip>;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="test-container"></div><button id="export-btn">Export data</button><div id="toast"></div>';
    container = document.getElementById('test-container')!;
    tooltip = createTeachTooltip(container);
  });

  afterEach(() => {
    tooltip.endTeach();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const exportSteps: TeachStep[] = [
    { stepIndex: 0, totalSteps: 2, instruction: 'Click Export data', targetSelector: '#export-btn', highlightTarget: true, position: 'auto', doneWhen: { textAppears: 'export requested' } },
    { stepIndex: 1, totalSteps: 2, instruction: 'Check your email', targetSelector: '', highlightTarget: false, position: 'auto', doneWhen: { selectorAppears: '#done-marker' } },
  ];

  it('advances when doneWhen text appears, not on the click itself', () => {
    const stepCompleteCb = jest.fn();
    tooltip.onStepComplete(stepCompleteCb);
    tooltip.startTeach(exportSteps);

    document.getElementById('export-btn')!.click();
    jest.advanceTimersByTime(1000);
    expect(stepCompleteCb).not.toHaveBeenCalled();
    expect(container.innerHTML).toContain('Step 1 of 2');

    document.getElementById('toast')!.textContent = 'Export Requested. Check your email.';
    jest.advanceTimersByTime(1000);
    expect(stepCompleteCb).toHaveBeenCalledWith(0);
    expect(container.innerHTML).toContain('Step 2 of 2');
  });

  it('finishes the guide when the last doneWhen selector appears', () => {
    const exitCb = jest.fn();
    tooltip.onExit(exitCb);
    tooltip.startTeach(exportSteps, 1);
    expect(container.innerHTML).not.toContain('not found');

    const marker = document.createElement('span');
    marker.id = 'done-marker';
    document.body.appendChild(marker);
    jest.advanceTimersByTime(1000);
    expect(exitCb).toHaveBeenCalled();
    expect(container.querySelector('#yeshie-teach-tooltip')).toBeNull();
  });

  it('labels Next as "I did it" and advances without clicking the target', () => {
    const clicked = jest.fn();
    document.getElementById('export-btn')!.addEventListener('click', clicked);
    tooltip.startTeach(exportSteps);
    const next = container.querySelector('.next-btn') as HTMLButtonElement;
    expect(next.textContent).toBe('I did it');
    next.click();
    expect(clicked).not.toHaveBeenCalled();
    expect(container.innerHTML).toContain('Step 2 of 2');
  });

  it('skips a step that is already done when it is shown', () => {
    document.getElementById('toast')!.textContent = 'export requested';
    const stepCompleteCb = jest.fn();
    tooltip.onStepComplete(stepCompleteCb);
    tooltip.startTeach(exportSteps);
    jest.advanceTimersByTime(0);
    expect(stepCompleteCb).toHaveBeenCalledWith(0);
  });

  it('selectorGone finishes only after the element was seen and then removed', () => {
    const steps: TeachStep[] = [
      { stepIndex: 0, totalSteps: 1, instruction: 'Click Confirm export', targetSelector: '#export-btn', highlightTarget: true, position: 'auto', doneWhen: { selectorGone: '#confirm-dialog' } },
    ];
    const exitCb = jest.fn();
    tooltip.onExit(exitCb);
    tooltip.startTeach(steps);
    jest.advanceTimersByTime(1000);
    expect(exitCb).not.toHaveBeenCalled();

    const dialog = document.createElement('div');
    dialog.id = 'confirm-dialog';
    document.body.appendChild(dialog);
    jest.advanceTimersByTime(1000);
    expect(exitCb).not.toHaveBeenCalled();

    dialog.remove();
    jest.advanceTimersByTime(1000);
    expect(exitCb).toHaveBeenCalled();
  });

  it('redraws when a target that rendered late shows up', () => {
    const steps: TeachStep[] = [
      { stepIndex: 0, totalSteps: 1, instruction: 'Click Create export', targetSelector: '#late-btn', highlightTarget: true, position: 'auto' },
    ];
    tooltip.startTeach(steps);
    expect(container.innerHTML).toContain('not found');

    const late = document.createElement('button');
    late.id = 'late-btn';
    document.body.appendChild(late);
    jest.advanceTimersByTime(1000);
    expect(container.innerHTML).not.toContain('not found');

    const stepCompleteCb = jest.fn();
    tooltip.onStepComplete(stepCompleteCb);
    late.click();
    expect(stepCompleteCb).toHaveBeenCalledWith(0);
  });
});
