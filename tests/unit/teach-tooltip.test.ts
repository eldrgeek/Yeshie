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

describe('Teach Tooltip dragging', () => {
  let container: HTMLElement;
  let tooltip: ReturnType<typeof createTeachTooltip>;

  const steps: TeachStep[] = [
    { stepIndex: 0, totalSteps: 2, instruction: 'Click the Add button', targetSelector: '#add-btn', highlightTarget: true, position: 'auto' },
    { stepIndex: 1, totalSteps: 2, instruction: 'Click Save', targetSelector: '#save-btn', highlightTarget: true, position: 'auto' },
  ];

  const rectOf = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

  const fire = (el: EventTarget, type: string, x: number, y: number) =>
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));

  const tipEl = () => container.querySelector('#yeshie-teach-tooltip') as HTMLElement;
  const body = () => container.querySelector('.tooltip-content') as HTMLElement;
  const mask = () => container.querySelector('#yeshie-teach-mask')!.innerHTML;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-container"></div><button id="add-btn">Add</button><button id="save-btn">Save</button>';
    document.getElementById('add-btn')!.getBoundingClientRect = () => rectOf(200, 100, 100, 40);
    document.getElementById('save-btn')!.getBoundingClientRect = () => rectOf(400, 300, 80, 30);
    container = document.getElementById('test-container')!;
    tooltip = createTeachTooltip(container);
  });

  afterEach(() => {
    tooltip.endTeach();
    document.body.innerHTML = '';
  });

  it('moves the tooltip when its body is dragged', () => {
    tooltip.startTeach(steps);
    const before = { left: tipEl().style.left, top: tipEl().style.top };
    // jsdom does no layout: report the box where the tooltip was placed, as a browser would.
    tipEl().getBoundingClientRect = () => rectOf(parseFloat(tipEl().style.left), parseFloat(tipEl().style.top), 280, 100);
    fire(body(), 'pointerdown', 220, 160);
    fire(window, 'pointermove', 320, 260);
    fire(window, 'pointerup', 320, 260);
    expect(tipEl().style.left).toBe(`${parseFloat(before.left) + 100}px`);
    expect(tipEl().style.top).toBe(`${parseFloat(before.top) + 100}px`);
  });

  it('does not move the spotlight on the control', () => {
    tooltip.startTeach(steps);
    const spotlight = mask();
    expect(spotlight).toContain('<rect x="196" y="96"');
    fire(body(), 'pointerdown', 220, 160);
    fire(window, 'pointermove', 500, 400);
    fire(window, 'pointerup', 500, 400);
    expect(mask()).toBe(spotlight);
  });

  it('hides the arrow once the tooltip is moved, because the spotlight marks the control', () => {
    tooltip.startTeach(steps);
    const arrow = () => container.querySelector('.tooltip-arrow') as HTMLElement;
    expect(arrow().style.display).toBe('');
    fire(body(), 'pointerdown', 220, 160);
    fire(window, 'pointermove', 240, 180);
    fire(window, 'pointerup', 240, 180);
    expect(arrow().style.display).toBe('none');
  });

  it('keeps the parked position on the next step, while the spotlight moves to the next control', () => {
    tooltip.startTeach(steps);
    fire(body(), 'pointerdown', 220, 160);
    fire(window, 'pointermove', 300, 260);
    fire(window, 'pointerup', 300, 260);
    const parked = { left: tipEl().style.left, top: tipEl().style.top };
    const firstSpotlight = mask();
    tooltip.advanceStep();
    expect(container.innerHTML).toContain('Click Save');
    expect({ left: tipEl().style.left, top: tipEl().style.top }).toEqual(parked);
    expect(mask()).not.toBe(firstSpotlight);
    expect(mask()).toContain('<rect x="396" y="296"');
  });

  it('does not start a drag from a button', () => {
    tooltip.startTeach(steps);
    const before = tipEl().style.left;
    const skip = container.querySelector('.skip-btn') as HTMLElement;
    fire(skip, 'pointerdown', 10, 10);
    fire(window, 'pointermove', 400, 400);
    fire(window, 'pointerup', 400, 400);
    expect(tipEl().style.left).toBe(before);
  });

  it('puts the tooltip back by the control on double-click', () => {
    tooltip.startTeach(steps);
    const before = { left: tipEl().style.left, top: tipEl().style.top };
    fire(body(), 'pointerdown', 220, 160);
    fire(window, 'pointermove', 500, 500);
    fire(window, 'pointerup', 500, 500);
    expect(tipEl().style.left).not.toBe(before.left);
    fire(body(), 'dblclick', 500, 500);
    expect({ left: tipEl().style.left, top: tipEl().style.top }).toEqual(before);
  });

  it('forgets the parked position when a new guide starts', () => {
    tooltip.startTeach(steps);
    const before = tipEl().style.left;
    fire(body(), 'pointerdown', 220, 160);
    fire(window, 'pointermove', 500, 500);
    fire(window, 'pointerup', 500, 500);
    tooltip.endTeach();
    tooltip.startTeach(steps);
    expect(tipEl().style.left).toBe(before);
  });
});
