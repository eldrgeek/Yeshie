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
  /** An object of conditions, or a string naming a state-graph node to wait for. */
  state?: WaitState | string;
  stateGraph?: { nodes?: Record<string, unknown> };
  [key: string]: unknown;
};

/** `state` as an object of conditions. A string `state` names a graph node instead. */
function stateObj(step: WaitStep): WaitState | undefined {
  return step.state && typeof step.state === 'object' ? step.state : undefined;
}

export function wantsStable(step: WaitStep): boolean {
  const s = stateObj(step)?.stable;
  return s === true || typeof s === 'number';
}

export function quietMsOf(step: WaitStep): number {
  const stable = stateObj(step)?.stable;
  if (typeof stable === 'number' && Number.isFinite(stable)) {
    return Math.max(0, stable);
  }
  if (typeof step.quietMs === 'number' && Number.isFinite(step.quietMs)) {
    return Math.max(0, step.quietMs);
  }
  return DEFAULT_STABLE_QUIET_MS;
}

export type StateGraphLike = { nodes?: Record<string, unknown> };

/** The graph node a wait_for waits for: `state: "name"`, `state.name`, or `expect.state`. */
export function expectedWaitState(step: WaitStep): string | null {
  if (typeof step.state === 'string') return step.state || null;
  return stateObj(step)?.name || step.expect?.state || null;
}

/**
 * The graph a state wait_for is judged against: the step's own graph, or else
 * the payload's graph when the step names a state. Null means the step is not
 * a state wait.
 */
export function waitStateGraph(step: WaitStep, payloadGraph?: StateGraphLike | null): StateGraphLike | null {
  const inline = (stateObj(step)?.stateGraph || step.stateGraph) as StateGraphLike | undefined;
  if (inline?.nodes) return inline;
  if (expectedWaitState(step) && payloadGraph?.nodes) return payloadGraph;
  return null;
}

/**
 * True when the page is in the state this wait_for is waiting for. Given
 * `holds` (each node's result from PRE_ASSESS_STATE), the expected node's own
 * signals decide, so a node judged earlier that also holds cannot hide it; on a
 * signed-in YeshID group page, "authenticated" holds as well as "group-detail".
 * Without `holds`, the first node that held must be the expected one.
 */
export function stateWaitMatched(step: WaitStep, currentState: string, holds?: Record<string, boolean> | null): boolean {
  const expected = expectedWaitState(step);
  if (!expected) return currentState !== 'unknown';
  return holds ? holds[expected] === true : currentState === expected;
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
  /** The payload's state graph, used when the step names a state but carries no graph. */
  stateGraph?: StateGraphLike | null;
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

  const graph = waitStateGraph(step, ctx.stateGraph);
  if (graph && ctx.assessState) {
    const currentState = ctx.assessState(graph);
    return { matched: stateWaitMatched(step, currentState), contentHash: '', pageText: '', state: currentState };
  }
  // A named state with no graph to judge it by can never be reached.
  if (!graph && expectedWaitState(step)) return { matched: false, contentHash: '', pageText: '' };
  const st = stateObj(step);

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

  const needleRaw = step.text ?? st?.text;
  const needle = needleRaw !== undefined && needleRaw !== null && String(needleRaw).length > 0
    ? I(String(needleRaw))
    : '';
  const hasStable = st?.stable === true || typeof st?.stable === 'number';
  const hasCondition = !!(sel || needle || st);
  if (!hasCondition) return empty;

  if (needle && !pageText.includes(needle)) return empty;

  if (st) {
    if (st.visible !== undefined) {
      const visible = !!el;
      if (st.visible ? !visible : visible) return empty;
    }
    if (st.enabled !== undefined) {
      const enabled =
        !!el &&
        !(el as HTMLInputElement | HTMLButtonElement).disabled &&
        el.getAttribute('aria-disabled') !== 'true';
      if (st.enabled ? !enabled : enabled) return empty;
    }
    if (st.attribute) {
      const ok = Object.entries(st.attribute).every(
        ([key, expected]) => el?.getAttribute(key) === String(expected)
      );
      if (!ok) return empty;
    }
  }

  // Selector waits require the element unless this is a body-level text/stable wait.
  if (sel && !el && st?.visible !== false) return empty;
  if (!sel && !needle && !hasStable) return empty;

  return { matched: true, contentHash, pageText };
}
