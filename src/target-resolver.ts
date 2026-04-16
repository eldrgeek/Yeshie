// Target Resolver — 6-step abstract target resolution algorithm
// Confirmed working against real YeshID Vuetify 3 DOM structure
import type { ResolutionMethod } from './runtime-contract.js';

const GENERATED_ID_RE = /^(input-v-\d+|checkbox-v-\d+|_react_|react-\d+)$/;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ResolvedTarget {
  selector: string | null;
  confidence: number;
  resolvedVia: ResolutionMethod;
  element?: Element | null;
}

export interface AbstractTarget {
  match?: { role?: string; vuetify_label?: string[]; name_contains?: string[]; [k: string]: any };
  cachedSelector?: string | null;
  cachedConfidence?: number;
  anchors?: {
    ariaLabel?: string;
    placeholder?: string;
    name?: string;
    dataTestId?: string;
    id?: string;
    text?: string;
    labelText?: string;
  };
  resolvedOn?: string | null;
  semanticKeys?: string[];
  resolutionStrategy?: string;
  fallbackSelectors?: string[];
  data_se?: string;
  candidates?: string[];
}

export class TargetResolver {
  constructor(private doc: Document) {}

  private stableSelector(el: Element): string | null {
    const tag = el.tagName.toLowerCase();
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
    const placeholder = (el as HTMLInputElement).placeholder;
    if (placeholder) return `${tag}[placeholder="${placeholder}"]`;
    const name = el.getAttribute('name');
    if (name) return `${tag}[name="${name}"]`;
    const testid = el.getAttribute('data-testid');
    if (testid) return `[data-testid="${testid}"]`;
    if ((el as HTMLElement).id && !GENERATED_ID_RE.test((el as HTMLElement).id)) return '#' + (el as HTMLElement).id;
    return null;
  }

  private tryAnchorSelector(selector: string | null): Element | null {
    if (!selector) return null;
    return this.doc.querySelector(selector);
  }

  private resolveFromAnchors(target: AbstractTarget): ResolvedTarget | null {
    const anchors = target.anchors;
    if (!anchors) return null;

    const anchorSelectors = [
      anchors.ariaLabel ? `[aria-label="${anchors.ariaLabel}"]` : null,
      anchors.placeholder ? `input[placeholder="${anchors.placeholder}"], textarea[placeholder="${anchors.placeholder}"]` : null,
      anchors.name ? `input[name="${anchors.name}"], textarea[name="${anchors.name}"], select[name="${anchors.name}"]` : null,
      anchors.dataTestId ? `[data-testid="${anchors.dataTestId}"]` : null,
      anchors.id && !GENERATED_ID_RE.test(anchors.id) ? `#${anchors.id}` : null,
    ];

    for (const selector of anchorSelectors) {
      const el = this.tryAnchorSelector(selector);
      if (el) {
        return {
          selector: this.stableSelector(el) || selector,
          confidence: 0.89,
          resolvedVia: 'auto_heal',
          element: el,
        };
      }
    }

    if (anchors.labelText) {
      const el = this.findInputByLabelText(anchors.labelText);
      if (el) {
        return {
          selector: this.stableSelector(el),
          confidence: 0.87,
          resolvedVia: 'auto_heal',
          element: el,
        };
      }
    }

    if (anchors.text) {
      const clickables = Array.from(this.doc.querySelectorAll('a[href], a, button, [role="button"], [role="menuitem"], [role="option"]'));
      const lowered = anchors.text.toLowerCase();
      const el = clickables.find((candidate) =>
        candidate.textContent?.trim().toLowerCase().includes(lowered) ||
        candidate.getAttribute('aria-label')?.toLowerCase().includes(lowered)
      ) || null;
      if (el) {
        return {
          selector: this.stableSelector(el),
          confidence: 0.86,
          resolvedVia: 'auto_heal',
          element: el,
        };
      }
    }

    return null;
  }

