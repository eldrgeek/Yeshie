/**
 * First-class wait_for matching — selector, text, and content-stability.
 *
 * Live runs poll this from the extension service worker. The StepExecutor
 * snapshot path uses the same matcher so unit tests cover the ISA without
 * a browser. Recipes should wait on a condition (text/selector/state.stable)
 * rather than a fixed delay.
 */

export const DEFAULT_STABLE_QUIET_MS = 800;

export type WaitState = {
  visible?: boolean;
  enabled?: boolean;
  attribute?: Record<string, unknown>;
  name?: string;
  stateGraph?: { nodes?: Record<string, unknown> };
  stable?: boolean | number;
  text?: string;
};

export type WaitStep = {
  stepId?: string;
  selector?: string | null;
  target?: string;
  url_pattern?: string;
  text?: string;
  quietMs?: number;
  expect?: { state?: string };
  state?: WaitState;
  stateGraph?: { nodes?: Record<string, unknown> };
  [key: string]: unknown;
};

export function wantsStable(step: WaitStep): boolean {
  const s = step.state?.stable;
  return s === true || typeof s === 'number';
}

export function quietMsOf(step: WaitStep): number {
  if (typeof step.state?.stable === 'number' && Number.isFinite(step.state.stable)) {
    return Math.max(0, step.state.stable);
  }
  if (typeof step.quietMs === 'number' && Number.isFinite(step.quietMs)) {
    return Math.max(0, step.quietMs);
  }
  return DEFAULT_STABLE_QUIET_MS;
}

export function fingerprintContent(text: string | null | undefined): string {
  const t = text ?? '';
  return `${t.length}:${t.slice(-280)}`;
}

export function readWaitText(el: Element | null | undefined): string {
  if (!el) return '';
  const tag = (el as HTMLElement).tagName?.toLowerCase?.() || '';
  if (tag === 'input' || tag === 'textarea') {
    return String((el as HTMLInputElement).value || '');
  }
  const html = el as HTMLElement;
  return String(html.innerText || el.textContent || '');
}

function looksLikeSelector(value: string): boolean {
  return value.startsWith('#') || value.startsWith('.') || value.includes('[') || value.includes('>');
}

export class ContentStabilityTracker {
  private samples = new Map<string, { hash: string; lastChange: number; count: number }>();

  constructor(private now: () => number = Date.now) {}

  observe(key: string, hash: string, quietMs = DEFAULT_STABLE_QUIET_MS): boolean {
    const t = this.now();
    const prev = this.samples.get(key);
    if (!prev) {
      this.samples.set(key, { hash, lastChange: t, count: 1 });
      return false;
    }
    if (prev.hash !== hash) {
      this.samples.set(key, { hash, lastChange: t, count: prev.count + 1 });
      return false;
    }
    prev.count += 1;
    return prev.count >= 2 && t - prev.lastChange >= quietMs;
  }

  reset(key?: string): void {
    if (key) this.samples.delete(key);
    else this.samples.clear();
  }
}

export type WaitEvalContext = {
  href: string;
  doc: Document;
  interpolate?: (s: string) => string;
  assessState?: (graph: { nodes?: Record<string, unknown> }) => string;
};

export type WaitEvalResult = {
  matched: boolean;
  contentHash: string;
  pageText: string;
  url?: string;
  state?: string;
};

/**
 * Evaluate every wait_for condition except state.stable.
 * The caller AND-s stability across polls so a single snapshot cannot
 * declare a streaming page "done".
 */
export function evaluateWaitFor(step: WaitStep, ctx: WaitEvalContext): WaitEvalResult {
  const I = ctx.interpolate || ((s: string) => s);

  if (step.url_pattern) {
    const pattern = I(step.url_pattern);
    return {
      matched: new RegExp(pattern).test(ctx.href),
      contentHash: '',
      pageText: '',
      url: ctx.href,
    };
  }

  const graph = (step.state?.stateGraph || step.stateGraph) as { nodes?: Record<string, unknown> } | undefined;
  if (graph?.nodes && ctx.assessState) {
    const currentState = ctx.assessState(graph);
    const expectedState = step.state?.name || step.expect?.state;
    return {
      matched: expectedState ? currentState === expectedState : currentState !== 'unknown',
      contentHash: '',
      pageText: '',
      state: currentState,
    };
  }

  let sel: string | null = step.selector ?? null;
  if (!sel && typeof step.target === 'string' && looksLikeSelector(step.target)) {
    sel = step.target;
  }
  if (sel) sel = I(sel);

  const el = sel ? (ctx.doc.querySelector(sel) as HTMLElement | null) : null;
  const scope = (el || ctx.doc.body) as Element | null;
  const pageText = readWaitText(scope);
  const contentHash = fingerprintContent(pageText);
  const empty: WaitEvalResult = { matched: false, contentHash, pageText };

  const needleRaw = step.text ?? step.state?.text;
  const needle = needleRaw !== undefined && needleRaw !== null && String(needleRaw).length > 0
    ? I(String(needleRaw))
    : '';
  const hasStable = step.state?.stable === true || typeof step.state?.stable === 'number';
  const hasCondition = !!(sel || needle || step.state);
  if (!hasCondition) return empty;

  if (needle && !pageText.includes(needle)) return empty;

  if (step.state) {
    if (step.state.visible !== undefined) {
      const visible = !!el;
      if (step.state.visible ? !visible : visible) return empty;
    }
    if (step.state.enabled !== undefined) {
      const enabled =
        !!el &&
        !(el as HTMLInputElement | HTMLButtonElement).disabled &&
        el.getAttribute('aria-disabled') !== 'true';
      if (step.state.enabled ? !enabled : enabled) return empty;
    }
    if (step.state.attribute) {
      const ok = Object.entries(step.state.attribute).every(
        ([key, expected]) => el?.getAttribute(key) === String(expected)
      );
      if (!ok) return empty;
    }
  }

  // Selector waits require the element unless this is a body-level text/stable wait.
  if (sel && !el && step.state?.visible !== false) return empty;
  if (!sel && !needle && !hasStable) return empty;

  return { matched: true, contentHash, pageText };
}
