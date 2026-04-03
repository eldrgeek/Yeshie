// Step Executor — executes individual payload chain steps
// Runs in-page via executor-inject.js (browser context)
// This file is the canonical reference; executor-inject.js mirrors it

export type StepAction =
  | 'assess_state' | 'navigate' | 'type' | 'click' | 'click_preset'
  | 'wait_for' | 'read' | 'hover' | 'scroll' | 'assert' | 'js' | 'select'
  | 'probe_affordances' | 'delay' | 'perceive' | 'find_row' | 'click_text';

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
  surpriseEvidence?: import('./runtime-contract.js').SurpriseEvidence[];
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
import { createSurpriseEvidence } from './runtime-contract.js';

export interface Step {
  stepId: string;
  action: string;
  url?: string;
  target?: string;
  selector?: string;
  value?: string;
  text?: string;
  identifier?: string;
  condition?: string;
  url_pattern?: string;
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
        if (sig.type === 'url_matches') {
          return new RegExp(sig.pattern!).test(window.location.href);
        }
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

  private snapshotPage() {
    return {
      url: window.location.href,
      title: this.doc.title,
      headings: Array.from(this.doc.querySelectorAll('h1, h2, h3, [role="heading"]'))
        .map(el => ({ level: el.tagName, text: el.textContent?.trim() || '' }))
        .filter(h => h.text),
      buttons: Array.from(this.doc.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="option"]'))
        .map(el => ({ text: el.textContent?.trim() || '', ariaLabel: el.getAttribute('aria-label') }))
        .filter(b => b.text || b.ariaLabel),
      fields: Array.from(this.doc.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || null,
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
        })),
      tables: Array.from(this.doc.querySelectorAll('table'))
        .map(table => ({
          headers: Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.trim() || ''),
          rowCount: table.querySelectorAll('tbody tr').length,
          rows: Array.from(table.querySelectorAll('tbody tr')).map(tr => tr.textContent?.trim() || '').filter(Boolean),
        })),
      mainActions: Array.from(this.doc.querySelectorAll('main a, [role="main"] a'))
        .map(el => ({ text: el.textContent?.trim() || '', href: el.getAttribute('href') }))
        .filter(a => a.text),
    };
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
        if (candidates.length === 0) {
          const snapshot = this.snapshotPage();
          if (step.store_as) this.buffer[step.store_as] = snapshot;
          return { stepId: step.stepId, action: a, status: 'ok', text: JSON.stringify(snapshot), durationMs: Date.now() - t0 };
        }
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
        if (step.url_pattern) {
          const pattern = this.I(step.url_pattern);
          if (!new RegExp(pattern).test(window.location.href)) throw new Error('wait_for url timeout: ' + pattern);
          return { stepId: step.stepId, action: a, status: 'ok', url: window.location.href, durationMs: Date.now() - t0 };
        }
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

      if (a === 'delay') {
        return { stepId: step.stepId, action: a, status: 'ok', durationMs: Date.now() - t0 };
      }

      if (a === 'perceive') {
        const snapshot = this.snapshotPage();
        if (step.store_as) this.buffer[step.store_as] = snapshot;
        return { stepId: step.stepId, action: a, status: 'ok', result: snapshot, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      if (a === 'find_row') {
        const identifier = this.I(step.identifier ?? step.value ?? '');
        const rows = Array.from(this.doc.querySelectorAll('.v-data-table__tr, tbody tr, [role="row"]'));
        const match = rows.find(row => row.textContent?.toLowerCase().includes(identifier.toLowerCase()));
        if (!match) throw new Error('Row not found: ' + identifier);
        const link = match.querySelector('a[href], a') as HTMLElement | null;
        const clickTarget = link ?? match as HTMLElement;
        clickTarget.click?.();
        if (step.store_as) {
          this.buffer[step.store_as] = {
            found: true,
            text: match.textContent?.trim() || '',
            href: link?.getAttribute('href') || null,
          };
        }
        return { stepId: step.stepId, action: a, status: 'ok', result: { found: true }, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      if (a === 'click_text') {
        const text = this.I(step.text ?? step.value ?? '');
        const candidates = Array.from(this.doc.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="option"], .v-list-item'));
        const match = candidates.find(el => {
          const content = el.textContent?.trim().toLowerCase() || '';
          return content === text.toLowerCase() || content.includes(text.toLowerCase());
        }) as HTMLElement | undefined;
        if (!match) throw new Error('Text not found: ' + text);
        match.click();
        return { stepId: step.stepId, action: a, status: 'ok', value: text, durationMs: Date.now() - t0 };
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
      const message = (err as Error).message;
      let surpriseEvidence;
      if (message.includes('Cannot resolve') || message.includes('Text not found') || message.includes('Row not found')) {
        surpriseEvidence = [createSurpriseEvidence('target_not_found', {
          stepId: step.stepId,
          target: step.target ?? step.selector ?? step.text ?? step.identifier,
          details: message,
        })];
      } else if (message.includes('wait_for url timeout')) {
        surpriseEvidence = [createSurpriseEvidence('url_mismatch', {
          stepId: step.stepId,
          expected: this.I(step.url_pattern),
          observed: window.location.href,
          details: message,
        })];
      } else if (message.includes('wait_for: element not found')) {
        surpriseEvidence = [createSurpriseEvidence('guard_timeout', {
          stepId: step.stepId,
          target: step.selector ?? step.target,
          details: message,
        })];
      }
      return { stepId: step.stepId, action: a, status: 'error', error: message, surpriseEvidence, durationMs: Date.now() - t0 };
    }
  }

  getBuffer(): Record<string, unknown> { return this.buffer; }
}