  // ── Step 1 cache validity ─────────────────────────────────────────────────
  private isCacheValid(target: AbstractTarget): boolean {
    if (!target.cachedSelector) return false;
    if ((target.cachedConfidence ?? 0) < 0.85) return false;
    if (!target.resolvedOn) return false;
    const age = Date.now() - new Date(target.resolvedOn).getTime();
    return age < CACHE_MAX_AGE_MS;
  }

  // ── findInputByLabelText — three strategies ───────────────────────────────
  findInputByLabelText(labelText: string): Element | null {
    const lower = labelText.toLowerCase();

    // Strategy A: classic Vuetify — .v-label inside .v-input
    for (const label of this.doc.querySelectorAll('.v-label')) {
      if (label.textContent?.trim().toLowerCase().includes(lower)) {
        const inp = label.closest('.v-input')?.querySelector('input, textarea');
        if (inp) return inp;
      }
    }

    // Strategy B: YeshID variant — div.mb-2 or span.text-body-2 sibling above .v-input
    for (const div of this.doc.querySelectorAll('.mb-2, .text-body-2')) {
      if (div.textContent?.trim().toLowerCase().includes(lower) && !div.querySelector('input')) {
        // Walk next siblings for an input
        let sib = div.nextElementSibling;
        while (sib) {
          const inp = sib.querySelector('input, textarea');
          if (inp) return inp;
          sib = sib.nextElementSibling;
        }
        // Try parent's next sibling
        const inp = div.parentElement?.nextElementSibling?.querySelector('input, textarea');
        if (inp) return inp;
        // Try grandparent's next sibling (handles nested wrappers)
        const inp2 = div.parentElement?.parentElement?.nextElementSibling?.querySelector('input, textarea');
        if (inp2) return inp2;
      }
    }

    // Strategy C: aria-label or placeholder attribute
    const byAttr = this.doc.querySelector(
      `input[aria-label*="${labelText}" i], textarea[aria-label*="${labelText}" i], input[placeholder*="${labelText}" i]`
    );
    return byAttr;
  }

