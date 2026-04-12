// Step Executor — executes individual payload chain steps
// Runs in-page via executor-inject.js (browser context)
// This file is the canonical reference; executor-inject.js mirrors it

export type StepAction =
  | 'assess_state' | 'navigate' | 'open_tab' | 'type' | 'click' | 'click_preset'
  | 'wait_for' | 'read' | 'hover' | 'scroll' | 'assert' | 'js' | 'select'
  | 'probe_affordances' | 'delay' | 'perceive' | 'find_row' | 'click_text'
  | 'capture_entities' | 'navigate_to_entity' | 'survey_page';

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
  failureSignature?: ResponseSignatureResult;
  responseSignature?: ResponseSignatureResult;
  outcome?: 'success' | 'failure' | 'ambiguous';
  storedAs?: string;
  reason?: string;
  error?: string;
  surpriseEvidence?: import('./runtime-contract.js').SurpriseEvidence[];
}

export interface ResponseSignatureResult {
  matched: boolean;
  type?: string;
  attribute?: string;
  value?: string | null;
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
  type: 'url_matches' | 'url_not_matches' | 'element_visible' | 'element_absent' | 'element_text' | 'attribute_change' | 'attr_change';
  selector?: string;
  pattern?: string;
  text?: string;
  attribute?: string;
  value?: string;
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
  entity?: string;
  entity_map?: string;
  urlTemplate?: string;
  urlSchemaKey?: string;
  condition?: string;
  url_pattern?: string;
  expect?: { state?: string };
  state?: {
    visible?: boolean;
    enabled?: boolean;
    attribute?: Record<string, unknown>;
    name?: string;
    stateGraph?: StateGraph;
  };
  stateGraph?: StateGraph;
  responseSignature?: ResponseSignature[];
  failureSignature?: ResponseSignature[];
  candidates?: string[];
  store_as?: string;
  code?: string;
  [key: string]: unknown;
}

export interface ResponseSignature {
  type: string;
  state?: string;
  selector?: string;
  text?: string;
  pattern?: string;
  attribute?: string;
  value?: string;
  any_of?: ResponseSignature[];
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

  private captureEntities(step: Step) {
    const rowSelector = String(step.rowSelector ?? '.v-data-table__tr, tbody tr, [role="row"]');
    const linkSelector = String(step.linkSelector ?? 'a[href], a');
    const rows = Array.from(this.doc.querySelectorAll(rowSelector));
    const entities: Record<string, { id: string | null; href: string | null; text: string }> = {};

    for (const row of rows) {
      const link = row.querySelector(linkSelector) as HTMLAnchorElement | null;
      const text = link?.textContent?.trim() || row.querySelector('td, th, [role="cell"]')?.textContent?.trim() || '';
      if (!text) continue;
      const href = link?.getAttribute('href') || null;
      const id =
        href
          ? (step.idPattern
            ? (href.match(new RegExp(String(step.idPattern)))?.[1] ?? null)
            : (href.match(/\/([A-Za-z0-9-]+)(?:\/details)?\/?$/)?.[1] ?? null))
          : null;
      entities[text] = { id, href, text };
    }

    return entities;
  }

  private resolveEntityNavigation(step: Step) {
    const identifier = this.I(step.identifier ?? step.value ?? '');
    const entityMapName = String(step.entity_map ?? 'entities');
    const entityMap = this.buffer[entityMapName] as Record<string, { id?: string | null; href?: string | null; text?: string }> | undefined;
    const entry = entityMap
      ? Object.entries(entityMap).find(([key]) => key.toLowerCase() === identifier.toLowerCase())?.[1]
      : undefined;

    if (!entry) {
      throw new Error(`Entity not found: ${identifier} in ${entityMapName}`);
    }

    const schema = (step.urlSchema as Record<string, any> | undefined)?.[String(step.urlSchemaKey ?? step.entity ?? '')]
      || (step.urlSchema as Record<string, any> | undefined)?.[String(step.urlSchemaKey ?? '')]
      || null;
    const urlTemplate = String(step.urlTemplate ?? schema?.template ?? '');

    if (urlTemplate) {
      const entityId = entry.id ?? null;
      if (entityId) {
        const url = urlTemplate.replace(/\{(?:entityId|id|uuid)\}/g, entityId);
        return { identifier, entityId, url, strategy: 'direct' };
      }
    }

    if (entry.href) {
      return { identifier, entityId: entry.id ?? null, url: entry.href, strategy: 'href' };
    }

    const rows = Array.from(this.doc.querySelectorAll('.v-data-table__tr, tbody tr, [role="row"]'));
    const match = rows.find((row) => row.textContent?.toLowerCase().includes(identifier.toLowerCase()));
    if (!match) throw new Error(`Entity href missing for ${identifier}`);
    const link = match.querySelector('a[href], a') as HTMLAnchorElement | null;
    const fallbackUrl = link?.getAttribute('href') || null;
    if (!fallbackUrl) throw new Error(`Entity href missing for ${identifier}`);
    return { identifier, entityId: entry.id ?? null, url: fallbackUrl, strategy: 'row_click_fallback' };
  }

