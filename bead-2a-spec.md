# Bead 2a — Target Resolution Unit Tests

Working directory: ~/Projects/yeshie

## Goal
Write Jest unit tests for the 6-step abstract target resolution algorithm.
Tests must run against fixture HTML — NO network calls.
All tests must pass: npm test

## What to build

### 1. tests/fixtures/vuetify-onboard.html
A static HTML file that mirrors the actual YeshID onboard form DOM structure
(discovered during live execution). Must include:

```html
<!-- Vuetify mb-2 label pattern (confirmed real structure) -->
<div class="v-col v-col-6">
  <div class="mb-2"><div class="d-flex align-center"><span class="text-body-2">First name</span></div></div>
  <div class="v-input v-text-field">
    <div class="v-field v-field--no-label">
      <div class="v-field__field">
        <input id="input-v-10" type="text" class="v-field__input" />
      </div>
    </div>
  </div>
</div>
<div class="v-col v-col-6">
  <div class="mb-2"><div class="d-flex align-center"><span class="text-body-2">Last name</span></div></div>
  <div class="v-input v-text-field">
    <div class="v-field v-field--no-label">
      <div class="v-field__field">
        <input id="input-v-12" type="text" class="v-field__input" />
      </div>
    </div>
  </div>
</div>
<div class="v-col v-col-6">
  <div class="mb-2"><div class="d-flex align-center"><span class="text-body-2">Company email address</span></div></div>
  <div class="v-input v-text-field">
    <div class="v-field">
      <div class="v-field__field">
        <input id="input-v-14" type="text" placeholder="yeshie.test" class="v-field__input" />
      </div>
      <div class="v-field__append-inner"><span>@mike-wolf.com</span></div>
    </div>
  </div>
</div>
<div class="v-col v-col-6">
  <div class="mb-2"><div class="d-flex align-center"><span class="text-body-2">Personal email address</span></div></div>
  <div class="v-input v-text-field">
    <div class="v-field v-field--no-label">
      <div class="v-field__field">
        <input id="input-v-18" type="text" class="v-field__input" />
      </div>
    </div>
  </div>
</div>
<!-- Classic Vuetify v-label pattern (for strategy A test) -->
<div class="v-input v-text-field">
  <label class="v-label">Username</label>
  <div class="v-field__field">
    <input id="input-username" type="text" />
  </div>
</div>
<!-- Button with aria name -->
<button class="v-btn v-btn--variant-flat" aria-label="Create and onboard person">
  Create and onboard person
</button>
<!-- Generated ID that should be SKIPPED -->
<input id="input-v-999" type="text" aria-label="should-skip-generated" />
<!-- data-testid selector (priority level 2) -->
<input id="testid-input" type="text" data-testid="submit-email" />
<!-- aria-label selector (priority level 3) -->
<input id="aria-input" type="text" aria-label="Search query" />
```

### 2. src/target-resolver.ts
Implement the TargetResolver class. It receives a DOM (document object) and resolves
abstract targets using the 6-step algorithm.

IMPORTANT: This runs in Node.js/Jest with jsdom, NOT in a browser.
Use the passed `document` parameter, not `window.document`.

```typescript
export interface ResolvedTarget {
  selector: string | null;
  confidence: number;
  resolvedVia: 'cached' | 'aria' | 'vuetify_label_match' | 'contenteditable' | 'css_cascade' | 'escalate';
  element?: Element | null;
}

export interface AbstractTarget {
  match?: { role?: string; vuetify_label?: string[]; name_contains?: string[] };
  cachedSelector?: string | null;
  cachedConfidence?: number;
  resolvedOn?: string | null;
  semanticKeys?: string[];
  resolutionStrategy?: string;
  fallbackSelectors?: string[];
}

export class TargetResolver {
  constructor(private doc: Document) {}

  resolve(target: AbstractTarget): ResolvedTarget {
    // Step 1: cached selector
    // Step 2: aria
    // Step 3: vuetify_label_match (two strategies: v-label and mb-2)  
    // Step 4: contenteditable
    // Step 5: css cascade (skip generated IDs matching /input-v-\d+/ or /_react_/)
    // Step 6: escalate
  }

  findInputByLabelText(labelText: string): Element | null {
    // Strategy A: .v-label inside .v-input
    // Strategy B: .mb-2 / .text-body-2 sibling label above .v-input
    // Strategy C: aria-label / placeholder attribute
  }
}
```

Cache validity: confidence >= 0.85 AND resolvedOn within 30 days.
Generated ID pattern to skip: `/^input-v-\d+$/` or `/_react_/` or `/^checkbox-v-\d+$/`

### 3. tests/unit/target-resolver.test.ts

Write ALL of these tests. Use jsdom via jest (already configured).
Load the fixture HTML using `document.body.innerHTML = fixtureHtml`.

```
describe("Step 1: cached selector")
  ✓ uses cached selector when confidence >= 0.85 and resolvedOn within 30 days
  ✓ skips cache when confidence < 0.85
  ✓ skips cache when resolvedOn is older than 30 days
  ✓ skips cache when cachedSelector is null

describe("findInputByLabelText - Strategy B (mb-2 pattern, confirmed on YeshID)")
  ✓ finds input by 'first name' via mb-2 label
  ✓ finds input by 'last name' via mb-2 label  
  ✓ finds input by 'company email' via mb-2 label (case insensitive)
  ✓ finds input by 'personal email' via mb-2 label
  ✓ returns null when label text not found

describe("findInputByLabelText - Strategy A (classic v-label pattern)")
  ✓ finds input by 'username' via .v-label inside .v-input

describe("findInputByLabelText - Strategy C (aria-label/placeholder)")
  ✓ finds input by aria-label text

describe("Step 3: vuetify_label_match via resolve()")
  ✓ resolves first-name-input abstractTarget returning selector '#input-v-10'
  ✓ resolves last-name-input abstractTarget returning selector '#input-v-12'
  ✓ returns confidence 0.88 for vuetify_label_match
  ✓ returns resolvedVia 'vuetify_label_match'

describe("Step 2: aria role+name resolution")  
  ✓ resolves button by name_contains 'create and onboard'
  ✓ returns resolvedVia 'aria'
  ✓ returns confidence 0.85

describe("Step 5: css cascade - generated ID skipping")
  ✓ skips selector '#input-v-999' (matches generated ID pattern)
  ✓ does NOT skip '#testid-input' (data-testid)
  ✓ does NOT skip '#aria-input' (aria-label)

describe("Step 6: escalation")
  ✓ returns resolvedVia 'escalate' when no strategy matches
  ✓ returns confidence 0 on escalation
  ✓ returns selector null on escalation

describe("Cache staleness")
  ✓ treats resolvedOn null as stale
  ✓ treats resolvedOn 31 days ago as stale
  ✓ treats resolvedOn 29 days ago as fresh
```

## Constraints
- NO network calls in tests
- Use jsdom (jest default) for DOM
- Load fixture HTML via document.body.innerHTML
- Import path: ../../src/target-resolver.js (ESM)
- All tests must pass: npm test

## Done criteria
npm test exits 0 with ALL tests passing (schema tests + resolver tests, ~30 total)
