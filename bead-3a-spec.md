# Bead 3a — Core Step Execution

## Goal
Implement `src/step-executor.ts` with action handlers for: click, type, navigate, wait_for, read, assess_state.
Write unit tests against fixture HTML. All 47 existing tests must keep passing.

## Files to create

### src/step-executor.ts

```typescript
import { TargetResolver, AbstractTarget } from './target-resolver.js';

export interface Step {
  stepId: string;
  action: string;
  target?: string;       // abstract target name
  selector?: string;     // concrete selector (bypasses resolution)
  value?: string;
  url?: string;
  condition?: string;
  store_as?: string;
  candidates?: string[];
  expect?: { state?: string };
  onMismatch?: string;
  responseSignature?: any[];
  [key: string]: any;
}

export interface StepResult {
  stepId: string;
  action: string;
  status: 'ok' | 'skipped' | 'error' | 'unsupported';
  value?: string | null;
  text?: string | null;
  state?: string;
  matched?: boolean;
  selector?: string | null;
  resolvedVia?: string;
  confidence?: number;
  error?: string;
  durationMs: number;
}

export interface StateGraph {
  nodes: Record<string, {
    signals: Array<{ type: string; selector?: string; pattern?: string; text?: string }>
  }>;
}

export class StepExecutor {
  private resolver: TargetResolver;

  constructor(
    private doc: Document,
    private abstractTargets: Record<string, AbstractTarget> = {},
    private params: Record<string, string> = {},
    private buffer: Record<string, any> = {}
  ) {
    this.resolver = new TargetResolver(doc);
  }

  // Interpolate {{param}} placeholders
  interpolate(str: string): string {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => this.params[k] ?? this.buffer[k] ?? '');
  }

  // Resolve a step's target — abstract name OR concrete selector
  resolveStepTarget(step: Step) {
    if (step.target) {
      const tgt = this.abstractTargets[step.target];
      if (!tgt) return null;
      return this.resolver.resolve(tgt);
    }
    if (step.selector) {
      const el = this.doc.querySelector(step.selector);
      if (!el) return null;
      return { selector: step.selector, confidence: 1.0, resolvedVia: 'direct' as const, element: el };
    }
    return null;
  }

  // assess_state: evaluate state graph signals against current document
  assessState(stateGraph: StateGraph): string {
    if (!stateGraph?.nodes) return 'unknown';
    for (const [name, node] of Object.entries(stateGraph.nodes)) {
      if (!node.signals?.length) continue;
      const allMatch = node.signals.every(sig => {
        if (sig.type === 'url_matches') {
          // In jsdom tests, window.location.pathname defaults to '/'
          return typeof window !== 'undefined'
            ? new RegExp(sig.pattern!).test(window.location.pathname)
            : false;
        }
        if (sig.type === 'element_visible') {
          const el = this.doc.querySelector(sig.selector!);
          return !!el; // jsdom: offsetParent always null, just check existence
        }
        if (sig.type === 'element_text') {
          const el = this.doc.querySelector(sig.selector!);
          return el?.textContent?.includes(sig.text!) ?? false;
        }
        return false;
      });
      if (allMatch) return name;
    }
    return 'unknown';
  }

  // Execute a single step — returns StepResult
  execute(step: Step, stateGraph?: StateGraph): StepResult {
    const t0 = Date.now();
    const { action, stepId } = step;

    // Condition gate
    if (step.condition) {
      const val = this.interpolate(step.condition);
      if (!val || val === 'false' || val === '0' || val === 'undefined') {
        return { stepId, action, status: 'skipped', durationMs: Date.now() - t0 };
      }
    }

    try {
      switch (action) {

        case 'assess_state': {
          if (!stateGraph) return { stepId, action, status: 'error', error: 'no stateGraph provided', durationMs: Date.now()-t0 };
          const state = this.assessState(stateGraph);
          const matched = !step.expect?.state || state === step.expect.state;
          return { stepId, action, status: 'ok', state, matched, durationMs: Date.now()-t0 };
        }

        case 'type': {
          const value = this.interpolate(step.value ?? '');
          const res = this.resolveStepTarget(step);
          if (!res?.element) throw new Error(`Cannot resolve target: ${step.target ?? step.selector}`);
          // In test env: set value directly (no CDP available)
          (res.element as HTMLInputElement).value = value;
          return { stepId, action, status: 'ok', value, selector: res.selector, resolvedVia: res.resolvedVia, confidence: res.confidence, durationMs: Date.now()-t0 };
        }

        case 'click': {
          const res = this.resolveStepTarget(step);
          if (!res?.element) throw new Error(`Cannot resolve target: ${step.target ?? step.selector}`);
          (res.element as HTMLElement).click();
          return { stepId, action, status: 'ok', selector: res.selector, resolvedVia: res.resolvedVia, confidence: res.confidence, durationMs: Date.now()-t0 };
        }

        case 'navigate': {
          const url = this.interpolate(step.url ?? '');
          // In test env: just record — actual navigation handled externally
          return { stepId, action, status: 'ok', value: url, durationMs: Date.now()-t0 };
        }

        case 'wait_for': {
          const sel = this.interpolate(step.selector ?? step.target ?? '');
          const el = this.doc.querySelector(sel);
          if (!el) throw new Error(`wait_for: element not found: ${sel}`);
          return { stepId, action, status: 'ok', selector: sel, durationMs: Date.now()-t0 };
        }

        case 'read': {
          const candidates = step.candidates ?? (step.selector ? [step.selector] : []);
          let text: string | null = null;
          let foundSel: string | null = null;
          for (const sel of candidates) {
            const el = this.doc.querySelector(sel);
            if (el) { text = el.textContent?.trim() ?? null; foundSel = sel; break; }
          }
          if (step.store_as) this.buffer[step.store_as] = text;
          return { stepId, action, status: 'ok', text, selector: foundSel, durationMs: Date.now()-t0 };
        }

        default:
          return { stepId, action, status: 'unsupported', durationMs: Date.now()-t0 };
      }
    } catch (err: any) {
      return { stepId, action, status: 'error', error: err.message, durationMs: Date.now()-t0 };
    }
  }
}
```

