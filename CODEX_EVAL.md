# CODEX Evaluation — Vision Alignment Review (April 2026)

## Scope

This evaluation reviews the Yeshie codebase against the updated VISION.md (April 2026), focusing specifically on the four new concepts added to the vision and the overall implementation-vision gap.

Files reviewed: `VISION.md`, `src/target-resolver.ts`, `src/step-executor.ts`, `src/types.ts`, `src/runtime-contract.ts`, `packages/extension/src/entrypoints/background.ts`, `packages/relay/index.js`, `sites/yeshid/site.model.json`, `models/runtime.model.json`, `models/generic-vuetify.model.json`, `tests/unit/`, `sites/yeshid/tasks/`.

---

## 1. Implementation Gaps — Four New Vision Concepts

### 1.1 Layer 4 — URL Schema and Entity ID Tables

**What exists:**
- `site.model.json` has a `urlPatterns` object with regex patterns for page detection (e.g. `"people-list": "/organization/people$"`) — read-only URL matching, not predictive URL construction.
- Payload steps use literal `navigate` actions with hardcoded URLs.
- No entity ID extraction or name→UUID mapping anywhere in the codebase.

**What is missing:**
- `urlSchema` section in `sites/{domain}/site.model.json` describing URL templates (e.g. `/organization/people/{uuid}/details`), which parameters are path-encoded vs. query-encoded, and which entities carry identity in the URL.
- Entity table: a runtime mechanism to read a data table (the people list), extract name→UUID pairs, and store them in the chain context for use in downstream `navigate` steps.
- Shortcutting logic in `step-executor.ts` (or `background.ts`'s `executeChain`): if the URL schema is known and the entity UUID is in context, synthesize a direct navigation URL rather than executing the full click-path.
- No test coverage for URL schema or entity ID resolution.

**What to add:**
- New field on `AbstractTarget` (or a sibling concept): `entityCapture: { column: 'Name', idColumn: 'UUID' }` to configure table reads that populate the chain context.
- New action type `navigate_to_entity` in `step-executor.ts` that combines entity ID lookup + URL template interpolation.
- `urlSchema` in `site.model.json` with `{ template: '/organization/people/{uuid}/details', params: ['uuid'] }` per page type.

---

### 1.2 CSS Selector Stability Hierarchy + Co-selector Anchor Pattern

**What exists:**
- `TargetResolver.stableSelector()` (added recently in `src/target-resolver.ts`) correctly prefers `aria-label`, `placeholder`, `name`, `data-testid` over generated IDs — the right instinct.
- The resolution cascade already tries a11y-first before text matching before fallback CSS.
- `AbstractTarget` has `cachedSelector` (the single best selector) and `cachedConfidence`.
- `GENERATED_ID_RE` in `target-resolver.ts` blacklists known generated ID patterns.

**What is missing:**
- No `anchors` bag on `AbstractTarget` — there is only one cached selector, not a set of stable co-selectors to survive re-bundling.
- No re-bundle detection logic: if `cachedSelector` misses AND stable co-selectors still resolve, the code just falls through the cascade rather than auto-healing.
- `improve.js` writes back one selector field but doesn't populate a co-selector anchor set.
- No `resolvedVia: 'auto_heal'` path in the resolver.
- `models/generic-vuetify.model.json` doesn't encode the bundler-hash warning (no Layer 2 guidance to avoid recording opaque selectors without anchors).

**What to add:**
In `src/types.ts` and `src/target-resolver.ts`:
```typescript
interface AbstractTarget {
  cachedSelector?: string | null;
  anchors?: {           // stable co-selectors for auto-heal
    ariaLabel?: string;
    placeholder?: string;
    text?: string;      // visible button/label text
    labelText?: string; // Vuetify label text
  };
  cachedConfidence?: number;
  // ...
}
```
In `TargetResolver.resolve()`: after cache miss, attempt resolution via `anchors` fields; if successful, set `resolvedVia: 'auto_heal'` and emit a `SurpriseEvidence` entry so `improve.js` can update `cachedSelector`.
In `improve.js`: populate `anchors` from the resolved element's stable attributes during the merge step.

---

### 1.3 Failure Detection as First-Class Prediction

**What exists:**
- `observedResponseSignatures` in site model tracks success signals: `{ "element_visible": ".v-snackbar" }` etc.
- `PRE_ASSESS_STATE` in `background.ts` can read page state and detect snackbar text.
- `SurpriseEvidence` type in `src/runtime-contract.ts` captures surprise, but isn't wired to failure signals from field-level errors.
- `wait_for` action can poll for element presence, but not for absence or error-class appearance.

**What is missing:**
- `failureSignatures` field parallel to `responseSignature` on each step and in the site model.
- No framework-level failure patterns in `models/generic-vuetify.model.json`. Layer 2 should encode: Vuetify validation errors appear as `.v-messages--error` inside `.v-input`; snackbar error color is `color="error"`; input error state adds `.v-input--error`.
- Step result does not distinguish "action taken, success confirmed" from "action taken, failure confirmed" from "action taken, outcome ambiguous."
- No test coverage for failure signal detection.

**What to add:**
- Add `failureSignature` field to `Step` interface in `src/step-executor.ts` (mirrors `responseSignature`).
- Add `failurePatterns` array to `models/generic-vuetify.model.json` at the framework level.
- After each `type` or `click` action in `background.ts`'s step handler, check for failure-signature matches before declaring success.
- Add a `StepResult.outcome: 'success' | 'failure' | 'ambiguous'` discriminant (currently only `status: 'ok' | 'error'`).

---

### 1.4 DOM MutationObserver Reaction Sensing

**What exists:**
- `wait_for` action does polling via `setTimeout`/`setInterval` — fully synchronous polling, no mutation observation.
- `PRE_ASSESS_STATE` reads a static DOM snapshot; does not observe changes.
- No `MutationObserver` usage anywhere in the codebase.
- `chrome.scripting.executeScript` infrastructure is in place — the right mechanism for injecting a `MutationObserver` into the page.

**What is missing:**
- Pre-action observer setup: arm a `MutationObserver` in the `MAIN` world before a `type` or `click` fires.
- Post-action microtask yield: `await execInTab(tabId, () => new Promise(r => requestAnimationFrame(r)))` or equivalent to let Vue 3 flush its update queue before reading settled DOM state.
- Reaction evaluation: after the yield, compare mutation records against step's `responseSignature` (success) and `failureSignature` (failure).
- Validity oracle: collect field-level mutation patterns across runs to build validation constraint models.

**What to add:**
New pre-bundled function `PRE_ARM_MUTATION_OBSERVER` in `background.ts`:
```javascript
window.__yeshieMutations = [];
window.__yeshieObserver = new MutationObserver(records => {
  window.__yeshieMutations.push(...records.map(r => ({
    type: r.type,
    target: r.target.className || r.target.tagName,
    added: r.addedNodes.length,
    removed: r.removedNodes.length,
    attr: r.attributeName,
    oldValue: r.oldValue
  })));
});
window.__yeshieObserver.observe(document.body, {
  subtree: true, childList: true, attributes: true, attributeOldValue: true
});
```
After action + `await Promise.resolve()`: call `PRE_READ_MUTATIONS` to collect records, disconnect observer, and evaluate against signatures.

---

## 2. Other Vision-Implementation Gaps

### Code is ahead of vision
- **Sidepanel + chat infrastructure**: The relay, chat history, feedback logging, and `yeshie-listener-watch.sh` watchdog are all built and working. VISION.md describes fully autonomous operation but the chat interface is the actual real-world entry point. The vision should acknowledge the human-in-the-loop layer.
- **Hot-reload**: The WXT watcher + `watch-and-build.mjs` + background-worker reload polling is implemented. Vision doesn't address development ergonomics.
- **`SurpriseEvidence` type**: `src/runtime-contract.ts` defines structured surprise evidence, but VISION.md doesn't describe the shape of surprise signals. The code is ahead here.

### Vision is ahead of code
- **Layer 2b (site-type archetypes)**: `models/archetype-*.model.json` don't exist. Admin dashboard and chatbot priors are described but not scaffolded.
- **Exploration → payload generation**: VISION.md describes autonomous payload generation from natural language after exploration. `04-site-explore.payload.json` is a hardcoded page list. No generation exists.
- **Shared models / federated learning**: The trust-weighted merge and network sharing concepts have no implementation path.
- **Competitive distillation (fast/slow model routing)**: `THINKING-ROUTER.md` exists but Tier 1 / Tier 2 model routing is not implemented. All runs use one model.
- **`runCount` and verification → production mode upgrade**: `improve.js` doesn't count runs or upgrade payload modes. The self-improving loop that is central to the vision isn't fully closing.

### Divergent runtimes (pre-existing issue)
`src/target-resolver.ts` + `src/step-executor.ts` (simulation runtime) and `background.ts` (production runtime) implement overlapping logic independently. The test suite validates the simulation but not the production runtime. This will cause drift.

---

## 3. Prioritized Implementation Roadmap

**1. Failure signatures + MutationObserver (highest impact)**
The validity oracle and failure detection are the most direct path to reducing "ambiguous outcome" surprises. Files: `background.ts` (`executeStep` for `type`/`click`), `src/step-executor.ts` (add `failureSignature` to `Step`), `models/generic-vuetify.model.json` (add `failurePatterns`). Single PR scope, high leverage.

**2. Co-selector anchors in AbstractTarget**
Enables auto-heal and makes the system resilient to re-bundling. Files: `src/types.ts` (add `anchors`), `src/target-resolver.ts` (auto-heal resolution path), `improve.js` (populate anchors on merge). Low disruption, high durability.

**3. Unify the two runtimes**
Move `target-resolver.ts` and `step-executor.ts` into `packages/extension/src/` as the single authoritative implementation. `background.ts` imports them directly rather than duplicating. Tests run against shared code. Eliminates silent drift between test and production behavior.

**4. Layer 4: URL schema + entity ID tables for YeshID**
Add `urlSchema` to `sites/yeshid/site.model.json`, add entity capture to the people-list read step, add `navigate_to_entity` action to `step-executor.ts`. Enables direct navigation, faster chains, and unblocks multi-entity workflows.

**5. Layer 2b: Admin dashboard archetype model**
Create `models/archetype-admin-dashboard.model.json` encoding sidebar nav, CRUD table + detail-pane, role management, snackbar confirm/error patterns. Wire it into site model resolution as a prior. Unlocks rapid expansion to a second site.

---

## 4. Risk Flags

**Divergent runtimes are the biggest maintainability risk.** As long as `background.ts` re-implements target resolution and step execution in pre-bundled functions, every change requires two edits. The test suite validates the simulation runtime but not the production runtime. This gap will widen.

**The self-improvement loop is incomplete.** `improve.js` normalizes field names and writes back cached selectors, but doesn't increment `runCount`, doesn't upgrade payloads from verification to production mode, and doesn't populate the `anchors` co-selector set. The self-improving loop that the vision describes as central to the system isn't closing.

**MutationObserver + Vue 3 batching requires careful testing.** The microtask yield (`await Promise.resolve()`) may not be sufficient for all Vuetify update paths — some state changes require `nextTick()` which schedules a separate microtask. Must be tested against real Vuetify form validation before relying on it.

**Exploration is still hardcoded.** `04-site-explore.payload.json` is a manually maintained page list. Autonomous navigation-driven discovery is not implemented. The current "explore" visits known pages, not unknown ones.

**Shared models have no privacy model.** Layer 3 includes entity data (UUIDs, user names from tables, URL parameters). A sharing mechanism without a scrubbing step would leak customer data. Not a near-term blocker but a design constraint that must be enforced when sharing is designed.
