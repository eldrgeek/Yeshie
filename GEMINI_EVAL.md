# Technical Review: Yeshie Project (Active Inference for Web Automation)

## 1. New Concepts: Gap Analysis

### Layer 4 — URL Schema and Instance Data
- **Existing Scaffolding:** `sites/yeshid/site.model.json` includes `urlPatterns` (lines 351-362) which are simple templates like `/organization/people/{id}`. This is a basic form of URL schema.
- **What's Completely Absent:** 
  - **Entity ID tables:** There is no mapping from semantic names (e.g., "Alice") to instance IDs (e.g., UUIDs) in the model.
  - **URL pattern prediction:** `navigate` action (in `background.ts` lines 453-479) doesn't use the schema to *predict* the landing state or to *construct* direct links. It's used as a static target.
  - **Direct navigation vs. click-path:** The runner always follows the payload's `navigate` or `click` steps; it doesn't yet have the logic to "shortcut" a multi-click path into a direct URL construction when it knows the entity ID.
- **Most Surgical Change:** 
  - Add an `entities` table to `site.model.json`.
  - Update `StepExecutor.execute('navigate')` and `background.ts` to allow interpolation of entity IDs (e.g., `{{person_id}}`) from a resolved entity lookup.
  - Modify `04-site-explore.payload.json` to scrape ID-rich tables and build the entity mapping.

### CSS Selector Stability Hierarchy + Co-Selector Anchor Pattern
- **Existing Scaffolding:** `TargetResolver` has a `stableSelector` method that prefers `aria-label`, `placeholder`, `name`, and `data-testid`. `AbstractTarget` has `fallbackSelectors`.
- **What's Completely Absent:** 
  - **Co-selectors/Anchors:** The system returns only *one* selector. It doesn't record or check "anchors" (e.g., "this opaque hash always appears next to a header containing 'First Name'").
  - **Auto-heal:** If a cached selector fails, the system falls back to other strategies (like text match) but doesn't *update* the cache with a new opaque selector based on anchor confirmation.
- **Most Surgical Change:** 
  - Update `AbstractTarget` in `src/target-resolver.ts` to include `anchors: Array<{ selector: string; relation: 'next' | 'parent' | 'contains' }>`.
  - Update `TargetResolver.resolve` to verify anchors when a cached selector hits.
  - In `improve.js`, if a target was resolved via a non-cached strategy, record its *new* opaque selector AND its stable anchors.

### Failure Detection as First-Class Prediction
- **Existing Scaffolding:** `StepResult` has `surpriseEvidence`. `site.model.json` has `observedResponseSignatures`.
- **What's Completely Absent:** 
  - **Failure signatures:** `observedResponseSignatures` only tracks success (e.g., `onboard-person-success`). No signatures for `.v-messages--error` or validation-failed states.
  - **Predictive failure check:** The executor doesn't actively look for "negative signals" after an action. It only reports "error" if a target is missing or a timeout occurs.
- **Most Surgical Change:** 
  - Add `failureSignatures` to `site.model.json`.
  - In `background.ts:executeStep`, after a `click` or `type`, check for failure signatures alongside success signatures.
  - Add `failure_signature_matched` to `SurpriseKind` in `src/runtime-contract.ts`.

### Reaction Sensing via DOM MutationObserver
- **Existing Scaffolding:** None.
- **What's Completely Absent:** 
  - `MutationObserver` is not used in the extension's runner. The runner uses polling for `wait_for` and `responseSignature`.
  - No "yielding to microtask queue" for Vue batching.
- **Most Surgical Change:** 
  - In `background.ts`, wrap the action call in a function that arms a `MutationObserver` before firing.
  - Use `await execInTab(tabId, () => Promise.resolve(), [])` after the action to flush the microtask queue.
  - Capture the mutation records and use them to immediately confirm a `responseSignature` instead of polling.

---

## 2. Coherence Check

The four-layer model is conceptually elegant and maps well to the active inference framework. 

**Tension between Layer 3 (Site-specific) and Layer 4 (URL/Instance):** 
There is currently a slight overlap. Layer 3 tracks "State Graph Nodes" which are identified by URL patterns (e.g., `people-list`). Layer 4 wants to treat URLs as "Data Templates" (e.g., `/people/{id}`).
*Recommendation:** Move URL pattern matching logic entirely into a "Router" component that serves both Layer 3 (state identification) and Layer 4 (entity extraction/construction).

**Completeness of `site.model.json`:** 
Currently, it's mostly Layer 3. It lacks the structured "Prior" sections for Layer 2a/2b and the "Data Template" section for Layer 4. The model should be reorganized to explicitly separate these layers so that Layer 2a (Vuetify) can be shared across site models without duplication.

---

## 3. Selector Stability: Practical Assessment

The current `TargetResolver` and `site.model.json` schema are **not yet ready** for co-selectors, but the path is clear.

- **How hard to add:** Medium effort. It requires a schema change in `site.model.json` and a loop in `TargetResolver.resolve` that handles multiple "anchor" checks.
- **Auto-heal implementation:** The "Auto-heal" pattern is the biggest missing piece of the "surprise" loop. When the system uses a Layer 1/2 prior to find an element (because the Layer 3 cache missed), it should immediately "re-bundle" the new opaque selector with the stable anchors. This logic belongs in `improve.js`.

---

## 4. MutationObserver Feasibility

**Integration Point:** `packages/extension/src/entrypoints/background.ts` in `executeStep` (specifically for `click` and `type` actions).

**The Vue Batching Challenge:**
VISION.md is correct: `await Promise.resolve()` is necessary. However, in an extension context, this must happen *inside the page context*.
*The Pattern:**
1. `execInTab` to arm observer.
2. `trustedClick`/`trustedType` (CDP) to fire action.
3. `execInTab` to `await Promise.resolve()`, then read and return mutation records.

**Edge Cases:**
- **Asynchronous Reactions:** Some reactions (like network-driven snackbars) happen far beyond the microtask queue. `MutationObserver` should stay active for a configurable `signatureTimeout`.
- **Global Overlays:** In Vuetify, many mutations happen in the global `.v-application` root (snackbars, dialogs). The observer should likely watch a high-level container, not just the target element.

---

## 5. Top Recommendation

**Implement "Reaction sensing + Failure signatures" as a first-class loop.**

Why? It provides the most immediate "active inference" signal. Currently, the agent "shoots and waits" (polls for success or times out). By sensing the *immediate* reaction (e.g., a validation error appearing), the agent can report surprise *instantly*. This transforms the runner from a scripted sequence into a truly reactive system that "understands" the micro-consequences of its actions. This is the foundation upon which "Hierarchical Orchestration" (Fast/Slow path routing) will be built.