  private captureSignatureBaseline(signatures: ResponseSignature[] = []) {
    const baseline: Record<string, string | null> = {};
    for (const sig of this.expandSignatures(signatures)) {
      if ((sig.type === 'attribute_change' || sig.type === 'attr_change') && sig.selector && sig.attribute) {
        const el = this.doc.querySelector(sig.selector);
        baseline[`${sig.selector}::${sig.attribute}`] = el?.getAttribute(sig.attribute) ?? null;
      }
    }
    return baseline;
  }

  private expandSignatures(signatures: ResponseSignature[] = []): ResponseSignature[] {
    const expanded: ResponseSignature[] = [];
    for (const sig of signatures) {
      if (!sig) continue;
      if (Array.isArray(sig.any_of) && sig.any_of.length > 0) {
        expanded.push(...this.expandSignatures(sig.any_of));
      } else {
        expanded.push(sig);
      }
    }
    return expanded;
  }

  private evaluateSignatures(
    signatures: ResponseSignature[] = [],
    initialUrl = window.location.href,
    baseline: Record<string, string | null> = {},
    stateGraph?: StateGraph
  ): ResponseSignatureResult {
    const expanded = this.expandSignatures(signatures);
    for (const sig of expanded) {
      if (sig.type === 'url_change' && window.location.href !== initialUrl) {
        return { matched: true, type: sig.type, url: window.location.href };
      }

      if (sig.type === 'url_matches' && sig.pattern && new RegExp(sig.pattern).test(window.location.href)) {
        return { matched: true, type: sig.type, url: window.location.href };
      }

      if (sig.type === 'url_not_matches' && sig.pattern && !new RegExp(sig.pattern).test(window.location.href)) {
        return { matched: true, type: sig.type, url: window.location.href };
      }

      if (sig.type === 'element_absent' && sig.selector && !this.doc.querySelector(sig.selector)) {
        return { matched: true, type: sig.type, selector: sig.selector };
      }

      if (sig.type === 'element_visible' && sig.selector) {
        const el = this.doc.querySelector(sig.selector);
        if (el) {
          return {
            matched: true,
            type: sig.type,
            selector: sig.selector,
            text: el.textContent?.trim() || undefined,
          };
        }
      }

      if (sig.type === 'element_text' && sig.selector && sig.text) {
        const el = this.doc.querySelector(sig.selector);
        const text = el?.textContent?.trim() || '';
        if (text.includes(sig.text)) {
          return { matched: true, type: sig.type, selector: sig.selector, text };
        }
      }

      if (sig.type === 'state_reached' && sig.state && stateGraph?.nodes) {
        const state = this.assessState(stateGraph);
        if (state === sig.state) {
          return { matched: true, type: sig.type, text: state };
        }
      }

      if ((sig.type === 'attribute_change' || sig.type === 'attr_change') && sig.selector && sig.attribute) {
        const el = this.doc.querySelector(sig.selector);
        if (!el) continue;
        const value = el.getAttribute(sig.attribute);
        const prev = baseline[`${sig.selector}::${sig.attribute}`] ?? null;
        const matches =
          sig.value !== undefined ? value === sig.value
          : sig.pattern ? new RegExp(sig.pattern).test(value ?? '')
          : value !== prev;
        if (matches) {
          return {
            matched: true,
            type: sig.type,
            selector: sig.selector,
            attribute: sig.attribute,
            value,
          };
        }
      }
    }

    const snackbar = this.doc.querySelector('.v-snackbar__content');
    const alert = this.doc.querySelector('.v-alert');
    return {
      matched: false,
      timeout: true,
      snackbarText: snackbar?.textContent?.trim() || undefined,
      alertText: alert?.textContent?.trim() || undefined,
      urlNow: window.location.href,
    };
  }

  private assessState(sg: StateGraph): string {
    if (!sg?.nodes) return 'unknown';
    for (const [name, node] of Object.entries(sg.nodes)) {
      if (!node.signals?.length) continue;
      const ok = node.signals.every(sig => this.matchesStateSignal(sig));
      if (ok) return name;
    }
    return 'unknown';
  }

