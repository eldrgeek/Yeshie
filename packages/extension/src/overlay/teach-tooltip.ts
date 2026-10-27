/** Bead 9: Teach Mode Tooltip Overlay */

export interface TeachStep {
  stepIndex: number;
  totalSteps: number;
  instruction: string;
  targetSelector: string;
  highlightTarget: boolean;
  waitForAction?: 'click' | 'type' | 'navigate' | null;
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /**
   * When set, the step is done once any of these holds, and clicking the
   * target no longer advances it (a click can fail validation or open a
   * confirm dialog). With doneWhen, targetSelector may be '' for a step that
   * has no single control, such as "Sign in".
   */
  doneWhen?: TeachDoneWhen;
  /** When this holds at step start, auto-advance as "already" after a short notice. */
  alreadyDoneWhen?: TeachDoneWhen;
  alreadyDoneNote?: string;
}

export type StepOutcome = 'done' | 'skipped' | 'already';

export interface TeachDoneWhen {
  /** Case-insensitive substring of the page's visible text. */
  textAppears?: string;
  /** Selector (same syntax as targetSelector) that must match an element. */
  selectorAppears?: string;
  /** Selector that matched once the step was shown and no longer matches (a dialog closed). */
  selectorGone?: string;
  /** Substring of location.href. */
  urlIncludes?: string;
}

/** How often doneWhen checks and a missing target are re-evaluated. */
const RECHECK_MS = 750;

export interface TeachExplainPayload {
  text: string;
  stepIndex: number;
  url: string;
  snapshot: string;
}

export interface TeachReplyPayload {
  stepIndex: number;
  message?: string;
  action?: 'skip' | 'redo' | 'replace';
  step?: TeachStep;
}

export interface TeachTooltip {
  startTeach(steps: TeachStep[], startIndex?: number): void;
  advanceStep(): void;
  gotoStep(index: number): void;
  endTeach(): void;
  getCurrentStep(): number;
  handleReply(payload: TeachReplyPayload): void;
  onStepComplete: (callback: (stepIndex: number, outcome: StepOutcome, reason?: string) => void) => void;
  onSkip: (callback: () => void) => void;
  onExit: (callback: () => void) => void;
  onExplain: (callback: (payload: TeachExplainPayload) => void) => void;
}

const TOOLTIP_STYLES = `
  #yeshie-teach-mask {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
  }
  #yeshie-teach-mask svg {
    width: 100%;
    height: 100%;
  }
  #yeshie-teach-tooltip {
    position: fixed;
    z-index: 10001;
    max-width: 280px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
  }
  .tooltip-content {
    background: #fff;
    color: #333;
    border-radius: 8px;
    padding: 14px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    cursor: grab;
    touch-action: none;
  }
  #yeshie-teach-tooltip.dragging .tooltip-content {
    cursor: grabbing;
    user-select: none;
    box-shadow: 0 8px 28px rgba(0,0,0,0.25);
  }
  .tooltip-content button {
    cursor: pointer;
  }
  .step-counter {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #888;
    margin-bottom: 6px;
  }
  .drag-grip {
    letter-spacing: 1px;
    color: #bbb;
  }
  .instruction {
    font-size: 16px;
    color: #222;
    line-height: 1.4;
    margin-bottom: 12px;
  }
  .tooltip-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .skip-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
  }
  .skip-btn:hover {
    color: #555;
  }
  .skip-done-link {
    background: none;
    border: none;
    color: #6a6aef;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    text-decoration: underline;
    margin-top: 8px;
    display: block;
    text-align: left;
  }
  .explain-btn {
    background: none;
    border: 1px solid #ccc;
    border-radius: 4px;
    color: #444;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 10px;
    margin-bottom: 8px;
  }
  .explain-form textarea {
    width: 100%;
    min-height: 72px;
    font-size: 13px;
    margin-bottom: 8px;
    box-sizing: border-box;
  }
  .explain-form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-bottom: 8px;
  }
  .explain-status, .reply-message, .already-done-notice {
    font-size: 13px;
    color: #444;
    margin-bottom: 8px;
    line-height: 1.35;
  }
  .already-done-notice {
    color: #0a7;
    font-weight: 500;
  }
  .next-btn {
    background: #007bff;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 13px;
  }
  .next-btn:hover {
    background: #0069d9;
  }
  .tooltip-arrow {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #fff;
    transform: rotate(45deg);
    box-shadow: 2px 2px 4px rgba(0,0,0,0.05);
  }
  .tooltip-arrow.arrow-top {
    bottom: -6px;
    left: 50%;
    margin-left: -6px;
  }
  .tooltip-arrow.arrow-bottom {
    top: -6px;
    left: 50%;
    margin-left: -6px;
  }
  .tooltip-arrow.arrow-left {
    right: -6px;
    top: 50%;
    margin-top: -6px;
  }
  .tooltip-arrow.arrow-right {
    left: -6px;
    top: 50%;
    margin-top: -6px;
  }
  .element-not-found {
    color: #999;
    font-style: italic;
    font-size: 13px;
    margin-bottom: 8px;
  }
`;