### tests/unit/step-executor.test.ts

Use jsdom (testEnvironment already set). Load vuetify-onboard.html fixture.

Write these test groups:

```
describe('condition gate')
  ✓ skips step when condition interpolates to empty string
  ✓ skips step when condition is literal 'false'
  ✓ runs step when condition interpolates to non-empty value
  ✓ runs step when no condition set

describe('assess_state')
  ✓ returns 'authenticated' when nav element present
  ✓ returns 'unknown' when no signals match
  ✓ matched: true when state equals expect.state
  ✓ matched: false when state does not equal expect.state

describe('type action')  
  ✓ types into first-name-input via abstract target
  ✓ types via direct selector
  ✓ interpolates {{first_name}} param into value
  ✓ returns resolvedVia vuetify_label_match for abstract target
  ✓ returns error when target not found

describe('click action')
  ✓ clicks button via abstract target (name_contains)
  ✓ clicks element via direct selector
  ✓ returns error when target not found

describe('navigate action')
  ✓ returns ok with interpolated url
  ✓ interpolates {{base_url}} param

describe('wait_for action')
  ✓ returns ok when element exists in DOM
  ✓ returns error when element not found

describe('read action')
  ✓ reads text from first matching candidate selector
  ✓ stores text to buffer via store_as
  ✓ returns null text when no candidate matches
  ✓ skips non-matching candidates and uses first match
```

Total new tests: ~24
Grand total after: ~71

## Constraints
- NO network calls
- jsdom environment
- Import from ../../src/step-executor.js
- Load fixture: tests/fixtures/vuetify-onboard.html
- Use existing abstractTargets structure from bead 2a tests

## State graph fixture for assess_state tests
```javascript
const stateGraph = {
  nodes: {
    authenticated: {
      signals: [{ type: 'element_visible', selector: '.v-navigation-drawer' }]
    },
    onboard_form: {
      signals: [{ type: 'element_visible', selector: 'input#input-v-10' }]
    }
  }
};
```
Add `.v-navigation-drawer` div to fixture HTML for the authenticated test.

## Done criteria
npm test exits 0, all tests pass