  // ── Main resolution ───────────────────────────────────────────────────────
  resolve(target: AbstractTarget): ResolvedTarget {
    // Step 0: data_se attribute resolution — stable semantic ID, also checks shadow DOM
    if (target.data_se) {
      const el = querySelectorDeep(`[data-se="${target.data_se}"]`, this.doc);
      if (el) {
        return {
          selector: `[data-se="${target.data_se}"]`,
          confidence: 0.92,
          resolvedVia: 'data_se',
          element: el,
        };
      }
    }

    // Step 1: cached selector
    if (this.isCacheValid(target)) {
      const el = this.doc.querySelector(target.cachedSelector!);
      if (el) {
        return { selector: target.cachedSelector!, confidence: target.cachedConfidence!, resolvedVia: 'cached', element: el };
      }
    }

    const healed = this.resolveFromAnchors(target);
    if (healed) return healed;

    const labels = target.match?.vuetify_label || target.semanticKeys || [];
    const names = target.match?.name_contains || [];
    const keys = [...new Set([...labels, ...names])];

    // Step 2: A11y-first resolution (light DOM then shadow DOM via querySelectorDeep)
    for (const key of keys) {
      const byAria = querySelectorDeep(`[aria-label*="${key}" i]`, this.doc);
      if (byAria) {
        return {
          selector: this.stableSelector(byAria) || `[aria-label*="${key}" i]`,
          confidence: 0.92,
          resolvedVia: 'a11y_aria_label',
          element: byAria,
        };
      }

      for (const label of Array.from(this.doc.querySelectorAll('label[for]'))) {
        if (label.textContent?.toLowerCase().includes(key.toLowerCase())) {
          const targetEl = this.doc.getElementById((label as HTMLLabelElement).htmlFor);
          if (targetEl) {
            return {
              selector: this.stableSelector(targetEl) || `#${(label as HTMLLabelElement).htmlFor}`,
              confidence: 0.9,
              resolvedVia: 'a11y_label_for',
              element: targetEl,
            };
          }
        }
      }

      const byPlaceholder = querySelectorDeep(`[placeholder*="${key}" i]`, this.doc);
      if (byPlaceholder) {
        return {
          selector: this.stableSelector(byPlaceholder) || `[placeholder*="${key}" i]`,
          confidence: 0.88,
          resolvedVia: 'a11y_placeholder',
          element: byPlaceholder,
        };
      }
    }

    // Step 3: vuetify_label_match
    for (const labelText of labels) {
      const el = this.findInputByLabelText(labelText);
      if (el) {
        const selector = this.stableSelector(el);
        // Even with generated IDs we still return the element — selector may be null
        return { selector, confidence: 0.88, resolvedVia: 'vuetify_label_match', element: el };
      }
    }

    // Step 4: text/role matching for clickable targets (light DOM + shadow DOM)
    if (names.length) {
      for (const name of names) {
        const clickables = querySelectorAllDeep(
          'a[href], a, button, [role="button"], [role="menuitem"], [role="option"]',
          this.doc
        );
        const btn = clickables.find(b =>
          b.textContent?.trim().toLowerCase().includes(name.toLowerCase()) ||
          b.getAttribute('aria-label')?.toLowerCase().includes(name.toLowerCase())
        ) as Element | undefined;
        if (btn) {
          return { selector: this.stableSelector(btn), confidence: 0.85, resolvedVia: 'text_match', element: btn };
        }
      }
    }

    // Step 5: contenteditable
    const ce = this.doc.querySelector('[contenteditable="true"]');
    if (ce) {
      const id = (ce as HTMLElement).id;
      return { selector: id ? `#${id}` : null, confidence: 0.6, resolvedVia: 'contenteditable', element: ce };
    }

    // Step 6: css cascade — fallback selectors, skipping generated IDs
    for (const sel of (target.fallbackSelectors || [])) {
      // Skip selectors that target only generated IDs
      if (GENERATED_ID_RE.test(sel.replace('#', ''))) continue;
      const el = this.doc.querySelector(sel);
      if (el) {
        return { selector: sel, confidence: 0.6, resolvedVia: 'css_cascade', element: el };
      }
    }

    // Step 7: escalate
    return { selector: null, confidence: 0, resolvedVia: 'escalate', element: null };
  }
}

// ── Shadow DOM traversal utilities ──────────────────────────────────────────

/**
 * Recursively query all elements matching `selector` across light DOM and open shadow roots.
 */
export function querySelectorAllDeep(selector: string, root: Document | Element = document): Element[] {
  const results: Element[] = [];
  const rootNode = root instanceof Document ? root.documentElement : root;

  function traverse(node: Element) {
    try {
      const found = node.querySelectorAll(selector);
      results.push(...Array.from(found));
    } catch {}
    for (const child of Array.from(node.children)) {
      if (child.shadowRoot) {
        traverse(child.shadowRoot as unknown as Element);
      }
    }
  }

  try {
    const topLevel = (root instanceof Document ? root : root).querySelectorAll(selector);
    results.push(...Array.from(topLevel));
  } catch {}

  // Also traverse shadow roots
  const allElements = (root instanceof Document ? root.documentElement : root).querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      const inner = el.shadowRoot.querySelectorAll(selector);
      results.push(...Array.from(inner));
      // Recurse into nested shadow roots
      for (const innerEl of Array.from(el.shadowRoot.querySelectorAll('*'))) {
        if ((innerEl as Element).shadowRoot) {
          results.push(...Array.from((innerEl as Element).shadowRoot!.querySelectorAll(selector)));
        }
      }
    }
  }

  // Deduplicate
  return Array.from(new Set(results));
}

/**
 * Return the first element matching `selector` across light DOM and open shadow roots.
 */
export function querySelectorDeep(selector: string, root: Document | Element = document): Element | null {
  const results = querySelectorAllDeep(selector, root);
  return results[0] ?? null;
}
