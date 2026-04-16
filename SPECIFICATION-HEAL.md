# Yeshie: `site-mapper` Skill & HEAL Self-Healing Flow

**Version:** 1.1.0  
**Status:** Draft  
**Created:** 2026-04-14  
**Authors:** Mike Wolf  

---

## Table of Contents

- [Section 0: Background Context](#section-0-background-context)
- [Non-Negotiables](#non-negotiables)
- [Out of Scope](#out-of-scope)
- [Success Criteria](#success-criteria)
- [Component 1: site-mapper Skill](#component-1-site-mapper-skill)
- [Component 2: HEAL Self-Healing Flow](#component-2-heal-self-healing-flow)
- [Hermes Event Schemas](#hermes-event-schemas) — `payload/broken`, `selector/patched`, `site-map/request` *(new)*, `site-map/updated`, `site-map/failed` *(new)*, `payload/healed`, `heal/escalated`
- [Site Context File Format](#site-context-file-format)
- [Safety Invariants](#safety-invariants)
- [Implementation Roadmap](#implementation-roadmap)
- [Worked Examples](#worked-examples)
- [Open Questions](#open-questions)
- [References](#references)

---

## Section 0: Background Context

### What Yeshie Is

Yeshie is a Chrome extension paired with a local relay server that enables a large language model (LLM) to automate web applications — specifically enterprise SaaS tools such as YeshID (an identity management platform), Okta (SSO provider), and Google Admin. Automation tasks are described declaratively as **payload files**: JSON documents that encode a sequence of browser actions. The relay server at `http://localhost:3333` bridges the LLM to the Chrome extension via HTTP endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /chat/inject` | Send a message into the LLM conversation |
| `GET /chat/logs` | Retrieve conversation history |
| `POST /run` | Execute a payload file |
| `GET /tabs/list` | List open browser tabs |

Payload files live at `sites/{site}/tasks/*.payload.json`. Each payload defines an ordered list of **steps**, where each step is one of: `navigate`, `wait_for`, `click`, `type`, `perceive`, `respond`, `assert`, or `dry_run_check`.

### AbstractTargets — The Core UI Binding Mechanism

Every step that interacts with a DOM element references an **abstractTarget**: a named UI element that carries multiple candidate selectors ranked by expected stability:

```json
{
  "name": "add_user_button",
  "description": "Primary button to open the Add User dialog",
  "cachedSelector": "#add-user-btn",
  "cachedConfidence": 0.95,
  "resolvedOn": "2026-03-01T09:00:00Z",
  "fallbacks": [
    { "selector": "[aria-label='Add User']", "confidence": 0.90 },
    { "selector": "button[data-action='add-user']", "confidence": 0.85 },
    { "selector": "button:contains('Add User')", "confidence": 0.60 }
  ]
}
```

`cachedConfidence` is a 0–1 score reflecting how stable the selector is expected to be across app updates (1.0 = ID with no auto-generation, 0.0 = computed class names).

### The `perceive` Action

When a payload step executes `perceive`, the Chrome extension inspects the current SPA page and returns a structured snapshot:

```json
{
  "headings": ["Add User", "User Details"],
  "buttons": ["Save", "Cancel", "Add Another"],
  "fields": [
    { "label": "Email Address", "type": "email", "required": true },
    { "label": "Role", "type": "select", "required": true }
  ],
  "mainActions": ["submit_form", "cancel_dialog"],
  "tables": []
}
```

### Existing Site Context Files

Human-written Markdown files under `prompts/sites/` (e.g., `prompts/sites/app.yeshid.com.md`, `prompts/sites/okta.md`) document known page flows, selectors, and quirks for each target site. These files:
- Have no machine-readable TTL or `mappedAt` timestamp
- Are written by humans after ad-hoc exploration each session
- Are not updated automatically when the UI changes
- Have no structured selector stability annotations

### The Core Problems This Spec Addresses

**Problem 1 — No persistent, reusable page maps.** Every time a new payload is written for a site, the author must re-discover selectors, required fields, and multi-step control flows manually. This is slow and error-prone.

**Problem 2 — Silent payload breakage.** Web apps update their UI without notice. When a CSS class rotates, a button moves, or a modal is replaced by a drawer, the affected payload steps fail. Currently:
- There is no automated detection of selector drift vs. structural change.
- A failed step either throws a confusing error or partially executes, leaving the app in an inconsistent state (e.g., a form half-submitted, a user partially created).
- Repair is fully manual: a human reads the error, re-explores the page, edits the payload file, and retests.

**Solution:** Two tightly coupled components:

1. **`site-mapper` skill** — an on-demand procedure that crawls a target site, runs `perceive` on each page/modal/state, reconciles DOM structure with available documentation, and writes a structured, timestamped site context file.

2. **HEAL flow** — an automated self-repair loop triggered whenever a payload step fails after retries. HEAL triages the failure (selector drift → structural change → fundamental redesign), invokes `site-mapper` when needed, patches `abstractTargets`, verifies the fix with a dry-run, and escalates to a human only when automation cannot recover.

### Hermes Pub/Sub

The Yeshie system uses **Hermes MCP** for inter-agent messaging. Hermes is a lightweight pub/sub channel system accessible as MCP tools. Agents publish events to named channels and subscribe to receive them. All Yeshie events use the `yeshie/` namespace prefix.

---

## Non-Negotiables

- **MUST** write `mappedAt` ISO 8601 UTC timestamp into every generated site context file. Without this, TTL-based remap triggers cannot work.
- **MUST** never execute any write operation (form submission, button click that causes a state change) during a HEAL repair attempt. All browser interaction during HEAL is read-only (navigate, perceive, scroll) until the dry-run verification phase.
- **MUST** publish a `yeshie/heal/escalated` event with full diff whenever HEAL determines it cannot automatically repair a payload. No silent failures.
- **MUST** run the repaired payload in dry-run mode and confirm success before publishing `yeshie/payload/healed`. A heal is not complete until the dry-run passes.
- **MUST** preserve all existing payload steps that are not affected by the breaking change. Patch surgery must be minimal — only broken steps are modified.
- **MUST** respect site map TTL rules: maps ≥ 30 days old trigger a remap before any triage level; maps ≥ 7 days old trigger a remap before triage level 2 (structural change).
- **MUST** store selector fallback candidates ranked by stability tier (ID > data-attribute > aria-label > role+position > text content > computed class), not in arbitrary order.
- **MUST** publish all Hermes events defined in this spec; downstream agents and monitoring tools depend on them.
- **MUST** create a `{payloadFile}.bak` backup with `backedUpAt` timestamp before writing any changes to a payload file. No payload write without a prior backup.
- **MUST** detect heal loops: if a payload breaks within 15 minutes of being healed, skip directly to Level 3 escalation with `escalationReason: "heal_loop_detected"`.

---

## Out of Scope

- **Cross-site selector generalization.** site-mapper produces per-site, per-page maps. It does not attempt to build a generic web automation library.
- **Login / authentication flows during mapping.** site-mapper assumes the browser is already authenticated when invoked. Credential management is out of scope.
- **Automatic payload generation from scratch.** HEAL repairs existing payloads. Generating a new payload for a task never previously automated is a separate authoring workflow.
- **Visual regression testing.** HEAL detects DOM-level changes, not pixel-level visual changes. Screenshot diffing is not part of this spec.
- **Multi-tab payload steps.** Steps that open a new tab and require coordination across tabs are not handled by the initial HEAL implementation.
- **Payload versioning / Git integration.** Patched payload files are written to disk. Committing them to version control is the operator's responsibility.
- **Rate limiting or politeness controls for documentation fetching.** The site-mapper fetches help docs; throttling / robots.txt compliance is a future concern.
- **HEAL for `respond` steps.** Steps of type `respond` (which ask the LLM a question) are not subject to HEAL; only DOM-interaction steps are healed.

---

## Success Criteria

### site-mapper

- [ ] Given a target URL (or list of URLs), produces a valid site context JSON file with a correct `mappedAt` ISO 8601 timestamp.
- [ ] Site context file includes per-page selector lists ranked by stability tier (ID first, computed class last).
- [ ] Required vs. optional field annotations are populated from `perceive` output, reconciled with any fetched help documentation.
- [ ] Multi-step controls (date pickers, search-then-select dropdowns) are represented as `multiStepControls` entries with named substeps.
- [ ] A `yeshie/site-map/updated` Hermes event is published upon successful completion.
- [ ] Total wall-clock time to map a 10-page site (including doc fetch) is ≤ 5 minutes.
- [ ] A re-run on the same site within the TTL window skips remap and returns the cached map (no unnecessary network traffic).

### HEAL Flow

- [ ] A triage level 1 (selector drift) repair completes and publishes `yeshie/selector/patched` within 30 seconds of receiving `yeshie/payload/broken`.
- [ ] A triage level 2 (structural change) repair completes within 3 minutes (including remap time) on a 3-step payload.
- [ ] A triage level 3 (fundamental redesign) escalation publishes `yeshie/heal/escalated` with a structured diff within 60 seconds of failing triage level 2.
- [ ] HEAL never writes to the target web app during repair (only reads / perceives).
- [ ] After any successful heal, dry-run verification passes before `yeshie/payload/healed` is published.
- [ ] HEAL correctly refuses to heal a payload step of type `respond`.
- [ ] All five Hermes channels carry correctly-shaped event payloads (validated against the schemas in this spec).

---

## Component 1: site-mapper Skill

### Overview

`site-mapper` is a triggered-on-demand skill (not a background daemon). It is invoked either:
- Manually by an operator via a Cowork/Claude Code command, or
- Automatically by the HEAL flow (triage level 2) when a structural change is detected.

### Invocation Interface

```json
{
  "skill": "site-mapper",
  "args": {
    "site": "app.yeshid.com",
    "urls": [
      "https://app.yeshid.com/admin/users",
      "https://app.yeshid.com/admin/users/new",
      "https://app.yeshid.com/admin/groups"
    ],
    "docUrls": [
      "https://help.yeshid.com/en/articles/add-user",
      "https://help.yeshid.com/en/articles/manage-groups"
    ],
    "force": false
  }
}
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `site` | string | yes | Hostname key, used as output file name: `prompts/sites/{site}.json` |
| `urls` | string[] | yes | One or more page URLs to visit and perceive. Order matters — reflects expected navigation flow. |
| `docUrls` | string[] | no | Known help documentation URLs. If omitted, site-mapper attempts to discover docs via in-app help links and sitemap. |
| `force` | boolean | no (default: false) | If true, remap even if existing map is within TTL. |

### Step-by-Step Procedure

```
┌─────────────────────────────────────────────────────────────┐
│                   site-mapper PROCEDURE                     │
│                                                             │
│  1. CHECK CACHE                                             │
│     └─ existing map age < TTL and force=false?              │
│        YES → return cached map, skip steps 2-7             │
│        NO  → proceed                                        │
│                                                             │
│  2. FOR EACH URL in args.urls:                              │
│     a. navigate to URL                                      │
│     b. wait_for page stable: no network requests initiated in last 500ms
        AND no [aria-busy='true'],[role='progressbar'],.loading visible;
        timeout 10s then proceed regardless
     b2. AUTH CHECK: if URL now matches /login|/sign-in|/auth|/sso|/session:
        → HALT immediately
        → publish yeshie/site-map/failed { siteId, url, failureReason: "auth_expired", correlationId }
        → abort mapping run   │
│     c. run perceive → raw_percept[url]                      │
│     d. extract all interactive elements via DOM query       │
│     e. for each element, rank selector candidates by tier   │
│     f. detect modal triggers (buttons/links that open       │
│        overlays); if found, activate each and perceive      │
│                                                             │
│  3. FETCH DOCUMENTATION                                     │
│     a. use provided docUrls OR discover via:                │
│        - <a> links matching /help|docs|support/i on page    │
│        - /sitemap.xml of the site                           │
│     b. for each doc URL, fetch text content                 │
│     c. parse: required fields, optional fields, workflows   │
│                                                             │
│  4. RECONCILE                                               │
│     a. merge perceive output with doc-parsed fields         │
│     b. mark fields as required/optional (prefer doc source) │
│     c. identify multi-step controls                         │
│     d. assign selector stability scores                     │
│                                                             │
│  5. DETECT PAGE FLOW                                        │
│     a. infer sequence from URL order + form submit targets  │
│     b. record expected next-page URL after each action      │
│                                                             │
│  6. WRITE SITE CONTEXT FILE                                 │
│     path: prompts/sites/{site}.json                         │
│     (see Site Context File Format section)                  │
│                                                             │
│  7. PUBLISH Hermes event: yeshie/site-map/updated           │
└─────────────────────────────────────────────────────────────┘
```

### Selector Stability Tiers

Selectors are ranked by how stable they are across UI updates. Tier 1 is most stable.

| Tier | Selector Type | Example | Typical Confidence |
|---|---|---|---|
| 1 | Stable ID (non-auto-generated) | `#add-user-btn` | 0.95–1.00 |
| 2 | `data-*` attribute | `[data-testid='submit']` | 0.88–0.95 |
| 3 | `aria-label` | `[aria-label='Add User']` | 0.80–0.90 |
| 4 | `role` + structural position | `form > button[type='submit']` | 0.70–0.82 |
| 5 | Visible text content | `button:contains('Add User')` | 0.55–0.72 |
| 6 | Computed/generated class | `.btn-primary-xk3f` | 0.10–0.40 |

**Rule:** Auto-generated IDs (matching patterns like `[a-z]+-[0-9a-f]{6,}`) are treated as Tier 6, not Tier 1.

**Tier 5 — `:has-text()` polyfill note:** The CSS pseudo-selector `button:contains('...')` is not a standard CSS selector. Tier 5 selectors in Yeshie are implemented using a `:has-text()` polyfill already built into `resolveSelector()` in the Chrome extension. Any code that generates or evaluates Tier 5 selectors MUST route through `resolveSelector()` rather than calling `document.querySelector()` directly.

### Multi-Step Control Detection

Some controls require a sequence of interactions to operate. site-mapper detects and models these:

**Date picker example:**
```json
{
  "name": "start_date",
  "type": "multiStepControl",
  "substeps": [
    { "action": "click", "target": "[data-testid='date-input']", "description": "Open date picker" },
    { "action": "click", "target": ".calendar-day[data-date='{value}']", "description": "Select target date; {value} is ISO date string" },
    { "action": "click", "target": "[aria-label='Apply']", "description": "Confirm selection" }
  ]
}
```

**Search-then-select example:**
```json
{
  "name": "assign_group",
  "type": "multiStepControl",
  "substeps": [
    { "action": "click", "target": "[data-testid='group-search']", "description": "Focus search field" },
    { "action": "type", "target": "[data-testid='group-search']", "description": "Type search query; {value} is group name" },
    { "action": "wait_for", "target": ".search-results-dropdown", "description": "Wait for results to appear" },
    { "action": "click", "target": ".search-result-item:first-child", "description": "Select first result matching {value}" }
  ]
}
```

---

## Component 2: HEAL Self-Healing Flow

### Overview

HEAL is triggered whenever the relay reports that a payload step has failed after `N` retries (default N=3). The HEAL agent subscribes to the `yeshie/payload/broken` Hermes channel and runs the triage-repair-verify loop.

### State Machine

```
                         ┌──────────────────────┐
                         │   IDLE (subscribed   │
                         │ to payload/broken)   │
                         └──────────┬───────────┘
                                    │ receive yeshie/payload/broken
                                    ▼
                         ┌──────────────────────┐
                         │  CHECK MAP AGE       │
                         │                      │
                         │  ≥ 30 days old?  ────┼──► TRIGGER REMAP ──┐
                         │  (any triage)        │                     │
                         │                      │    wait for         │
                         │  < 30 days → next    │    site-map/updated │
                         └──────────┬───────────┘         │           │
                                    │                      │           │
                    ┌───────────────┘◄─────────────────────┘           │
                    ▼                                                   │
         ┌──────────────────────┐                                       │
         │  TRIAGE LEVEL 1      │                                       │
         │  (Selector Drift)    │                                       │
         │                      │                                       │
         │  Try fallback        │                                       │
         │  selectors in order  │                                       │
         │  of stability tier   │                                       │
         └──────────┬───────────┘                                       │
                    │                                                   │
         ┌──────────┴───────────┐                                       │
         │ Fallback found?      │                                       │
         ├─ YES ────────────────┼──► PATCH abstractTarget in payload    │
         │                      │    publish yeshie/selector/patched    │
         │                      │    → go to DRY-RUN VERIFY             │
         ├─ NO ─────────────────┼──────────────────────────────────────►│
         └──────────────────────┘         (selector exhausted)          │
                                                                        ▼
                                                    ┌──────────────────────┐
                                                    │ CHECK MAP AGE (L2)   │
                                                    │                      │
                                                    │ ≥ 7 days? → REMAP    │
                                                    │ < 7 days → proceed   │
                                                    └──────────┬───────────┘
                                                               │
                                                               ▼
                                                    ┌──────────────────────┐
                                                    │  TRIAGE LEVEL 2      │
                                                    │  (Structural Change) │
                                                    │                      │
                                                    │  trigger site-mapper │
                                                    │  on affected URL     │
                                                    │  wait for map update │
                                                    │                      │
                                                    │  diff old map vs new │
                                                    │  regenerate broken   │
                                                    │  payload steps from  │
                                                    │  new map             │
                                                    └──────────┬───────────┘
                                                               │
                                                    ┌──────────┴───────────┐
                                                    │ Regen succeeded?     │
                                                    ├─ YES ────────────────┼──► DRY-RUN VERIFY
                                                    ├─ NO ─────────────────┼──────────┐
                                                    └──────────────────────┘          │
                                                                                      ▼
                                                                       ┌──────────────────────┐
                                                                       │  TRIAGE LEVEL 3      │
                                                                       │  (Escalate)          │
                                                                       │                      │
                                                                       │  compute old-vs-new  │
                                                                       │  structure diff      │
                                                                       │  publish             │
                                                                       │  yeshie/heal/        │
                                                                       │  escalated           │
                                                                       │                      │
                                                                       │  → IDLE              │
                                                                       └──────────────────────┘

              ┌──────────────────────────────────────────────────────────────────┐
              │                        DRY-RUN VERIFY                           │
              │                                                                  │
              │  Run repaired payload with dry_run=true                          │
              │  (no writes, no state changes on target app)                     │
              │                                                                  │
              │  All steps pass?                                                 │
              │  ├─ YES → publish yeshie/payload/healed → IDLE                  │
              │  └─ NO  → triage_level += 1 → re-enter triage at new level      │
              └──────────────────────────────────────────────────────────────────┘
```

### Triage Level Definitions

#### Level 1 — Selector Drift (fast fix, no remap required)

**Detection:** The element identified by `cachedSelector` is not found in the current DOM. However, the page structure (number of forms, modal presence, heading text) matches what was recorded in the site map.

**Repair procedure:**
1. Iterate through `fallbacks` in stability-tier order (highest first).
2. For each fallback selector, attempt to locate the element with a 2-second timeout.
3. First match wins.
4. Update the payload's `abstractTarget`:
   - Set `cachedSelector` to the winning fallback selector.
   - Set `cachedConfidence` to the fallback's confidence score.
   - Set `resolvedOn` to current UTC timestamp.
   - Demote the old `cachedSelector` to last position in `fallbacks`.
5. Write the patched payload file to disk.
6. Publish `yeshie/selector/patched`.
7. Proceed to dry-run verification.

**Time budget:** ≤ 30 seconds total.

#### Level 2 — Structural Change (requires remap)

**Detection (any of the following):**
- The target element is absent from the DOM and all fallbacks are exhausted.
- The page heading set has changed (e.g., "Add User" dialog no longer exists; replaced by "Invite User" wizard).
- The `perceive` field count differs from the site map record by ≥ 2 fields.
- A required modal that the step expected to be open is not present.

**Repair procedure:**
1. Check site map age. If ≥ 7 days, trigger site-mapper first.
2. Generate a UUID `correlationId`. Publish `yeshie/site-map/request` with `{ correlationId, requestedBy: "heal-agent", siteId, urls: [affectedUrl], triggeredByPayload: payloadFile }`.
3. Subscribe to `yeshie/site-map/updated` and `yeshie/site-map/failed`, filtering by `correlationId`. Wait up to 5 minutes.
   - If `site-map/failed` arrives: escalate to Level 3 with `escalationReason: "remap_failed_auth"` or `"remap_failed"`.
4. Compute a structural diff between old map and new map.
5. Identify which payload steps reference elements that have changed (using the Field Identity Algorithm — see below).
6. For each broken step, run the **LLM step regeneration algorithm**:
   - **Input:** `{ oldStep: PayloadStep, oldMap: SiteContextPage, newMap: SiteContextPage }`
   - **LLM call** with structured prompt: *"Given this old step targeting element X with these selectors, and this new page map, identify the best matching element in the new map. Return: `{ matched: boolean, newAbstractTarget: AbstractTarget | null, confidence: 0–1, reasoning: string }`"*
   - **If `confidence >= 0.75`:** use `newAbstractTarget`, mark step as `autoHealed: true` in payload metadata.
   - **If `confidence 0.50–0.74`:** use `newAbstractTarget` but set `healConfidence: "low"` in payload step metadata; flag the payload for human review post-deploy.
   - **If `confidence < 0.50`:** do not patch this step; escalate to Level 3 with `escalationReason: "low_regen_confidence"`.
7. If all broken steps produced `confidence >= 0.50`: write the updated steps to disk. Otherwise abort and escalate.
8. Write the patched payload file to disk.
9. Proceed to dry-run verification.

#### Field Identity Algorithm

Two fields in old and new site maps are considered **the same field** if any of the following hold:

- **(a) Label similarity:** the `label` text Levenshtein distance is ≤ 2 (tolerates minor renames like "Email Address" → "Email Adress" or "Email" → "E-mail").
- **(b) Selector overlap:** any selector in the old field's `selectors[]` array appears verbatim in the new field's `selectors[]` array.
- **(c) Name attribute identity:** the field's `name` HTML attribute is identical across old and new maps.

**Implications for triage:**
- If a field matches by rule (a), (b), or (c) but its primary selector has changed → **Level 1** (selector drift, auto-repair).
- If a field matches by rule (a) or (c) but has no selector overlap → **Level 2** (structural change, LLM regeneration required).
- If no rule matches → **Level 3** (field may have been removed or replaced by a fundamentally different control).

**Time budget:** ≤ 3 minutes (includes remap time).

#### Level 3 — Fundamental Redesign (escalate to human)

**Detection (any of the following):**
- The new site map shows the target page has been restructured so significantly that the payload step's intent (e.g., "click Add User button") has no clear mapping to any element in the new map.
- The page flow sequence has changed: steps that expected to navigate A→B→C now find A→D→B.
- The number of steps required to complete the task has increased by ≥ 3 (suggesting a new workflow, not just new selectors).
- site-mapper fails to produce a valid new map after a remap attempt.

**Repair procedure:**
1. Compute full diff of old map vs. new map (page-level, field-level, selector-level).
2. Identify the specific steps that cannot be automatically repaired.
3. Publish `yeshie/heal/escalated` with:
   - The original broken event reference.
   - The structural diff.
   - A human-readable explanation of what changed and why automation cannot recover.
4. Do NOT modify the payload file. Leave it in its last known-good state.
5. Return to IDLE.

**Time budget:** ≤ 60 seconds from failure of level 2 to publishing escalation event.

### Site Map TTL Policy

| Map Age | Effect |
|---|---|
| < 7 days | Use cached map for triage. No remap unless `force=true`. |
| 7–29 days | For triage level 2: trigger remap before structural analysis. For triage level 1: use cached map. |
| ≥ 30 days | Trigger remap before any triage level (even level 1). |

TTL is computed from the `mappedAt` field of the site context file. If `mappedAt` is absent (legacy file), treat the map as 30+ days old.

### Dry-Run Verification

Every HEAL attempt, regardless of triage level, MUST end with a dry-run verification before the payload is marked as healed.

**Dry-run mode rules:**
- Steps of type `navigate` execute normally.
- Steps of type `wait_for` and `perceive` execute normally.
- Steps of type `click`, `type`, and `assert` execute their selector resolution (confirm element is found) but do NOT dispatch actual events to the DOM.
- Steps of type `respond` are skipped.
- A `dry_run_check` step type is inserted before any write-action step, validating that the target element exists and matches the expected selector.

**Pass condition:** All steps resolve their targets without error, and no `dry_run_check` assertion fails.

**Failure handling:** If dry-run fails, HEAL increments the triage level and re-enters triage. If already at level 3, publish `yeshie/heal/escalated`.

---

## Hermes Event Schemas

All events are published as JSON objects. Hermes delivers them as the `payload` field of a Hermes message envelope. All `timestamp` fields are ISO 8601 UTC.

### `yeshie/payload/broken`

Published by the relay when a payload step fails after N retries.

```json
{
  "eventType": "yeshie/payload/broken",
  "timestamp": "2026-04-14T10:30:00Z",
  "payloadFile": "sites/app.yeshid.com/tasks/add-user.payload.json",
  "stepIndex": 3,
  "stepType": "click",
  "abstractTargetName": "add_user_button",
  "cachedSelector": "#add-user-btn",
  "errorMessage": "Element not found: #add-user-btn (timeout 5000ms)",
  "retryCount": 3,
  "pageUrl": "https://app.yeshid.com/admin/users",
  "perceiveSnapshot": {
    "headings": ["Users", "Directory"],
    "buttons": ["Invite User", "Export", "Filter"],
    "fields": [],
    "mainActions": [],
    "tables": [{"id": "users-table", "columns": ["Name", "Email", "Role", "Status"]}]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Always `"yeshie/payload/broken"` |
| `timestamp` | string | ISO 8601 UTC time the failure was recorded |
| `payloadFile` | string | Relative path to the payload file |
| `stepIndex` | integer | 0-based index of the failing step |
| `stepType` | string | Type of the failing step (click, type, wait_for, etc.) |
| `abstractTargetName` | string | `name` field of the failing abstractTarget |
| `cachedSelector` | string | The selector that failed |
| `errorMessage` | string | Raw error from the Chrome extension |
| `retryCount` | integer | Number of retries attempted before publishing this event |
| `pageUrl` | string | URL of the page at time of failure |
| `perceiveSnapshot` | object | Result of a `perceive` call at the moment of failure; may be null if perceive itself failed |

---

### `yeshie/selector/patched`

Published by the HEAL agent after a successful triage level 1 repair.

```json
{
  "eventType": "yeshie/selector/patched",
  "timestamp": "2026-04-14T10:30:18Z",
  "payloadFile": "sites/app.yeshid.com/tasks/add-user.payload.json",
  "stepIndex": 3,
  "abstractTargetName": "add_user_button",
  "oldSelector": "#add-user-btn",
  "oldConfidence": 0.95,
  "newSelector": "[aria-label='Add User']",
  "newConfidence": 0.88,
  "selectorTier": 3,
  "healDurationMs": 14200
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Always `"yeshie/selector/patched"` |
| `timestamp` | string | ISO 8601 UTC time of patch |
| `payloadFile` | string | Relative path to the patched payload file |
| `stepIndex` | integer | 0-based index of the step that was patched |
| `abstractTargetName` | string | Name of the abstractTarget that was patched |
| `oldSelector` | string | The selector that failed |
| `oldConfidence` | number | Confidence score of the old selector |
| `newSelector` | string | The winning fallback selector |
| `newConfidence` | number | Confidence score of the new selector |
| `selectorTier` | integer | Stability tier (1–6) of the new selector |
| `healDurationMs` | integer | Wall-clock milliseconds from receiving broken event to publishing this event |

---

### `yeshie/site-map/request`

Published by HEAL (or an operator) to request a site mapping run. site-mapper subscribes to this channel and begins execution. The `correlationId` is used to match the corresponding `yeshie/site-map/updated` (or `yeshie/site-map/failed`) response.

```json
{
  "channel": "yeshie/site-map/request",
  "schema": {
    "correlationId": "uuid — used to match yeshie/site-map/updated response",
    "requestedBy": "heal-agent | manual",
    "siteId": "string",
    "urls": ["string"],
    "force": "boolean — bypass TTL check",
    "triggeredByPayload": "string | null — payloadId that triggered this remap"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `correlationId` | string (UUID) | Caller-generated UUID; site-mapper MUST echo this in `site-map/updated` or `site-map/failed` |
| `requestedBy` | string | `"heal-agent"` when triggered by HEAL; `"manual"` for operator-initiated runs |
| `siteId` | string | Hostname key (e.g., `"app.yeshid.com"`) |
| `urls` | string[] | URLs to remap |
| `force` | boolean | If `true`, bypass TTL check and remap unconditionally |
| `triggeredByPayload` | string \| null | The `payloadFile` path from the originating `yeshie/payload/broken` event, or `null` for manual requests |

**HEAL invocation protocol (Level 2):**

1. HEAL generates a UUID `correlationId`.
2. HEAL publishes `yeshie/site-map/request` with that `correlationId`.
3. HEAL subscribes to `yeshie/site-map/updated` and `yeshie/site-map/failed`, filtering by `correlationId`.
4. HEAL waits up to 5 minutes for a matching response.
5. If `site-map/failed` arrives (or timeout expires), HEAL escalates to Level 3 with `escalationReason: "remap_failed"`.

---

### `yeshie/site-map/updated`

Published by site-mapper when a mapping run completes successfully.

```json
{
  "eventType": "yeshie/site-map/updated",
  "timestamp": "2026-04-14T10:33:45Z",
  "site": "app.yeshid.com",
  "outputFile": "prompts/sites/app.yeshid.com.json",
  "urlsMapped": [
    "https://app.yeshid.com/admin/users",
    "https://app.yeshid.com/admin/users/new"
  ],
  "docUrlsUsed": [
    "https://help.yeshid.com/en/articles/add-user"
  ],
  "pageCount": 2,
  "modalCount": 1,
  "triggerReason": "heal_level2",
  "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "durationMs": 187400
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Always `"yeshie/site-map/updated"` |
| `timestamp` | string | ISO 8601 UTC time of completion |
| `site` | string | Hostname key |
| `outputFile` | string | Path to the written site context file |
| `urlsMapped` | string[] | All URLs that were visited and perceived |
| `docUrlsUsed` | string[] | Documentation URLs that were fetched and parsed |
| `pageCount` | integer | Number of distinct pages mapped |
| `modalCount` | integer | Number of modals/overlays discovered and mapped |
| `triggerReason` | string | One of: `"manual"`, `"heal_level2"`, `"ttl_expired"` |
| `durationMs` | integer | Total wall-clock time for the mapping run in milliseconds |
| `correlationId` | string | UUID echoed from the `yeshie/site-map/request` event that triggered this run; `null` for manually triggered runs |

---

### `yeshie/payload/healed`

Published by HEAL after a successful repair and dry-run verification.

```json
{
  "eventType": "yeshie/payload/healed",
  "timestamp": "2026-04-14T10:34:12Z",
  "payloadFile": "sites/app.yeshid.com/tasks/add-user.payload.json",
  "triageLevel": 2,
  "stepsPatched": [3, 4],
  "abstractTargetsPatched": ["add_user_button", "email_field"],
  "remapTriggered": true,
  "dryRunPassed": true,
  "totalHealDurationMs": 252000,
  "brokenEventTimestamp": "2026-04-14T10:30:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Always `"yeshie/payload/healed"` |
| `timestamp` | string | ISO 8601 UTC time of successful heal |
| `payloadFile` | string | Relative path to the healed payload file |
| `triageLevel` | integer | Final triage level used (1, 2) |
| `stepsPatched` | integer[] | 0-based indices of steps that were modified |
| `abstractTargetsPatched` | string[] | Names of abstractTargets that were updated |
| `remapTriggered` | boolean | Whether site-mapper was invoked during this heal |
| `dryRunPassed` | boolean | Always true when this event is published |
| `totalHealDurationMs` | integer | Total wall-clock milliseconds from broken event receipt to this event |
| `brokenEventTimestamp` | string | Timestamp from the originating `yeshie/payload/broken` event |

---

### `yeshie/heal/escalated`

Published by HEAL when automated repair is not possible. Human judgment required.

```json
{
  "eventType": "yeshie/heal/escalated",
  "timestamp": "2026-04-14T10:36:00Z",
  "payloadFile": "sites/app.yeshid.com/tasks/add-user.payload.json",
  "stepIndex": 3,
  "abstractTargetName": "add_user_button",
  "triageLevelsAttempted": [1, 2],
  "escalationReason": "Page flow changed: expected Add User modal triggered by #add-user-btn, new UI uses /admin/users/invite route instead. Step count delta: +4 steps required.",
  "structuralDiff": {
    "pagesAdded": [],
    "pagesRemoved": [],
    "pagesModified": [
      {
        "url": "https://app.yeshid.com/admin/users",
        "headingsOld": ["Users"],
        "headingsNew": ["Users", "Directory"],
        "buttonsOld": ["Add User", "Export", "Filter"],
        "buttonsNew": ["Invite User", "Export", "Filter"],
        "fieldsOld": [],
        "fieldsNew": [],
        "modalsOld": ["add_user_modal"],
        "modalsNew": []
      }
    ],
    "selectorsLost": ["#add-user-btn", "[aria-label='Add User']"],
    "selectorsGained": ["[data-testid='invite-user-btn']", "#invite-flow-container"]
  },
  "payloadIntact": true,
  "brokenEventTimestamp": "2026-04-14T10:30:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Always `"yeshie/heal/escalated"` |
| `timestamp` | string | ISO 8601 UTC time of escalation |
| `payloadFile` | string | Relative path to the payload file (unmodified) |
| `stepIndex` | integer | 0-based index of the step that could not be healed |
| `abstractTargetName` | string | Name of the abstractTarget that could not be healed |
| `triageLevelsAttempted` | integer[] | Which triage levels were tried before escalating |
| `escalationReason` | string | Human-readable explanation of why automation failed |
| `structuralDiff` | object | Machine-readable diff of old map vs new map |
| `structuralDiff.pagesAdded` | string[] | URLs of pages that are new since last map |
| `structuralDiff.pagesRemoved` | string[] | URLs of pages that no longer exist |
| `structuralDiff.pagesModified` | object[] | Per-page diff records (see sub-schema below) |
| `structuralDiff.selectorsLost` | string[] | Selectors present in old map, absent in new map |
| `structuralDiff.selectorsGained` | string[] | Selectors in new map not present in old map |
| `payloadIntact` | boolean | Always true; payload file is never modified during an escalation |
| `brokenEventTimestamp` | string | Timestamp from the originating `yeshie/payload/broken` event |

---

### `yeshie/site-map/failed`

Published by site-mapper when a mapping run cannot complete. HEAL MUST treat this as a Level 3 escalation trigger.

```json
{
  "eventType": "yeshie/site-map/failed",
  "timestamp": "2026-04-14T10:35:00Z",
  "siteId": "app.yeshid.com",
  "url": "https://app.yeshid.com/admin/users",
  "failureReason": "auth_expired",
  "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "partialMap": null
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Always `"yeshie/site-map/failed"` |
| `timestamp` | string | ISO 8601 UTC time of failure |
| `siteId` | string | Hostname key |
| `url` | string | The URL that triggered the failure |
| `failureReason` | string | One of: `"auth_expired"`, `"timeout"`, `"perceive_error"`, `"network_error"` |
| `correlationId` | string | UUID from the originating `yeshie/site-map/request`; `null` if triggered manually |
| `partialMap` | object \| null | Any partial map data collected before failure; `null` if none |

**HEAL handling:** Upon receiving `yeshie/site-map/failed`, HEAL MUST escalate to Level 3 immediately with `escalationReason: "remap_failed_auth"` (if `failureReason` is `"auth_expired"`) or `"remap_failed"` otherwise.

---

## Site Context File Format

Site context files are written to `prompts/sites/{site}.json`. They supersede (but do not delete) the legacy hand-written `.md` files.

### Full Schema

```json
{
  "site": "app.yeshid.com",
  "mappedAt": "2026-04-14T10:33:45Z",
  "mappedBy": "site-mapper@1.0.0",
  "docUrlsUsed": [
    "https://help.yeshid.com/en/articles/add-user"
  ],
  "pages": [
    {
      "url": "https://app.yeshid.com/admin/users",
      "title": "Users — YeshID Admin",
      "headings": ["Users", "Directory"],
      "pageFlow": {
        "entryFrom": null,
        "exitTo": ["https://app.yeshid.com/admin/users/new"]
      },
      "fields": [],
      "buttons": [
        {
          "name": "add_user_button",
          "label": "Add User",
          "selectors": [
            { "selector": "[data-testid='add-user']", "tier": 2, "confidence": 0.93 },
            { "selector": "[aria-label='Add User']", "tier": 3, "confidence": 0.88 },
            { "selector": "button:contains('Add User')", "tier": 5, "confidence": 0.65 }
          ],
          "opensModal": "add_user_modal"
        }
      ],
      "modals": [
        {
          "id": "add_user_modal",
          "trigger": "add_user_button",
          "headings": ["Add User"],
          "fields": [
            {
              "name": "email_field",
              "label": "Email Address",
              "type": "email",
              "required": true,
              "requiredSource": "doc",
              "selectors": [
                { "selector": "[data-testid='email-input']", "tier": 2, "confidence": 0.94 },
                { "selector": "input[type='email']", "tier": 4, "confidence": 0.75 },
                { "selector": "[aria-label='Email Address']", "tier": 3, "confidence": 0.85 }
              ]
            },
            {
              "name": "role_select",
              "label": "Role",
              "type": "select",
              "required": true,
              "requiredSource": "perceive",
              "selectors": [
                { "selector": "[data-testid='role-select']", "tier": 2, "confidence": 0.92 },
                { "selector": "select[name='role']", "tier": 4, "confidence": 0.78 }
              ]
            },
            {
              "name": "display_name_field",
              "label": "Display Name",
              "type": "text",
              "required": false,
              "requiredSource": "perceive",
              "selectors": [
                { "selector": "[data-testid='display-name-input']", "tier": 2, "confidence": 0.91 }
              ]
            }
          ],
          "multiStepControls": [],
          "submitButton": {
            "name": "save_user_button",
            "label": "Save",
            "selectors": [
              { "selector": "[data-testid='save-user']", "tier": 2, "confidence": 0.95 },
              { "selector": "button[type='submit']", "tier": 4, "confidence": 0.70 }
            ]
          }
        }
      ],
      "multiStepControls": [],
      "tables": [
        {
          "id": "users_table",
          "selector": "[data-testid='users-table']",
          "columns": ["Name", "Email", "Role", "Status"]
        }
      ]
    }
  ]
}
```

### Field: `requiredSource`

| Value | Meaning |
|---|---|
| `"doc"` | Required/optional annotation comes from fetched help documentation — higher authority |
| `"perceive"` | Annotation inferred from DOM (e.g., `required` attribute, asterisk label, aria-required) — lower authority |
| `"inferred"` | Required because a form submission was observed to fail when this field was blank — highest authority (future feature) |

### File Naming

| Pattern | Example |
|---|---|
| `prompts/sites/{hostname}.json` | `prompts/sites/app.yeshid.com.json` |
| `prompts/sites/{hostname}.md` | `prompts/sites/app.yeshid.com.md` (legacy, hand-written) |

Both files may coexist. Code that reads site context MUST prefer `.json` over `.md` when the `.json` file exists and its `mappedAt` is within TTL.

---

## Safety Invariants

These constraints must hold at all times. No exception, no override flag.

**SI-1: No writes during repair.**
HEAL MUST NOT dispatch any event to the target web app (click, type, form submit, XHR trigger) during triage levels 1 or 2. The only permitted browser interactions are: `navigate`, `wait_for`, `perceive`, and selector probe (checking element existence without clicking).

**SI-2: Dry-run before healed.**
`yeshie/payload/healed` MUST NOT be published unless a dry-run has completed with all steps passing. The `dryRunPassed` field in the event exists to make this auditable.

**SI-3: Payload file immutability on escalation.**
When HEAL escalates to level 3, it MUST NOT write any changes to the payload file. The file remains in its last known-good state. This prevents a partially-repaired (and potentially incorrect) payload from being used in a future run.

**SI-4: Monotonic triage progression.**
HEAL MUST attempt triage levels in order: 1 → 2 → 3. It MUST NOT skip directly to level 2 or 3 without attempting lower levels first (except when site map age forces a remap that supersedes level 1 — but even then, the selector fallback check is run after the remap).

**SI-5: Single concurrent heal per payload file.**
If a `yeshie/payload/broken` event arrives for a payload file that is already being healed, the new event is queued (not dropped). HEAL processes one payload at a time per file. Two events for *different* payload files may be healed concurrently.

**SI-6: Event schema validation.**
All Hermes events published by HEAL and site-mapper MUST be validated against the schemas in this spec before publishing. A malformed event MUST be logged to the relay error log and not published.

**SI-7: Site-mapper read-only navigation.**
site-mapper MUST NOT submit any forms, click any "Save" or "Submit" buttons, or take any action that mutates server-side state. Clicking to open a modal or accordion for the purpose of perceiving it is permitted.

**SI-8: Backup before write.**
Before writing any changes to a payload file (at any triage level), HEAL MUST create a backup file at `{payloadFile}.bak` containing the original payload contents plus a top-level `backedUpAt` ISO 8601 UTC timestamp field. If a `.bak` file already exists, it is overwritten only if the existing `.bak` is older than 1 hour (to preserve the most recent pre-heal state across multiple heal attempts).

**SI-9: Heal loop detection.**
If a `yeshie/payload/broken` event arrives for a payload file that was successfully healed (i.e., `yeshie/payload/healed` was published) within the preceding 15 minutes, HEAL MUST skip triage levels 1 and 2 and escalate directly to Level 3 with `escalationReason: "heal_loop_detected"`. This prevents infinite remap-heal-break cycles when a structural change is unstable or oscillating.

---

## Implementation Roadmap

> **Execution model:** 4–6 AI agents running in parallel. Times are agent-hours; clock time with 4 agents running concurrently is approximately **3 days total**.

---

### Phase 1: site-mapper Core — ✅ DONE (2026-04-14)

- [x] Define site context JSON schema (TypeScript interface + Zod schema)
- [x] Implement `perceive`-based page snapshot for a single URL
- [x] Implement selector stability ranking (tier assignment logic)
- [x] Implement modal trigger detection
- [x] Implement basic doc URL fetching (fetch text, strip HTML)
- [x] Implement `required`/`optional` reconciliation logic (perceive + doc merge)
- [x] Write output to `prompts/sites/{site}.json` with `mappedAt`
- [x] Publish `yeshie/site-map/updated` Hermes event
- [x] Unit tests: tier ranking, doc parse, reconcile merge

**Completed:** 2026-04-14

---

### Phase 2: Auth Detection, Backup, Schema Validation, `site-map/failed` — 4 agent-hours

- [ ] Implement auth-expiry detection: post-navigate URL pattern check (`/login|/sign-in|/auth|/sso|/session`)
- [ ] Implement "page stable" check: 500ms network-idle + no `[aria-busy],[role='progressbar'],.loading`; 10s timeout then proceed
- [ ] Publish `yeshie/site-map/failed` on auth expiry (schema per this spec)
- [ ] Add backup-before-write: create `{payloadFile}.bak` with `backedUpAt` timestamp before any payload write
- [ ] Add Hermes event schema validation middleware (validate all published events against this spec's schemas before publishing; log malformed events to relay error log)
- [ ] Unit tests: auth redirect detection, page stable timeout, backup file creation

---

### Phase 2.5: Dry-Run Verification Harness — 6 agent-hours

> **Foundational — all triage phases depend on this.** Must be complete before Phase 3 begins.

- [ ] Implement `dry_run_check` step type in the relay
- [ ] Implement dry-run mode: `click`, `type`, `assert` resolve selectors but do NOT dispatch DOM events; `navigate`, `wait_for`, `perceive` run normally; `respond` skipped
- [ ] Implement dry-run result evaluation (all steps resolve → pass)
- [ ] Wire dry-run outcome into HEAL state machine (pass → publish `yeshie/payload/healed`; fail → increment triage level)
- [ ] Add `dryRunPassed` field population to `yeshie/payload/healed`
- [ ] End-to-end test: deliberately corrupt a post-level-1 patch, confirm dry-run failure triggers level 2

---

### Phase 3: HEAL Level 1 — Selector Fallback, Patch, Verify — 8 agent-hours

- [ ] Subscribe HEAL agent to `yeshie/payload/broken` Hermes channel
- [ ] Implement TTL check (read `mappedAt`, compare to now; treat absent `mappedAt` as 30+ days)
- [ ] Implement HEAL loop detection: if payload broken again within 15 minutes of a previous heal, skip to Level 3 with `escalationReason: "heal_loop_detected"`
- [ ] Implement fallback selector probe (try each fallback in tier order, 2s timeout each)
- [ ] Implement `abstractTarget` patch (update `cachedSelector`, `confidence`, `resolvedOn`; demote old selector to last fallback at 0.10 confidence)
- [ ] Write patched payload to disk (with `.bak` first — see Phase 2)
- [ ] Publish `yeshie/selector/patched`
- [ ] Enter dry-run verification (Phase 2.5 harness)
- [ ] Unit tests: fallback iteration, patch serialization, event schema validation, loop detection
- [ ] End-to-end test: introduce a selector drift, confirm auto-repair within 30s

---

### Phase 4: HEAL Level 2 — Remap Trigger, LLM Step Regeneration, Diff — 16 agent-hours

> **Hardest phase.** LLM-in-the-loop step regeneration with confidence routing.

- [ ] Implement structural change detection (page heading diff, field count delta ≥ 2, modal presence change)
- [ ] Implement `yeshie/site-map/request` publish with `correlationId` (UUID-generated per request)
- [ ] Implement `yeshie/site-map/updated` / `yeshie/site-map/failed` subscription filtered by `correlationId`
- [ ] Implement old-map vs. new-map structural diff computation
- [ ] Implement Field Identity Algorithm (Levenshtein ≤ 2 on label, selector overlap, `name` attribute match)
- [ ] Implement LLM step regeneration: structured prompt, parse `{ matched, newAbstractTarget, confidence, reasoning }` response
- [ ] Implement confidence routing: `≥ 0.75` → auto-heal; `0.50–0.74` → heal with `healConfidence: "low"`; `< 0.50` → escalate
- [ ] Implement TTL-triggered pre-remap for maps ≥ 7 days old before structural analysis
- [ ] Write patched payload to disk (backup first); publish `yeshie/payload/healed` after dry-run
- [ ] Integration test: rename a field, remove a modal → confirm remap + repair + `healConfidence` flag
- [ ] Performance test: level 2 heal completes within 3-minute budget on YeshID staging

---

### Phase 5: Hermes Integration, Concurrent Queue, Schema Validation Middleware — 8 agent-hours

- [ ] Implement concurrent heal queue: one payload at a time per file (SI-5); events for different files processed concurrently
- [ ] Implement escalation condition detection (step count delta ≥ 3, intent mapping failure, `site-map/failed` arrival)
- [ ] Implement `structuralDiff` computation for `yeshie/heal/escalated` events
- [ ] Implement human-readable escalation reason generation
- [ ] Publish `yeshie/heal/escalated` with full diff; confirm payload NOT modified
- [ ] Confirm schema validation middleware catches malformed events (integration test)
- [ ] End-to-end test: fundamental redesign scenario → confirm escalation event shape

---

### Phase 6: Integration Tests — Live YeshID + Okta — 8 agent-hours

- [ ] End-to-end test: level 1 heal on YeshID staging (CSS class rotation)
- [ ] End-to-end test: level 2 heal on YeshID staging (field rename, modal replaced by wizard)
- [ ] End-to-end test: level 3 escalation on YeshID staging (page flow restructure)
- [ ] End-to-end test: auth expiry mid-map → `site-map/failed` published
- [ ] End-to-end test: Okta SSO page mapping (cross-site payload)
- [ ] Validate all five Hermes channels carry correctly-shaped event payloads
- [ ] 30-day TTL remap trigger: nightly scheduled job checks all map ages

---

### Phase 7: Observability, Operator Dashboard, Load Test — 12 agent-hours

- [ ] Add relay error log for malformed event publishing attempts
- [ ] Implement operator dashboard: healed payloads, escalated payloads, map ages, `healConfidence: "low"` flags
- [ ] Write runbook: how to respond to a `yeshie/heal/escalated` event; how to promote `healConfidence: "low"` to confirmed
- [ ] Load test: 10 simultaneous broken events, confirm no race conditions in concurrent queue
- [ ] Load test: 30-page site-mapper run, confirm ≤ 5-minute wall-clock budget

---

### Timeline Summary

| Phase | Description | Agent-hours | Notes |
|---|---|---|---|
| 1 | site-mapper core | ✅ Done | Completed 2026-04-14 |
| 2 | Auth detection, backup, schema validation, `site-map/failed` | 4h | |
| 2.5 | Dry-run harness | 6h | **Foundational — blocks P3+** |
| 3 | HEAL Level 1 (selector fallback) | 8h | |
| 4 | HEAL Level 2 (LLM regen, diff) | 16h | Hardest phase |
| 5 | Hermes integration, queue, escalation | 8h | |
| 6 | Integration tests (YeshID + Okta live) | 8h | |
| 7 | Observability, dashboard, load test | 12h | |
| **Total** | | **~62 agent-hours** | **~3 days clock time with 4 agents** |

---

## Worked Examples

### Example A: Selector Drift Heal (Triage Level 1)

**Scenario:** YeshID deploys a front-end update that rotates the CSS class on the "Add User" button from `#add-user-btn` to a new auto-generated ID. The `aria-label` attribute remains intact.

**Initial payload step (step index 3):**
```json
{
  "type": "click",
  "abstractTarget": {
    "name": "add_user_button",
    "description": "Opens the Add User dialog",
    "cachedSelector": "#add-user-btn",
    "cachedConfidence": 0.95,
    "resolvedOn": "2026-03-01T09:00:00Z",
    "fallbacks": [
      { "selector": "[aria-label='Add User']", "confidence": 0.88 },
      { "selector": "button[data-action='add-user']", "confidence": 0.82 },
      { "selector": "button:contains('Add User')", "confidence": 0.65 }
    ]
  }
}
```

**What happens:**

1. Relay executes step 3. `#add-user-btn` not found after 3 retries (5 second timeout each).
2. Relay publishes `yeshie/payload/broken` with `perceiveSnapshot.buttons: ["Add User", "Export", "Filter"]`.
3. HEAL receives event. Site map age: 2 days. TTL < 30 days → no forced remap.
4. **Triage Level 1:** HEAL probes fallbacks in order:
   - `[aria-label='Add User']` → element found within 800ms ✓
5. HEAL patches the abstractTarget:
   ```json
   {
     "cachedSelector": "[aria-label='Add User']",
     "cachedConfidence": 0.88,
     "resolvedOn": "2026-04-14T10:30:18Z",
     "fallbacks": [
       { "selector": "button[data-action='add-user']", "confidence": 0.82 },
       { "selector": "button:contains('Add User')", "confidence": 0.65 },
       { "selector": "#add-user-btn", "confidence": 0.10 }
     ]
   }
   ```
   (Old `cachedSelector` demoted to last fallback with confidence 0.10 — retained for diagnostic purposes.)
6. Writes patched payload to disk.
7. Publishes `yeshie/selector/patched` (total elapsed: 14.2 seconds).
8. Runs dry-run: step 3 resolves `[aria-label='Add User']` successfully. All steps pass.
9. Publishes `yeshie/payload/healed`.

**Human sees:** Nothing — the next scheduled run of the payload succeeds automatically.

---

### Example B: Structural Change Requiring Remap (Triage Level 2)

**Scenario:** YeshID replaces the "Add User" modal with a full-page wizard at a new route `/admin/users/new`. The old modal button and all modal-specific selectors are gone. The page now shows "Invite User" as the primary action, which navigates to the new wizard.

**What happens:**

1. Relay executes step 3 (click `add_user_button`). All selectors exhausted after probing:
   - `#add-user-btn` → not found.
   - `[aria-label='Add User']` → not found.
   - `button[data-action='add-user']` → not found.
   - `button:contains('Add User')` → not found.
2. Relay publishes `yeshie/payload/broken`. `perceiveSnapshot.buttons: ["Invite User", "Export", "Filter"]`.
3. HEAL receives event. Site map age: 3 days. TTL < 30 days → no forced remap at this stage.
4. **Triage Level 1:** All fallbacks exhausted → escalate to level 2.
5. **Triage Level 2:**
   a. Site map age: 3 days. < 7 days → proceed without pre-remap.
   b. HEAL invokes site-mapper on `https://app.yeshid.com/admin/users` and `https://app.yeshid.com/admin/users/new`.
   c. site-mapper runs, perceives both pages, discovers new wizard structure, writes updated `prompts/sites/app.yeshid.com.json`.
   d. Publishes `yeshie/site-map/updated`.
   e. HEAL receives the updated map. Computes diff:
      - `pagesModified[0].buttonsOld: ["Add User", ...]` → `buttonsNew: ["Invite User", ...]`
      - `pagesModified[0].modalsOld: ["add_user_modal"]` → `modalsNew: []`
      - New page `https://app.yeshid.com/admin/users/new` added to map.
   f. HEAL determines that step 3 (click "Add User") maps to new action: click "Invite User" button → navigate to `/admin/users/new`.
   g. HEAL rewrites steps 3–7 of the payload:
      - Step 3: click `[data-testid='invite-user-btn']` (tier 2, confidence 0.93)
      - Step 4: `wait_for` URL to contain `/admin/users/new`
      - Steps 5–7: rewritten field selectors from new wizard map.
   h. Writes patched payload to disk.
6. Publishes `yeshie/payload/healed`? Not yet — dry-run first.
7. **Dry-run:** Navigates to `/admin/users`, resolves `[data-testid='invite-user-btn']` ✓, navigates to new wizard, resolves all field selectors ✓. All steps pass.
8. Publishes `yeshie/payload/healed` (total elapsed: 2 minutes 31 seconds).

**Human sees:** A `yeshie/site-map/updated` event in the log, and on the next scheduled run the payload executes successfully against the new wizard UI.

---

## Open Questions

1. **Authentication boundary during site-mapper:** Should site-mapper verify that the session is alive before starting, or is that the operator's responsibility? If a session expires mid-map, how should the partial map be handled?

2. **Multi-site payload steps:** Some payloads navigate between two sites (e.g., YeshID → Okta for SSO verification). Should HEAL trigger site-mapper for all affected sites, or only the site where the failing step lives?

3. **Dry-run for `type` steps with sensitive values:** If a `type` step inputs a password or API key, the dry-run still resolves the target field selector. Is this safe? Should dry-run steps be given a sentinel value instead of the real value?

4. **Conflict resolution for `perceive` vs. doc for `required` field:** Currently `doc` wins over `perceive`. Should there be a third source — `submission_error` (observed from a failed form submit) — with even higher authority? If yes, that requires write permissions during mapping, which conflicts with SI-7.

5. **Site-mapper TTL per-page vs. per-site:** Currently TTL is per site context file. Some pages within a site change more frequently than others. Should TTL be configurable per-URL?

6. **HEAL and parallel step execution:** Future payloads may support parallel step execution (two browser tabs simultaneously). How does HEAL handle a broken event when the step is part of a parallel group?

---

## References

[1] Hermes MCP pub/sub protocol — internal Yeshie documentation — Accessed 2026-04-14  
[2] Chrome Extension `perceive` action implementation — `extension/content/perceive.js` — Accessed 2026-04-14  
[3] Relay endpoint reference — `relay/README.md` — Accessed 2026-04-14  
[4] Existing site context files — `prompts/sites/app.yeshid.com.md`, `prompts/sites/okta.md` — Accessed 2026-04-14  
[5] Payload file schema — `sites/app.yeshid.com/tasks/*.payload.json` — Accessed 2026-04-14  
[6] W3C ARIA Authoring Practices Guide (selector stability reference) — https://www.w3.org/WAI/ARIA/apg/ — Accessed 2026-04-14  
[7] CSS Selector specificity and stability analysis — https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity — Accessed 2026-04-14  

---

*Spec version 1.1.0 — revised 2026-04-14 (5 critical blockers addressed). Next review due: 2026-05-14.*