/**
 * Resolve a CSS selector that may contain Playwright-style `:has-text()` pseudo-selectors
 * or comma-separated fallback lists — neither of which vanilla querySelector supports.
 */
function resolveSelector(selector: string): Element | null {
  for (const part of selector.split(',').map(s => s.trim())) {
    const hasTextMatch = part.match(/^(.*?):has-text\(['"](.+?)['"]\)(.*)$/);
    if (hasTextMatch) {
      const [, base, text, rest] = hasTextMatch;
      const candidates = Array.from(
        document.querySelectorAll((base.trim() || '*') + (rest || ''))
      );
      const el = candidates.find(el => el.textContent?.includes(text));
      if (el) return el;
    } else {
      try {
        const el = document.querySelector(part);
        if (el) return el;
      } catch (_) {
        // invalid selector fragment — skip
      }
    }
  }
  return null;
}

function pageText(): string {
  const body = document.body;
  if (!body) return '';
  // innerText skips hidden text; jsdom lacks it, so fall back to textContent.
  return (typeof body.innerText === 'string' ? body.innerText : body.textContent) || '';
}

/**
 * True once any condition in doneWhen holds on the current page. selectorGone
 * counts only after the selector has been seen, so a dialog that has not
 * opened yet does not finish the step; the caller tracks that in `seen`.
 */
/** Default reason when the target is missing but doneWhen already holds. */
export function alreadyDoneReason(step: TeachStep, elementFound: boolean): string | null {
  if (isStepDone(step.alreadyDoneWhen)) {
    return step.alreadyDoneNote?.trim() || 'This step looks complete already.';
  }
  if (step.targetSelector && !elementFound && isStepDone(step.doneWhen)) {
    return step.alreadyDoneNote?.trim() || 'The page already matches what this step was waiting for.';
  }
  return null;
}

function pageSnapshot(): string {
  const text = pageText().trim().slice(0, 4000);
  return `Title: ${document.title}\n\n${text}`;
}

export function isStepDone(doneWhen: TeachDoneWhen | undefined, seen: { gone?: boolean } = {}): boolean {
  if (!doneWhen) return false;
  if (doneWhen.selectorGone) {
    const present = !!resolveSelector(doneWhen.selectorGone);
    if (present) seen.gone = true;
    else if (seen.gone) return true;
  }
  if (doneWhen.urlIncludes && location.href.includes(doneWhen.urlIncludes)) return true;
  if (doneWhen.selectorAppears && resolveSelector(doneWhen.selectorAppears)) return true;
  if (doneWhen.textAppears && pageText().toLowerCase().includes(doneWhen.textAppears.toLowerCase())) return true;
  return false;
}

export function createTeachTooltip(container: HTMLElement): TeachTooltip {
  let steps: TeachStep[] = [];
  let currentStepIndex = -1;
  let stepCompleteCallback: ((stepIndex: number, outcome: StepOutcome, reason?: string) => void) | null = null;
  let skipCallback: (() => void) | null = null;
  let exitCallback: (() => void) | null = null;
  let explainCallback: ((payload: TeachExplainPayload) => void) | null = null;
  let awaitingExplainReply = false;
  let cleanupListeners: (() => void)[] = [];
  // Where the reader dragged the tooltip to, in viewport pixels. It is kept for the rest
  // of the guide. Only the tooltip uses it: the spotlight on the control (the mask) and its
  // follow-on-scroll never read it, so moving the tooltip cannot move the "click here" cue.
  let manualPos: { left: number; top: number } | null = null;

  // DOM elements (created lazily)
  let styleEl: HTMLStyleElement | null = null;
  let maskEl: HTMLElement | null = null;
  let tooltipEl: HTMLElement | null = null;

  function ensureStyle() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.textContent = TOOLTIP_STYLES;
    container.appendChild(styleEl);
  }

  function createMask() {
    if (maskEl) maskEl.remove();
    maskEl = document.createElement('div');
    maskEl.id = 'yeshie-teach-mask';
    container.appendChild(maskEl);
  }

  function updateMask(targetRect: DOMRect | null, highlight: boolean) {
    if (!maskEl) return;
    if (!highlight || !targetRect) {
      maskEl.innerHTML = '';
      return;
    }

    const pad = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = targetRect.left - pad;
    const y = targetRect.top - pad;
    const w = targetRect.width + pad * 2;
    const h = targetRect.height + pad * 2;

    maskEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}">
        <defs>
          <mask id="yeshie-cutout-mask">
            <rect width="100%" height="100%" fill="white"/>
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="black"/>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#yeshie-cutout-mask)"/>
      </svg>
    `;
  }

  function createTooltipEl() {
    if (tooltipEl) tooltipEl.remove();
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'yeshie-teach-tooltip';
    container.appendChild(tooltipEl);
  }

  function positionTooltip(target: HTMLElement | null) {
    if (!tooltipEl) return;

    const arrow = tooltipEl.querySelector('.tooltip-arrow') as HTMLElement | null;

    if (manualPos) {
      // The reader parked it. The spotlight marks the control, so the arrow is not needed.
      const w = tooltipEl.offsetWidth || 280;
      const h = tooltipEl.offsetHeight || 120;
      const left = Math.min(Math.max(manualPos.left, 8), Math.max(8, window.innerWidth - w - 8));
      const top = Math.min(Math.max(manualPos.top, 8), Math.max(8, window.innerHeight - h - 8));
      tooltipEl.style.transform = '';
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
      if (arrow) arrow.style.display = 'none';
      return;
    }

    if (!target) {
      // Center in viewport if no target element found
      tooltipEl.style.top = '50%';
      tooltipEl.style.left = '50%';
      tooltipEl.style.transform = 'translate(-50%, -50%)';
      if (arrow) arrow.style.display = 'none';
      return;
    }

    tooltipEl.style.transform = '';
    const rect = target.getBoundingClientRect();
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipWidth = tooltipEl.offsetWidth || 280;
    const tooltipHeight = tooltipEl.offsetHeight || 120;

    // Default: place below target
    let top = rect.bottom + gap;
    let left = rect.left;

    // Flip above if bottom of tooltip would exceed viewport height
    const above = top + tooltipHeight > vh - 8;
    if (above) {
      top = rect.top - tooltipHeight - gap;
    }

    // Clamp left so tooltip doesn't go off right edge
    if (left + tooltipWidth > vw - 8) {
      left = vw - tooltipWidth - 8;
    }
    if (left < 8) left = 8;

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;

    // Point the arrow at the target's center from whichever side faces it.
    if (arrow) {
      arrow.style.display = '';
      arrow.className = `tooltip-arrow ${above ? 'arrow-top' : 'arrow-bottom'}`;
      const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - left, 14), tooltipWidth - 14);
      arrow.style.left = `${arrowLeft}px`;
    }
  }

  function removeEventListeners() {
    for (const cleanup of cleanupListeners) cleanup();
    cleanupListeners = [];
  }

  function renderStep(index: number) {
    if (index < 0 || index >= steps.length) return;
    removeEventListeners();

    const step = steps[index];
    currentStepIndex = index;

    ensureStyle();
    createMask();
    createTooltipEl();
    // Expose current step's target selector as a data attribute for Playwright tests
    tooltipEl!.setAttribute('data-target-selector', step.targetSelector);

    // Find target in main document
    // resolveSelector handles :has-text() pseudo-selectors and comma-separated fallback lists
    const hasTarget = !!step.targetSelector;
    const target = hasTarget ? resolveSelector(step.targetSelector) as HTMLElement | null : null;
    const targetRect = target ? target.getBoundingClientRect() : null;
    const elementFound = !!target;

    updateMask(targetRect, step.highlightTarget);

    const nextLabel = step.doneWhen ? 'I did it' : 'Next Step';

    tooltipEl!.setAttribute('data-target-selector', step.targetSelector || '');
    tooltipEl!.replaceChildren();
    const contentEl = document.createElement('div');
    contentEl.className = 'tooltip-content';
    const counter = document.createElement('div');
    counter.className = 'step-counter';
    const counterLeft = document.createElement('span');
    counterLeft.textContent = `Step ${step.stepIndex + 1} of ${step.totalSteps}`;
    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.title = 'Drag to move. Double-click to put it back.';
    grip.textContent = '⠿ drag';
    counter.append(counterLeft, grip);
    contentEl.appendChild(counter);

    if (hasTarget && !elementFound) {
      const nf = document.createElement('div');
      nf.className = 'element-not-found';
      nf.textContent = 'Element not found';
      contentEl.appendChild(nf);
    }

    const instructionEl = document.createElement('div');
    instructionEl.className = 'instruction';
    instructionEl.textContent = step.instruction;
    contentEl.appendChild(instructionEl);

    const replyEl = document.createElement('div');
    replyEl.className = 'reply-message';
    replyEl.style.display = 'none';
    contentEl.appendChild(replyEl);

    const explainStatusEl = document.createElement('div');
    explainStatusEl.className = 'explain-status';
    explainStatusEl.style.display = 'none';
    contentEl.appendChild(explainStatusEl);

    const explainForm = document.createElement('div');
    explainForm.className = 'explain-form';
    explainForm.style.display = 'none';
    const explainPrompt = document.createElement('div');
    explainPrompt.textContent = "What do you see, or what's different?";
    explainPrompt.style.marginBottom = '6px';
    explainPrompt.style.fontSize = '13px';
    const explainText = document.createElement('textarea');
    explainText.setAttribute('aria-label', "What do you see, or what's different?");
    const explainActions = document.createElement('div');
    explainActions.className = 'explain-form-actions';
    const explainCancel = document.createElement('button');
    explainCancel.type = 'button';
    explainCancel.textContent = 'Cancel';
    const explainSend = document.createElement('button');
    explainSend.type = 'button';
    explainSend.textContent = 'Send';
    explainActions.append(explainCancel, explainSend);
    explainForm.append(explainPrompt, explainText, explainActions);
    contentEl.appendChild(explainForm);

    const explainBtn = document.createElement('button');
    explainBtn.type = 'button';
    explainBtn.className = 'explain-btn';
    explainBtn.textContent = 'Explain';
    contentEl.appendChild(explainBtn);

    const controls = document.createElement('div');
    controls.className = 'tooltip-controls';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'skip-btn';
    skipBtn.textContent = 'Skip';
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'next-btn';
    nextBtn.textContent = nextLabel;
    controls.append(skipBtn, nextBtn);
    contentEl.appendChild(controls);

    const skipDoneLink = document.createElement('button');
    skipDoneLink.type = 'button';
    skipDoneLink.className = 'skip-done-link';
    skipDoneLink.textContent = 'Skip, already done';
    contentEl.appendChild(skipDoneLink);

    const arrowEl = document.createElement('div');
    arrowEl.className = 'tooltip-arrow';
    tooltipEl!.append(contentEl, arrowEl);

    positionTooltip(target);

    const onSkipClick = () => {
      skipCallback?.();
    };

    const onSkipDoneClick = () => {
      completeStep('already', 'already done');
    };

    const onExplainOpen = () => {
      explainForm.style.display = '';
      explainBtn.style.display = 'none';
      explainText.focus();
    };

    const onExplainCancel = () => {
      explainForm.style.display = 'none';
      explainBtn.style.display = '';
      explainText.value = '';
    };

    const onExplainSend = () => {
      const text = explainText.value.trim();
      if (!text) return;
      explainForm.style.display = 'none';
      explainBtn.style.display = 'none';
      explainText.value = '';
      awaitingExplainReply = true;
      explainStatusEl.style.display = '';
      explainStatusEl.textContent = 'Got it, adjusting…';
      explainCallback?.({
        text,
        stepIndex: step.stepIndex,
        url: location.href,
        snapshot: pageSnapshot(),
      });
    };

    const onNextClick = () => {
      const currentTarget = hasTarget && !step.doneWhen
        ? resolveSelector(step.targetSelector) as HTMLElement | null
        : null;
      if (currentTarget) {
        nextBtn.textContent = "I'll click that for you…";
        nextBtn.disabled = true;
        currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => {
          completeStep('done');
        }, 1500);
      } else {
        completeStep('done');
      }
    };

    skipBtn.addEventListener('click', onSkipClick);
    skipDoneLink.addEventListener('click', onSkipDoneClick);
    explainBtn.addEventListener('click', onExplainOpen);
    explainCancel.addEventListener('click', onExplainCancel);
    explainSend.addEventListener('click', onExplainSend);
    nextBtn.addEventListener('click', onNextClick);
    cleanupListeners.push(() => {
      skipBtn.removeEventListener('click', onSkipClick);
      skipDoneLink.removeEventListener('click', onSkipDoneClick);
      explainBtn.removeEventListener('click', onExplainOpen);
      explainCancel.removeEventListener('click', onExplainCancel);
      explainSend.removeEventListener('click', onExplainSend);
      nextBtn.removeEventListener('click', onNextClick);
    });

    const alreadyReason = alreadyDoneReason(step, elementFound);
    if (alreadyReason) {
      const notice = document.createElement('div');
      notice.className = 'already-done-notice';
      notice.textContent = `Already done: ${alreadyReason}`;
      contentEl.insertBefore(notice, instructionEl);
      const t = setTimeout(() => completeStep('already', alreadyReason), 1500);
      cleanupListeners.push(() => clearTimeout(t));
    }

    // Drag the tooltip by its body (not its buttons). Double-click puts it back by the control.
    const tip = tooltipEl!;
    let drag: { dx: number; dy: number; pointerId: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button) return;
      if ((e.target as Element | null)?.closest('button')) return;
      const r = tip.getBoundingClientRect();
      // A centred tooltip uses a transform; pin it to pixels before it moves.
      tip.style.transform = '';
      tip.style.left = `${r.left}px`;
      tip.style.top = `${r.top}px`;
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, pointerId: e.pointerId };
      tip.classList.add('dragging');
      try { contentEl.setPointerCapture?.(e.pointerId); } catch (_) { /* not capturable: window listeners still work */ }
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      manualPos = { left: e.clientX - drag.dx, top: e.clientY - drag.dy };
      positionTooltip(target);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      tip.classList.remove('dragging');
    };
    const onReset = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('button')) return;
      manualPos = null;
      positionTooltip(target);
    };
    contentEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    contentEl.addEventListener('dblclick', onReset);
    cleanupListeners.push(() => {
      contentEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      contentEl.removeEventListener('dblclick', onReset);
    });

    // Behavior 1: auto-advance when user clicks the target element, unless a
    // doneWhen check decides instead
    if (target && !step.doneWhen) {
      const onTargetClick = () => {
        completeStep('done');
      };
      target.addEventListener('click', onTargetClick, { once: true });
      cleanupListeners.push(() => target.removeEventListener('click', onTargetClick));
    }

    // Behavior 3: keep watching the page. Advance once doneWhen holds; if the
    // target was missing (late render), redraw when it shows up; follow the
    // target when the page scrolls or resizes.
    const seen = {};
    const recheck = () => {
      if (currentStepIndex !== index) return;
      if (isStepDone(step.doneWhen, seen)) {
        completeStep('done');
        return;
      }
      if (hasTarget && !target && resolveSelector(step.targetSelector)) {
        renderStep(index);
      }
    };
    const timer = setInterval(recheck, RECHECK_MS);
    cleanupListeners.push(() => clearInterval(timer));
    if (step.doneWhen) {
      const first = setTimeout(recheck, 0);
      cleanupListeners.push(() => clearTimeout(first));
    }

    if (target) {
      let frame = 0;
      const follow = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          updateMask(target.getBoundingClientRect(), step.highlightTarget);
          positionTooltip(target);
        });
      };
      window.addEventListener('scroll', follow, true);
      window.addEventListener('resize', follow);
      cleanupListeners.push(() => {
        window.removeEventListener('scroll', follow, true);
        window.removeEventListener('resize', follow);
        if (frame) cancelAnimationFrame(frame);
      });
    }

    if (step.waitForAction === 'navigate') {
      const onNav = () => {
        completeStep('done');
      };
      window.addEventListener('popstate', onNav, { once: true });
      window.addEventListener('hashchange', onNav, { once: true });
      cleanupListeners.push(() => {
        window.removeEventListener('popstate', onNav);
        window.removeEventListener('hashchange', onNav);
      });
    }
  }

  function completeStep(outcome: StepOutcome, reason?: string) {
    if (currentStepIndex < 0) return;
    stepCompleteCallback?.(currentStepIndex, outcome, reason);
    if (currentStepIndex >= steps.length - 1) {
      endTeach();
      exitCallback?.();
      return;
    }
    renderStep(currentStepIndex + 1);
  }

  function advanceStep() {
    completeStep('done');
  }

  function handleReply(payload: TeachReplyPayload) {
    if (currentStepIndex < 0 || payload.stepIndex !== currentStepIndex) return;
    if (payload.message) {
      const tip = tooltipEl?.querySelector('.reply-message') as HTMLElement | null;
      const status = tooltipEl?.querySelector('.explain-status') as HTMLElement | null;
      if (status) status.style.display = 'none';
      awaitingExplainReply = false;
      if (tip) {
        tip.style.display = '';
        tip.textContent = payload.message;
      }
    }
    if (payload.action === 'redo') {
      renderStep(currentStepIndex);
      return;
    }
    if (payload.action === 'replace' && payload.step) {
      steps[currentStepIndex] = { ...steps[currentStepIndex], ...payload.step, stepIndex: currentStepIndex, totalSteps: steps.length };
      renderStep(currentStepIndex);
      return;
    }
    if (payload.action === 'skip') {
      completeStep('skipped', payload.message || 'skipped by guide session');
    }
  }

  function endTeach() {
    removeEventListeners();
    if (maskEl) { maskEl.remove(); maskEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
    steps = [];
    currentStepIndex = -1;
    manualPos = null;
    awaitingExplainReply = false;
  }

  return {
    startTeach(newSteps: TeachStep[], startIndex = 0) {
      steps = newSteps;
      manualPos = null;
      if (steps.length > 0) {
        renderStep(Math.min(startIndex, steps.length - 1));
      }
    },

    advanceStep,

    handleReply,

    gotoStep(index: number) {
      if (index >= 0 && index < steps.length) {
        renderStep(index);
      }
    },

    endTeach,

    getCurrentStep() {
      return currentStepIndex;
    },

    onStepComplete(callback: (stepIndex: number, outcome: StepOutcome, reason?: string) => void) {
      stepCompleteCallback = callback;
    },

    onSkip(callback: () => void) {
      skipCallback = callback;
    },

    onExit(callback: () => void) {
      exitCallback = callback;
    },

    onExplain(callback: (payload: TeachExplainPayload) => void) {
      explainCallback = callback;
    },
  };
}
