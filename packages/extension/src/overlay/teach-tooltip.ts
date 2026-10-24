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
}

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

export interface TeachTooltip {
  startTeach(steps: TeachStep[], startIndex?: number): void;
  advanceStep(): void;
  gotoStep(index: number): void;
  endTeach(): void;
  getCurrentStep(): number;
  onStepComplete: (callback: (stepIndex: number) => void) => void;
  onSkip: (callback: () => void) => void;
  onExit: (callback: () => void) => void;
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
  }
  .step-counter {
    font-size: 12px;
    color: #888;
    margin-bottom: 6px;
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
  let stepCompleteCallback: ((stepIndex: number) => void) | null = null;
  let skipCallback: (() => void) | null = null;
  let exitCallback: (() => void) | null = null;
  let cleanupListeners: (() => void)[] = [];

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

    // Build tooltip content
    const notFoundHtml = hasTarget && !elementFound
      ? `<div class="element-not-found">Element not found</div>`
      : '';
    // With a doneWhen check, Next means "I did it": it advances without clicking.
    const nextLabel = step.doneWhen ? 'I did it' : 'Next Step';

    tooltipEl!.setAttribute('data-target-selector', step.targetSelector || '');
    tooltipEl!.innerHTML = `
      <div class="tooltip-content">
        <div class="step-counter">Step ${step.stepIndex + 1} of ${step.totalSteps}</div>
        ${notFoundHtml}
        <div class="instruction">${step.instruction}</div>
        <div class="tooltip-controls">
          <button class="skip-btn">Skip</button>
          <button class="next-btn">${nextLabel}</button>
        </div>
      </div>
      <div class="tooltip-arrow"></div>
    `;

    positionTooltip(target);

    // Wire controls
    const skipBtn = tooltipEl!.querySelector('.skip-btn')!;
    const nextBtn = tooltipEl!.querySelector('.next-btn') as HTMLButtonElement;

    const onSkipClick = () => {
      skipCallback?.();
    };

    const onNextClick = () => {
      const currentTarget = hasTarget && !step.doneWhen
        ? resolveSelector(step.targetSelector) as HTMLElement | null
        : null;
      if (currentTarget) {
        // Behavior 2: click the target for the user, then advance
        nextBtn.textContent = "I'll click that for you…";
        nextBtn.disabled = true;
        currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => {
          advanceStep();
        }, 1500);
      } else {
        // No target — just advance
        advanceStep();
      }
    };

    skipBtn.addEventListener('click', onSkipClick);
    nextBtn.addEventListener('click', onNextClick);
    cleanupListeners.push(() => {
      skipBtn.removeEventListener('click', onSkipClick);
      nextBtn.removeEventListener('click', onNextClick);
    });

    // Behavior 1: auto-advance when user clicks the target element, unless a
    // doneWhen check decides instead
    if (target && !step.doneWhen) {
      const onTargetClick = () => {
        advanceStep();
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
        advanceStep();
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
        advanceStep();
      };
      window.addEventListener('popstate', onNav, { once: true });
      window.addEventListener('hashchange', onNav, { once: true });
      cleanupListeners.push(() => {
        window.removeEventListener('popstate', onNav);
        window.removeEventListener('hashchange', onNav);
      });
    }
  }

  function advanceStep() {
    // Always notify background so session.currentStepIndex stays current (Next btn, click, navigate)
    stepCompleteCallback?.(currentStepIndex);
    if (currentStepIndex >= steps.length - 1) {
      endTeach();
      exitCallback?.();
      return;
    }
    renderStep(currentStepIndex + 1);
  }

  function endTeach() {
    removeEventListeners();
    if (maskEl) { maskEl.remove(); maskEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
    steps = [];
    currentStepIndex = -1;
  }

  return {
    startTeach(newSteps: TeachStep[], startIndex = 0) {
      steps = newSteps;
      if (steps.length > 0) {
        renderStep(Math.min(startIndex, steps.length - 1));
      }
    },

    advanceStep,

    gotoStep(index: number) {
      if (index >= 0 && index < steps.length) {
        renderStep(index);
      }
    },

    endTeach,

    getCurrentStep() {
      return currentStepIndex;
    },

    onStepComplete(callback: (stepIndex: number) => void) {
      stepCompleteCallback = callback;
    },

    onSkip(callback: () => void) {
      skipCallback = callback;
    },

    onExit(callback: () => void) {
      exitCallback = callback;
    },
  };
}
