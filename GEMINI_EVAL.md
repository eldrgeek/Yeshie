# Yeshie Architectural Review: Implementation Gaps & Alignment with VISION.md

This review assesses the current implementation against the four new concepts introduced in the updated \`VISION.md\`.

## 1. Gap Analysis

### Concept 1: Layer 4 — URL Schema and Entity ID Tables
*   **Current State:** The system has a flat \`urlPatterns\` object in \`site.model.json\` used for basic navigation. \`step-executor.ts\` uses regex patterns for \`wait_for\` URL transitions.
*   **Gaps:**
    *   **No Structured Schema:** Missing a formal \`urlSchema\` section that defines parameterized paths (e.g., \`/people/{uuid}/details\`) and the navigation-to-data mapping.
    *   **No Entity Tables:** There is no mechanism to build or store name-to-UUID indexes. The agent still relies on "exploring" (clicking through lists) rather than "calculating" (direct deep-linking).
    *   **Missing Contract:** \`src/runtime-contract.ts\` lacks definitions for URL parameter extraction or query-parameter affordance signatures (e.g., \`?status=active\`).

### Concept 2: CSS Selector Stability Hierarchy & Co-Selectors
*   **Current State:** \`target-resolver.ts\` and \`background.ts\` both implement a \`stableSelector\` utility that prioritizes ARIA attributes and \`data-testid\` over generated IDs. This is a good "Layer 1" prior.
*   **Gaps:**
    *   **Single-Selector Cache:** The \`AbstractTarget\` schema in \`site.model.json\` and \`target-resolver.ts\` only stores one \`cachedSelector\`.
    *   **No Co-Selectors:** The "anchor pattern" (storing multiple alternative selectors like ARIA + text + position) is missing.
    *   **No Auto-Heal:** The resolution logic does not detect re-bundles. If the \`cachedSelector\` (hash-based) fails, it falls back to the full resolution cascade but doesn't "self-heal" by re-anchoring the cache to the new hash via stable co-selectors.

### Concept 3: Failure Detection as First-Class Prediction
*   **Current State:** Payloads include \`responseSignature\` (e.g., in \`01-user-add.payload.json\`), and the site model tracks \`observedResponseSignatures\`. These are currently treated as "Success Signatures."
*   **Gaps:**
    *   **Binary Contract Missing:** There is no distinction between \`successSignatures\` and \`failureSignatures\` in the code or data models.
    *   **No Framework Failure Priors:** \`models/generic-vuetify.model.json\` tracks success signals (snackbars) but ignores failure patterns like \`.v-messages--error\`.
    *   **Ambiguity:** If an action fires and neither a success nor failure signal is observed, the system doesn't explicitly flag this as an "ambiguous contract" violation.

### Concept 4: DOM MutationObserver & Vue Microtask Batching
*   **Current State:** \`background.ts\` uses polling (\`setTimeout\` loops) to wait for elements specified in a \`responseSignature\`.
*   **Gaps:**
    *   **No MutationObserver:** The system does not use \`MutationObserver\` to capture immediate DOM changes (focus shifts, class changes).
    *   **The Vue Race Condition:** \`background.ts\` and \`step-executor.ts\` perform synchronous reads after actions (like \`trustedClick\`). They do not yield to the microtask queue (\`await Promise.resolve()\`), meaning they likely capture the DOM in a "partially reconciled" state before Vue has flushed its batch updates.

---

## 2. Coherence Check: The Four-Layer Model

The model is conceptually strong. Moving "URL Schema" to Layer 4 is correct because it bridges the gap between *Site Structure* (Layer 3) and *Instance Data*. However, the codebase is currently a "2.5-layer" system: it has Web Priors (L1) and some Framework/Site knowledge (L2/L3), but L2b (Archetypes) and L4 (URL/Data) are purely aspirational. 

The immediate friction is that Layer 3 (Site) is trying to do too much "guessing" because it lacks the "URL Wisdom" of Layer 4.

---

## 3. Practical Assessment: Adding Co-Selectors

Adding \`coSelectors\` to the target registry is **low-risk and high-impact**.
*   **Schema Update:** \`AbstractTarget\` needs a \`coSelectors: string[]\` or \`coSelectors: ResolvedTargetUpdate[]\` field.
*   **Resolution Logic:** If \`cachedSelector\` fails, \`TargetResolver\` should try all \`coSelectors\`. If one matches, it should emit a \`SURPRISE_KIND: 're-bundle_detected'\` and trigger a cache update.
*   **Improve Script:** \`improve.js\` must be updated to not just pick the "winner," but to harvest the top 3-4 stable signals from \`stableSelector\` and save them as anchors.

---

## 4. MutationObserver Integration Point

The correct integration point is in \`packages/extension/src/entrypoints/background.ts\` within the \`executeStep\` function.

**Proposed Flow:**
1.  **Arm:** Call a pre-bundled \`PRE_START_OBSERVER\` via \`execInTab\` before the action.
2.  **Act:** Execute \`trustedClick\` or \`trustedType\`.
3.  **Yield:** \`await execInTab(tabId, () => Promise.resolve(), [])\`. This is the "Vue Batching Fix."
4.  **Capture:** Call \`PRE_STOP_AND_READ_OBSERVER\` to retrieve the mutation records and focus state.
5.  **Evaluate:** Compare records against the \`success\` and \`failure\` signatures.

---

## 5. Top Recommendation: The Highest-Impact Change

**Implement the Co-Selector Anchor Pattern.**

While MutationObserver is "cooler" technically, **co-selector auto-healing** solves the single biggest cause of flakiness in web automation: re-bundling. By recording \`[aria-label="X"]\` and \`button:contains("Y")\` alongside the opaque hash \`.v-btn-a1b2\`, the agent can survive a UI deployment without needing a "Slow" model escalation. This is the most direct implementation of the "Active Inference" goal of reducing surprise through redundant perception.
