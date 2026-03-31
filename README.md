# Yeshie — Recursive Self-Improving Web Automation

A three-layer system for automating web tasks. Each layer knows more about a specific site than the one above it. Each successful run makes the scripts faster and more reliable.

---

## The Three Layers

### Layer 1 — Runtime Model (`models/runtime.model.json`)

Describes what the Yeshie runtime *can do* — the instruction set. CoWork reads this before generating any payload to know what action types, signal types, and resolution strategies are available.

This layer is site-agnostic and changes only when the runtime itself is updated.

**Key contents:** action types, responseSignature types, abstract target resolution priority (cached → a11y tree → Vuetify label → contenteditable area → fallback CSS → LLM escalation), self-improvement protocol, completion detection priority order.

### Layer 2 — Framework Model (`models/generic-vuetify.model.json`)

Vuetify-specific interaction patterns that apply to *any* Vuetify app. When CoWork encounters a new Vuetify app, this layer immediately gives it correct strategies for input resolution, dialog detection, table navigation, autocomplete, date pickers, and snackbar confirmation.

YeshID uses Vuetify 3. The key insight captured here: Vuetify inputs don't have ARIA labels. Resolution uses the `.v-label` text inside the parent `.v-input` container — `vuetify_label_match` resolution strategy.

**This layer self-improves** as more Vuetify apps are encountered. When a new Vuetify pattern is discovered (e.g., a new component type), it gets added here and becomes available for all Vuetify sites.

### Layer 3 — Site Model (`sites/yeshid/site.model.json`)

The accumulated knowledge about `app.yeshid.com`. Contains:

- **State graph** — all known page states with their detection signals
- **Abstract target registry** — every UI element CoWork needs to interact with, described semantically, with cached selectors that update after each successful run
- **Observed response signatures** — what actually happens after each action (the ground truth from real runs)
- **URL patterns** — known routes

**This layer is the primary learning surface.** Every time a payload runs successfully, `improve.js` merges the resolved selectors and observed signatures back into this file.

---

## Task Payloads (`sites/yeshid/tasks/`)

Each payload is a self-contained program that CoWork sends to the Yeshie runtime. The runtime executes it locally at page speed and calls back only on completion or failure.

| File | Task | Key Params |
|------|------|------------|
| `00-login.payload.json` | Log in (skips if already authenticated) | `email`, `password` |
| `01-user-add.payload.json` | Add (onboard) a new person | `first_name`, `last_name`, `company_email` |
| `02-user-delete.payload.json` | Delete (offboard) a user | `user_identifier` (name or email) |
| `03-user-modify.payload.json` | Modify a user's fields | `user_identifier`, `new_first_name`, etc. |
| `04-site-explore.payload.json` | Map the entire site — all pages, all elements | (none) |
| `05-integration-setup.payload.json` | Connect a SaaS service via SCIM/API | `service_name`, `auth_type`, `base_url`, `bearer_token` |

---

## How Self-Improvement Works

Every payload has an `abstractTargets` registry. Each target has a `cachedSelector` (initially `null`) and a `cachedConfidence` (initially `0.0`).

When the runtime executes a payload and resolves a target — by a11y tree, Vuetify label, or fallback — it returns the resolved selector with its confidence score in `ChainResult.modelUpdates.resolvedTargets`.

After each successful run, `improve.js` merges these updates back:

```bash
node improve.js sites/yeshid/tasks/01-user-add.payload.json chain-result.json
```

**What changes:**
- `cachedSelector` is updated in the payload file and in `site.model.json`
- `cachedConfidence` is updated (higher confidence wins)
- `_meta.runCount` increments
- After 5 successful runs in `verification` mode, the payload auto-upgrades to `production` mode (full local execution, single round trip)

**The recursion:** each run teaches the system exactly which selectors work, so the next run uses the fast path (cached selector) instead of the slow path (a11y tree search). The first run of `01-user-add` might take 8 seconds. After 5 runs it takes 2 seconds.

---

## The Integration Discovery Loop

The `05-integration-setup.payload.json` implements the most ambitious use case: given any SaaS service name, CoWork figures out how to integrate it with YeshID.

The process CoWork follows before generating the payload:
1. Search `docs.yeshid.com` for "{service_name} integration" to find YeshID-specific instructions
2. Search the service's documentation for "SCIM provisioning endpoint" or SCIM base URL
3. In the service's admin console, generate a SCIM token or API key
4. Populate `params` with the correct values
5. Run the payload — it creates the app in YeshID if needed, then configures authentication

This closes the loop: YeshID's integration page shows the service catalog, CoWork reads each service's docs, and the runtime handles all the clicking and form-filling.

---

## Running Payloads

Payloads are executed by the Yeshie runtime (see `yeshie-runtime-spec.md`). During development, you can test them by injecting them into the page via Claude in Chrome's `javascript_tool` — which is exactly how the verified chat-interface payloads in `yeshie-chat-payloads.md` were built.

```javascript
// In Claude in Chrome:
window.__yeshie__.execute(payload, {
  onStepComplete: (r) => console.log('step:', r),
  onChainComplete: (r) => { console.log('done:', r); /* pipe to improve.js */ },
  onGuardFail: (r) => console.error('guard fail:', r)
});
```

---

## File Structure

```
yeshie/
├── README.md                          ← this file
├── improve.js                         ← self-improvement merge script
│
├── models/
│   ├── runtime.model.json             ← Layer 1: Runtime ISA capabilities
│   └── generic-vuetify.model.json     ← Layer 2: Vuetify interaction patterns
│
└── sites/
    └── yeshid/
        ├── site.model.json            ← Layer 3: YeshID state graph + target registry
        ├── exploration-results.json   ← Output of 04-site-explore (generated)
        └── tasks/
            ├── 00-login.payload.json
            ├── 01-user-add.payload.json
            ├── 02-user-delete.payload.json
            ├── 03-user-modify.payload.json
            ├── 04-site-explore.payload.json
            └── 05-integration-setup.payload.json
```

---

## Adding a New Site

1. Run `04-site-explore.payload.json` adapted for the new site (change `pages` list and `base_url`)
2. Inspect `exploration-results.json` to understand the page structure
3. Create `sites/{site}/site.model.json` with the state graph and abstract targets
4. Write task payloads — start in `exploratory` mode, short chains
5. Run, observe `modelUpdates` in ChainResults, merge with `improve.js`
6. After 5+ successful runs per task, mode auto-upgrades to `production`

---

## Relationship to Yeshie Architecture

These scripts are the *compiled programs* that CoWork generates and sends to the Yeshie Extension Runtime (specified in `yeshie-runtime-spec.md`). The runtime is the ISA — it executes these payloads locally inside the browser page. CoWork is the compiler — it generates payloads from natural language goals using the three model layers as context.

The three layers together form CoWork's *site context* — what it needs to know about a site before it can confidently generate correct payloads. The site model starts sparse and fills in over time, exactly like a human developer's mental model of a codebase.
