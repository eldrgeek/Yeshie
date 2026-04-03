# Vision-Implementation Alignment — Synthesis (April 2026)

Synthesized from CODEX_EVAL.md (Claude Code review) and GEMINI_EVAL.md (Gemini CLI review) against the updated VISION.md.

---

## 1. Consensus Findings

Both evals converge strongly on these points — treat them as high-confidence:

**All four new vision concepts are missing from the implementation.** Neither eval found significant scaffolding for Layer 4 URL schema, co-selector anchors, failure signatures, or MutationObserver. The existing `urlPatterns` in `site.model.json` is URL *matching*, not URL *construction* — a meaningful distinction both evals flag.

**MutationObserver is the highest-leverage single change.** Both evals independently ranked reaction sensing (MutationObserver + Vue microtask yield) as the top implementation priority. The current polling model is the biggest gap between the active inference vision and the actual runtime behavior. Both note the `await Promise.resolve()` Vue fix as essential and both locate the integration point in `background.ts:executeStep`.

**Co-selector anchors are medium effort, high durability.** Both evals agree the `stableSelector()` method in `target-resolver.ts` is the right instinct but leaves the job half-done — a single cached selector with no anchors means every re-bundle is a hard failure. Both recommend adding an `anchors` field to `AbstractTarget` and wiring auto-heal into `TargetResolver.resolve()`.

**The self-improvement loop isn't closing.** Both flag that `improve.js` doesn't increment `runCount`, doesn't upgrade payload modes from verification to production, and doesn't populate anchors. The loop the vision describes as central is only partially implemented.

**The divergent runtimes are a maintainability time-bomb.** Both evals note that `src/target-resolver.ts` and `background.ts` implement overlapping logic independently. The test suite validates the simulation but not the production code. This will cause drift.

---

## 2. Divergences

**Emphasis on runtime unification.** CODEX rates unifying the two runtimes as the #3 priority; GEMINI doesn't explicitly list it in its top recommendations. CODEX is more convincing here — the test suite validating code that isn't actually running is a fundamental quality problem that compounds every other fix.

**Layer 3 / Layer 4 boundary.** GEMINI raises a tension that CODEX doesn't: `site.model.json`'s `urlPatterns` currently serves both state identification (Layer 3) and could serve URL construction (Layer 4), and this conflation could become messy. GEMINI recommends a dedicated "Router" component. This is worth watching but probably premature to resolve before Layer 4 is even scaffolded.

**Anchor schema detail.** GEMINI proposes `anchors: Array<{ selector: string; relation: 'next' | 'parent' | 'contains' }>` (structural/relational anchors). CODEX proposes `anchors: { ariaLabel, placeholder, text, labelText }` (attribute-level anchors). The attribute-level approach is more practical for initial implementation — it maps directly onto what `stableSelector()` already extracts. Structural/relational anchors are more powerful but harder to implement and more fragile across layout changes.

**MutationObserver timeout.** GEMINI explicitly notes that some reactions (network-driven snackbars) arrive far beyond the microtask queue and recommends a configurable `signatureTimeout` — an important practical detail that CODEX doesn't flag. This is correct: `await Promise.resolve()` handles Vue's synchronous batching but won't catch a snackbar that appears 400ms after a network call completes.

---

## 3. Combined Implementation Priority Matrix

Ordered by (impact × feasibility):

