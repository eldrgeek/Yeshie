// Step Executor — executes individual payload chain steps
// Runs in-page via executor-inject.js (browser context)
// This file is the canonical reference; executor-inject.js mirrors it

export type StepAction =
  | 'assess_state' | 'navigate' | 'type' | 'click' | 'click_preset'
  | 'wait_for' | 'read' | 'hover' | 'scroll' | 'assert' | 'js' | 'select'
  | 'probe_affordances';

export interface StepResult {
  stepId: string;
  action: StepAction | string;
  status: 'ok' | 'skipped' | 'error' | 'unsupported';
  durationMs: number;
  affordances?: Array<{text:string|null, ariaLabel:string|null, title:string|null}>;
  affordanceCount?: number;
  preset?: string;
  result?: unknown;
  // type-specific fields
  state?: string;
  matched?: boolean;
  value?: string;
  text?: string;
  selector?: string | null;
  confidence?: number;
  resolvedVia?: string;
  target?: string;
  url?: string;
  responseSignature?: ResponseSignatureResult;
  storedAs?: string;
  reason?: string;
  error?: string;
}

export interface ResponseSignatureResult {
  matched: boolean;
  type?: string;
  url?: string;
  selector?: string;
  text?: string;
  timeout?: boolean;
  snackbarText?: string;
  alertText?: string;
  urlNow?: string;
}

// ── StateGraph types ──────────────────────────────────────────────────────────

export interface StateSignal {
  type: 'url_matches' | 'element_visible' | 'element_text';
  selector?: string;
  pattern?: string;
  text?: string;
}

export interface StateNode {
  signals: StateSignal[];
}

export interface StateGraph {
  nodes: Record<string, StateNode>;
}

// ── StepExecutor — synchronous DOM-based executor for unit testing ────────────
// Mirrors executor-inject.js logic but runs in Node/jsdom without async I/O
// navigate/type return 'ok' without side effects in jsdom context

import { TargetResolver, AbstractTarget } from './target-resolver.js';

export interface Step {
  stepId: string;
  action: string;
  url?: string;
  target?: string;
  selector?: string;
  value?: string;
  condition?: string;
  expect?: { state?: string };
  candidates?: string[];
  store_as?: string;
  code?: string;
  [key: string]: unknown;
}

export class StepExecutor {
  private resolver: TargetResolver;
  private buffer: Record<string, unknown> = {};

  constructor(
    private doc: Document,
    private abstractTargets: Record<string, AbstractTarget>,
    private params: Record<string, string> = {},
    buffer: Record<string, unknown> = {}
  ) {
    this.resolver = new TargetResolver(doc);
    this.buffer = buffer;
  }

  private I(s: unknown): string {
    if (typeof s !== 'string') return String(s ?? '');
    return s.replace(/\{\{(\w+)\}\}/g, (_, k) => this.params[k] ?? '');
  }

  private assessState(sg: StateGraph): string {
    if (!sg?.nodes) return 'unknown';
    for (const [name, node] of Object.entries(sg.nodes)) {
      if (!node.signals?.length) continue;
      const ok = node.signals.every(sig => {
        if (sig.type === 'element_visible') {
          const el = this.doc.querySelector(sig.selector!);
          return !!el;
        }
        if (sig.type === 'element_text') {
          const el = this.doc.querySelector(sig.selector!);
          return el?.textContent?.includes(sig.text!) ?? false;
        }
        return false;
      });
      if (ok) return name;
    }
    return 'unknown';
  }