  private matchesStateSignal(sig: StateSignal): boolean {
    if (sig.type === 'url_matches') {
      return !!sig.pattern && new RegExp(sig.pattern).test(window.location.href);
    }
    if (sig.type === 'url_not_matches') {
      return !!sig.pattern && !new RegExp(sig.pattern).test(window.location.href);
    }
    if (sig.type === 'element_visible') {
      const el = sig.selector ? this.doc.querySelector(sig.selector) : null;
      return !!el;
    }
    if (sig.type === 'element_absent') {
      return sig.selector ? !this.doc.querySelector(sig.selector) : false;
    }
    if (sig.type === 'element_text') {
      const el = sig.selector ? this.doc.querySelector(sig.selector) : null;
      return el?.textContent?.includes(sig.text!) ?? false;
    }
    if ((sig.type === 'attribute_change' || sig.type === 'attr_change') && sig.selector && sig.attribute) {
      const el = this.doc.querySelector(sig.selector);
      return !!el && el.getAttribute(sig.attribute) === (sig.value ?? null);
    }
    return false;
  }

  private matchesWaitState(step: Step): boolean {
    if (step.url_pattern) {
      const pattern = this.I(step.url_pattern);
      return new RegExp(pattern).test(window.location.href);
    }

    if (step.state?.stateGraph?.nodes || step.stateGraph?.nodes) {
      const graph = (step.state?.stateGraph || step.stateGraph) as StateGraph;
      const expectedState = step.state?.name || step.expect?.state;
      if (!expectedState) return this.assessState(graph) !== 'unknown';
      return this.assessState(graph) === expectedState;
    }

    let sel: string | null = step.selector || null;
    if (!sel && typeof step.target === 'string' && step.target.startsWith('#')) sel = step.target;
    if (!sel && typeof step.target === 'string' && (step.target.includes('.') || step.target.includes('['))) sel = step.target as string;
    const el = sel ? this.doc.querySelector(sel) as HTMLElement | null : null;

    if (step.state) {
      if (step.state.visible !== undefined) return step.state.visible ? !!el : !el;
      if (step.state.enabled !== undefined) {
        const enabled = !!el && !(el as HTMLInputElement | HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
        return step.state.enabled ? enabled : !enabled;
      }
      if (step.state.attribute && sel) {
        return Object.entries(step.state.attribute).every(([key, expected]) => el?.getAttribute(key) === String(expected));
      }
    }

    return !!el;
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

      if (a === 'capture_entities') {
        const entities = this.captureEntities(step);
        if (step.store_as) this.buffer[step.store_as] = entities;
        return { stepId: step.stepId, action: a, status: 'ok', result: entities, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      if (a === 'navigate_to_entity') {
        const resolved = this.resolveEntityNavigation(step);
        return {
          stepId: step.stepId,
          action: a,
          status: 'ok',
          url: resolved.url,
          value: resolved.url,
          result: resolved,
          durationMs: Date.now() - t0,
        };
      }

      if (a === 'type') {
        const value = this.I(step.value);
        const initialUrl = window.location.href;
        const failureBaseline = this.captureSignatureBaseline(step.failureSignature);
        const responseBaseline = this.captureSignatureBaseline(step.responseSignature);
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve target: ' + step.target);
        const res = step.target
          ? this.resolver.resolve(this.abstractTargets[step.target!] ?? {})
          : (step.selector ? { element: this.doc.querySelector(step.selector), selector: step.selector, confidence: 0.7, resolvedVia: 'css_cascade' as const } : null);
        if (!res || res.resolvedVia === 'escalate') throw new Error('Cannot resolve target: ' + (step.target ?? step.selector));
        // In jsdom: set value directly
        if (res.element && 'value' in res.element) {
          (res.element as HTMLInputElement).value = value;
        }
        const failureSignature = step.failureSignature ? this.evaluateSignatures(step.failureSignature, initialUrl, failureBaseline, stateGraph) : undefined;
        const responseSignature = step.responseSignature ? this.evaluateSignatures(step.responseSignature, initialUrl, responseBaseline, stateGraph) : undefined;
        const outcome =
          failureSignature?.matched ? 'failure'
          : responseSignature?.matched ? 'success'
          : step.failureSignature || step.responseSignature ? 'ambiguous'
          : undefined;
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, value, selector: res.selector, confidence: res.confidence, resolvedVia: res.resolvedVia, responseSignature, failureSignature, outcome, durationMs: Date.now() - t0 };
      }

      if (a === 'click') {
        const initialUrl = window.location.href;
        const failureBaseline = this.captureSignatureBaseline(step.failureSignature);
        const responseBaseline = this.captureSignatureBaseline(step.responseSignature);
        if (step.target && !this.abstractTargets[step.target]) throw new Error('Cannot resolve target: ' + step.target);
        const tgtDef = step.target ? (this.abstractTargets[step.target] ?? {}) : {};
        const res = step.target ? this.resolver.resolve(tgtDef) : (step.selector ? { element: this.doc.querySelector(step.selector), selector: step.selector, confidence: 0.7, resolvedVia: 'css_cascade' as const } : null);
        if (!res || res.resolvedVia === 'escalate') throw new Error('Cannot resolve target: ' + (step.target ?? step.selector));
        if (res.element) (res.element as HTMLElement).click?.();
        const failureSignature = step.failureSignature ? this.evaluateSignatures(step.failureSignature, initialUrl, failureBaseline, stateGraph) : undefined;
        const responseSignature = step.responseSignature ? this.evaluateSignatures(step.responseSignature, initialUrl, responseBaseline, stateGraph) : undefined;
        const outcome =
          failureSignature?.matched ? 'failure'
          : responseSignature?.matched ? 'success'
          : step.failureSignature || step.responseSignature ? 'ambiguous'
          : undefined;
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, selector: res.selector, confidence: res.confidence, resolvedVia: res.resolvedVia, responseSignature, failureSignature, outcome, durationMs: Date.now() - t0 };
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
        if (!this.matchesWaitState(step)) {
          if (step.url_pattern) throw new Error('wait_for url timeout: ' + this.I(step.url_pattern));
          throw new Error('wait_for timeout: ' + this.I(step.selector ?? step.target ?? '[state]'));
        }
        return {
          stepId: step.stepId,
          action: a,
          status: 'ok',
          selector: step.selector ?? null,
          url: step.url_pattern ? window.location.href : undefined,
          durationMs: Date.now() - t0,
        };
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

      if (a === 'survey_page') {
        // Structural read-only survey — jsdom version for unit testing.
        // The browser version runs PRE_SURVEY_PAGE via chrome.scripting.executeScript.
        const survey = {
          url: window.location.href,
          title: this.doc.title,
          heading: this.doc.querySelector('h1')?.textContent?.trim() || null,
          ready_state: 'complete',
          framework_hints: [] as string[],
          navigation: {
            sidebar: [] as Array<{ text: string; href: string; active: boolean }>,
            topnav: [] as Array<{ text: string; href: string; active: boolean }>,
            breadcrumbs: [] as Array<{ text: string; href: string }>,
            expandable: [] as Array<{ text: string; expanded: boolean }>,
          },
          interactive: {
            buttons: Array.from(this.doc.querySelectorAll('button,[role="button"]'))
              .slice(0, 100)
              .map(b => ({
                text: (b as HTMLElement).textContent?.trim() || '',
                aria_label: b.getAttribute('aria-label') || null,
                selector: b.id ? '#' + b.id : b.tagName.toLowerCase(),
              }))
              .filter(b => b.text || b.aria_label),
            links: Array.from(this.doc.querySelectorAll('a[href]'))
              .slice(0, 100)
              .map(a => ({
                text: (a as HTMLElement).textContent?.trim() || '',
                href: a.getAttribute('href') || '',
                selector: a.id ? '#' + a.id : 'a',
              }))
              .filter(l => l.text),
            inputs: Array.from(this.doc.querySelectorAll('input:not([type="hidden"]),textarea,select'))
              .slice(0, 100)
              .map(inp => ({
                type: (inp as HTMLInputElement).type || inp.tagName.toLowerCase(),
                placeholder: inp.getAttribute('placeholder') || null,
                name: inp.getAttribute('name') || null,
                aria_label: inp.getAttribute('aria-label') || null,
                label: null as string | null,
                selector: inp.id ? '#' + inp.id : inp.tagName.toLowerCase(),
              })),
            selects: [] as Array<{ name: string | null; label: string | null; options: Array<{ value: string; text: string }> | null; option_count: number; selector: string }>,
            tables: Array.from(this.doc.querySelectorAll('table'))
              .slice(0, 10)
              .map(t => ({
                headers: Array.from(t.querySelectorAll('thead th')).map(th => th.textContent?.trim() || ''),
                row_count: t.querySelectorAll('tbody tr').length,
              })),
            forms: Array.from(this.doc.querySelectorAll('form')).map(f => ({
              action: f.getAttribute('action') || null,
              method: (f.getAttribute('method') || 'get').toLowerCase(),
              fields: Array.from(f.querySelectorAll('input:not([type="hidden"]),textarea,select')).map(inp => ({
                type: (inp as HTMLInputElement).type || inp.tagName.toLowerCase(),
                name: inp.getAttribute('name') || null,
                placeholder: inp.getAttribute('placeholder') || null,
                label: null as string | null,
              })),
            })),
          },
          auth_signals: { logged_in: false, indicators: [] as string[] },
        };
        if (step.store_as) this.buffer[step.store_as] = survey;
        return { stepId: step.stepId, action: a, status: 'ok', result: survey, storedAs: step.store_as, durationMs: Date.now() - t0 };
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