| # | Step | Files | Source |
|---|------|-------|--------|
| 1 | **MutationObserver reaction sensing** + Vue microtask yield in `executeStep` for `click`/`type` | `background.ts` (`executeStep`), new `PRE_ARM_MUTATION_OBSERVER` pre-bundled fn | Both evals, unanimous |
| 2 | **Failure signatures** — add `failureSignature` to `Step`, add `failurePatterns` to `models/generic-vuetify.model.json`, check after actions | `src/step-executor.ts`, `src/types.ts`, `models/generic-vuetify.model.json`, `background.ts` | Both evals |
| 3 | **Co-selector anchors** — add `anchors` to `AbstractTarget`, add auto-heal path in `resolve()`, populate anchors in `improve.js` | `src/types.ts`, `src/target-resolver.ts`, `improve.js` | Both evals |
| 4 | **Runtime unification** — move `target-resolver.ts` + `step-executor.ts` into `packages/extension/src/`, import from `background.ts` | `packages/extension/src/`, `background.ts`, test imports | CODEX (higher priority) |
| 5 | **Close the self-improvement loop** — add `runCount`, mode upgrade (verification → production), anchor population to `improve.js` | `improve.js`, `sites/yeshid/tasks/*.payload.json` | Both evals |
| 6 | **Layer 4 URL schema + entity tables** — add `urlSchema` to `site.model.json`, entity capture in `04-site-explore`, `navigate_to_entity` action | `sites/yeshid/site.model.json`, `src/step-executor.ts`, `background.ts` | Both evals |
| 7 | **Layer 2b: admin dashboard archetype** — create `models/archetype-admin-dashboard.model.json` | new file, update site model resolution | CODEX |

---

## 4. Vision Gaps to Defer or Reframe

**Exploration → autonomous payload generation.** VISION.md describes the north star as "point at any website, generate and execute task payloads from natural language." This is several years of work from where the codebase is. Keep it in the vision as direction, but don't let it shape near-term implementation choices. The current hardcoded exploration payload is fine as a bootstrap shortcut.

**Competitive distillation / fast+slow model routing.** `THINKING-ROUTER.md` exists but the Tier 1 / Tier 2 routing isn't implementable until the runtime emits well-structured surprise evidence consistently. MutationObserver + failure signatures (steps 1 and 2) are the prerequisite. The routing layer should follow, not lead.

**Shared models / federated learning.** Both evals are skeptical of near-term implementation. CODEX additionally flags the privacy problem: Layer 3 includes entity data (UUIDs, user names, URL parameters) that would leak customer PII if shared without scrubbing. Defer until the local loop is reliable and a privacy model is designed.

**Site-type archetypes (Layer 2b).** Valuable but not urgent until the second site is being onboarded. The archetype model should be *derived* from comparing two site models, not written speculatively.

---

## 5. Recommended Next PR

**"Reaction sensing: MutationObserver + failure signatures in background.ts"**

### What changes

`packages/extension/src/entrypoints/background.ts`:
- Add `PRE_ARM_MUTATION_OBSERVER` pre-bundled function that installs a `MutationObserver` on `document.body` with `subtree: true, childList: true, attributes: true, attributeOldValue: true`, storing records in `window.__yeshieMutations`.
- Add `PRE_READ_MUTATIONS` pre-bundled function that flushes and returns `window.__yeshieMutations`, disconnects the observer.
- In `executeStep`, for `type` and `click` actions: (1) arm observer, (2) execute the action, (3) `await execInTab(tabId, () => Promise.resolve())` to yield to Vue's microtask queue, (4) read mutations, (5) check against `step.failureSignature` (new field) — if matched, return `status: 'error', outcome: 'failure'`; (6) check against `step.responseSignature` — if matched, return `status: 'ok', outcome: 'success'`; otherwise `outcome: 'ambiguous'`.
- For async reactions (network-driven snackbars): keep the existing polling `wait_for` as a secondary check with configurable `signatureTimeout`.

`src/step-executor.ts` + `src/types.ts`:
- Add `failureSignature?: ResponseSignature` to the `Step` interface (mirrors existing `responseSignature`).
- Add `outcome?: 'success' | 'failure' | 'ambiguous'` to `StepResult`.

`models/generic-vuetify.model.json`:
- Add `failurePatterns` array: `.v-messages--error`, `.v-input--error`, `[class*="error"]`, `.v-alert--type-error`.

### How to test

1. Unit: extend `tests/unit/step-executor.test.ts` to cover `failureSignature` matching and the new `outcome` discriminant.
2. Integration: run `03-user-modify` payload with an intentionally invalid value (e.g., empty email) and verify the step returns `outcome: 'failure'` with the Vuetify error class in the mutation records rather than timing out.
3. Regression: all 168 existing tests must stay green.

### Why this first

It converts the agent from "shoot and wait" to "act and sense." Every subsequent capability — validity oracle, fast/slow routing, anchor auto-heal — requires knowing whether an action succeeded or failed *immediately*. This is the foundation.