  execute(step: Step, stateGraph?: StateGraph): StepResult {
    const t0 = Date.now();
    const a = step.action;

    // Condition gate
    if (step.condition !== undefined) {
      const val = this.I(step.condition);
      if (!val || val === 'false' || val === '0' || val === 'undefined') {
        return { stepId: step.stepId, action: a, status: 'skipped', reason: 'condition falsy', durationMs: Date.now() - t0 };
      }
    }

    try {
      if (a === 'assess_state') {
        const sg = stateGraph ?? { nodes: {} };
        const state = this.assessState(sg);
        const matched = !step.expect?.state || state === step.expect.state;
        return { stepId: step.stepId, action: a, status: 'ok', state, matched, durationMs: Date.now() - t0 };
      }

      if (a === 'navigate') {
        // In jsdom: just validate the URL exists and return ok
        const url = this.I(step.url);
        return { stepId: step.stepId, action: a, status: 'ok', url, value: url, durationMs: Date.now() - t0 };
      }

      if (a === 'type') {
        const value = this.I(step.value);
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve target: ' + step.target);
        const res = this.resolver.resolve(this.abstractTargets[step.target!] ?? {});
        if (res.resolvedVia === 'escalate') throw new Error('Cannot resolve target: ' + step.target);
        // In jsdom: set value directly
        if (res.element && 'value' in res.element) {
          (res.element as HTMLInputElement).value = value;
        }
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, value, selector: res.selector, confidence: res.confidence, resolvedVia: res.resolvedVia, durationMs: Date.now() - t0 };
      }

      if (a === 'click') {
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve target: ' + step.target);
        const tgtDef = step.target ? (this.abstractTargets[step.target] ?? {}) : {};
        const res = step.target ? this.resolver.resolve(tgtDef) : (step.selector ? { element: this.doc.querySelector(step.selector), selector: step.selector, confidence: 0.7, resolvedVia: 'css_cascade' as const } : null);
        if (!res || res.resolvedVia === 'escalate') throw new Error('Cannot resolve target: ' + (step.target ?? step.selector));
        if (res.element) (res.element as HTMLElement).click?.();
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, selector: res.selector, confidence: res.confidence, resolvedVia: res.resolvedVia, durationMs: Date.now() - t0 };
      }

      if (a === 'read') {
        const candidates = step.candidates ?? (step.selector ? [step.selector] : []);
        let text: string | null = null;
        let foundSel: string | null = null;
        for (const sel of candidates) {
          const el = this.doc.querySelector(sel);
          if (el) { text = el.textContent?.trim() ?? null; foundSel = sel; break; }
        }
        text = text ?? null;
        if (step.store_as) this.buffer[step.store_as] = text;
        return { stepId: step.stepId, action: a, status: 'ok', text, selector: foundSel, durationMs: Date.now() - t0 };
      }

      if (a === 'assert') {
        const sel = this.I(step.selector);
        const expected = this.I(step.value);
        const el = this.doc.querySelector(sel);
        const actual = el?.textContent?.trim();
        if (!actual?.includes(expected)) throw new Error(`Assert failed: expected "${expected}" in "${actual}"`);
        return { stepId: step.stepId, action: a, status: 'ok', value: actual, durationMs: Date.now() - t0 };
      }

      if (a === 'js') {
        // eslint-disable-next-line no-eval
        const result = eval(this.I(step.code));
        if (step.store_as) this.buffer[step.store_as] = result;
        return { stepId: step.stepId, action: a, status: 'ok', result, durationMs: Date.now() - t0 };
      }

      if (a === 'wait_for') {
        const sel = this.I(step.selector ?? step.target ?? '');
        const el = this.doc.querySelector(sel);
        if (!el) throw new Error('wait_for: element not found: ' + sel);
        return { stepId: step.stepId, action: a, status: 'ok', selector: sel, durationMs: Date.now() - t0 };
      }

