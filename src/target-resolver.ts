// Target Resolver — 6-step abstract target resolution algorithm
// Confirmed working against real YeshID Vuetify 3 DOM structure

const GENERATED_ID_RE = /^(input-v-\d+|checkbox-v-\d+|_react_|react-\d+)$/;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ResolvedTarget {
  selector: string | null;
  confidence: number;
  resolvedVia: 'cached' | 'aria' | 'vuetify_label_match' | 'contenteditable' | 'css_cascade' | 'escalate';
  element?: Element | null;
}

export interface AbstractTarget {
  match?: { role?: string; vuetify_label?: string[]; name_contains?: string[]; [k: string]: any };
  cachedSelector?: string | null;
  cachedConfidence?: number;
  resolvedOn?: string | null;
  semanticKeys?: string[];
  resolutionStrategy?: string;
  fallbackSelectors?: string[];
  candidates?: string[];
}

export class TargetResolver {
  constructor(private doc: Document) {}

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
    // Step 1: cached selector
    if (this.isCacheValid(target)) {
      const el = this.doc.querySelector(target.cachedSelector!);
      if (el) {
        return { selector: target.cachedSelector!, confidence: target.cachedConfidence!, resolvedVia: 'cached', element: el };
      }
    }

    // Step 2: ARIA — role + name_contains for buttons/roles
    if (target.match?.name_contains) {
      for (const name of target.match.name_contains) {
        const buttons = Array.from(this.doc.querySelectorAll('button, [role="button"]'));
        const btn = buttons.find(b =>
          b.textContent?.trim().toLowerCase().includes(name.toLowerCase()) ||
          b.getAttribute('aria-label')?.toLowerCase().includes(name.toLowerCase())
        ) as Element | undefined;
        if (btn) {
          const id = btn.id && !GENERATED_ID_RE.test(btn.id) ? `#${btn.id}` : null;
          return { selector: id, confidence: 0.85, resolvedVia: 'aria', element: btn };
        }
      }
    }

    // Step 3: vuetify_label_match
    const labels = target.match?.vuetify_label || target.semanticKeys || [];
    for (const labelText of labels) {
      const el = this.findInputByLabelText(labelText);
      if (el) {
        const id = (el as HTMLElement).id;
        const selector = id && !GENERATED_ID_RE.test(id) ? `#${id}` : null;
        // Even with generated IDs we still return the element — selector may be null
        return { selector, confidence: 0.88, resolvedVia: 'vuetify_label_match', element: el };
      }
    }

    // Step 4: contenteditable
    const ce = this.doc.querySelector('[contenteditable="true"]');
    if (ce) {
      const id = (ce as HTMLElement).id;
      return { selector: id ? `#${id}` : null, confidence: 0.6, resolvedVia: 'contenteditable', element: ce };
    }

    // Step 5: css cascade — fallback selectors, skipping generated IDs
    for (const sel of (target.fallbackSelectors || [])) {
      // Skip selectors that target only generated IDs
      if (GENERATED_ID_RE.test(sel.replace('#', ''))) continue;
      const el = this.doc.querySelector(sel);
      if (el) {
        return { selector: sel, confidence: 0.6, resolvedVia: 'css_cascade', element: el };
      }
    }

    // Step 6: escalate
    return { selector: null, confidence: 0, resolvedVia: 'escalate', element: null };
  }
}