      if (a === 'hover') {
        const tgtDef = step.target ? (this.abstractTargets[step.target] ?? null) : null;
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve: ' + step.target);
        const res = tgtDef ? this.resolver.resolve(tgtDef) : (step.selector ? { element: this.doc.querySelector(step.selector), selector: step.selector, confidence: 0.7, resolvedVia: 'css_cascade' as const } : null);
        if (!res?.element) throw new Error('Cannot resolve: ' + (step.target ?? step.selector));
        (res.element as HTMLElement).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        (res.element as HTMLElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        return { stepId: step.stepId, action: a, status: 'ok', selector: res.selector, resolvedVia: res.resolvedVia, durationMs: Date.now() - t0 };
      }

      if (a === 'scroll') {
        const sel = this.I(step.selector ?? step.target ?? '');
        const el = sel ? this.doc.querySelector(sel) : null;
        if (el) (el as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        return { stepId: step.stepId, action: a, status: 'ok', selector: sel || null, durationMs: Date.now() - t0 };
      }

      if (a === 'select') {
        const tgtDef = step.target ? (this.abstractTargets[step.target] ?? null) : null;
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve: ' + step.target);
        const res = tgtDef ? this.resolver.resolve(tgtDef) : (step.selector ? { element: this.doc.querySelector(step.selector), selector: step.selector, confidence: 0.7, resolvedVia: 'css_cascade' as const } : null);
        if (!res?.element) throw new Error('Cannot resolve: ' + (step.target ?? step.selector));
        const el = res.element as HTMLSelectElement | HTMLInputElement;
        const value = this.I(step.value ?? '');
        if ('options' in el) {
          // <select> element — match by text or value
          const opts = Array.from((el as HTMLSelectElement).options);
          const opt = opts.find(o => o.value === value || o.text === value);
          if (opt) (el as HTMLSelectElement).value = opt.value;
        } else if (el.type === 'checkbox' || el.type === 'radio') {
          (el as HTMLInputElement).checked = value === 'true' || value === '1';
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { stepId: step.stepId, action: a, status: 'ok', value, selector: res.selector, resolvedVia: res.resolvedVia, durationMs: Date.now() - t0 };
      }

      if (a === 'click_preset') {
        // Click a button to open a picker, then click the preset option text
        const tgtDef = step.target ? (this.abstractTargets[step.target] ?? null) : null;
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve: ' + step.target);
        const res = tgtDef ? this.resolver.resolve(tgtDef) : (step.selector ? { element: this.doc.querySelector(step.selector), selector: step.selector, confidence: 0.7, resolvedVia: 'css_cascade' as const } : null);
        if (!res?.element) throw new Error('Cannot resolve: ' + (step.target ?? step.selector));
        (res.element as HTMLElement).click();
        const preset = this.I(step.preset ?? step.defaultPreset ?? 'Immediately');
        // Find the option text in any newly visible overlay/list
        const option = Array.from(this.doc.querySelectorAll('[class*="overlay"] *,[class*="menu"] *,[class*="list"] *,button'))
          .find(el => el.textContent?.trim() === preset) as HTMLElement | undefined;
        if (option) option.click();
        return { stepId: step.stepId, action: a, status: 'ok', preset, selector: res.selector, durationMs: Date.now() - t0 };
      }

      if (a === 'probe_affordances') {
        // Hover all buttons/icons in container, collect tooltip texts
        const container = step.selector ? this.doc.querySelector(step.selector) : this.doc.body;
        const btns = Array.from((container ?? this.doc.body).querySelectorAll('button,[role="button"],[class*="icon"]'));
        const affordances = btns.map(btn => {
          (btn as HTMLElement).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          return {
            text: (btn as HTMLElement).textContent?.trim() || null,
            ariaLabel: btn.getAttribute('aria-label'),
            title: btn.getAttribute('title'),
          };
        }).filter(a => a.text || a.ariaLabel || a.title);
        if (step.store_as) this.buffer[step.store_as] = affordances;
        return { stepId: step.stepId, action: a, status: 'ok', affordances, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

            return { stepId: step.stepId, action: a, status: 'unsupported', durationMs: Date.now() - t0 };
    } catch (err: unknown) {
      return { stepId: step.stepId, action: a, status: 'error', error: (err as Error).message, durationMs: Date.now() - t0 };
    }
  }

  getBuffer(): Record<string, unknown> { return this.buffer; }
}
