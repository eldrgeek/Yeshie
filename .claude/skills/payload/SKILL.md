---
name: yeshie:payload
description: >
  Payload authoring guide for Yeshie. Load this skill when you need to create or
  edit payload JSON files, understand abstractTarget fields, work with the HEAL
  self-improvement system, add a new site, or understand the sites/ directory structure.
  Trigger on: "write a payload", "edit a payload", "add a site", "abstractTarget",
  "cachedSelector", "HEAL", "resolvedVia", "payload format", "sites/".
---

# Yeshie — Payload Authoring

## Sites Directory Structure

```
sites/
└── yeshid/
    ├── site.model.json          ← L3 site state graph, cached selectors per-abstractTarget
    └── tasks/
        ├── 00-login.payload.json
        ├── 01-user-add.payload.json     ← validated
        ├── 02-user-delete.payload.json  ← validated
        ├── 03-user-modify.payload.json  ← validated
        ├── 04-site-explore.payload.json ← validated
        ├── 05-integration-setup.payload.json
        └── ...                          ← 00–19, q01–q02
```

Other sites exist (`admin.google.com`, `okta/`, `claude.ai/`, etc.) but fewer payloads are validated.

---

## Payload JSON — Top-Level Structure

```json
{
  "_meta": { ... },       // metadata, params spec, auth, verification
  "runId": "site-task-{{timestamp}}",
  "mode": "learning",     // "learning" | "verification" | "production"
  "site": "app.yeshid.com",
  "params": { ... },      // runtime param values ({{template}} syntax)
  "abstractTargets": { ... },  // named UI elements
  "chain": [ ... ]        // ordered steps
}
```

---

## `_meta` Fields

```json
{
  "_meta": {
    "task": "user-add",
    "description": "Human-readable description",
    "requiredParams": ["first_name", "last_name"],
    "optionalParams": [],
    "selfImproving": true,
    "runCount": 0,           // auto-incremented by improve.js
    "lastSuccess": null,     // ISO timestamp, set by improve.js
    "prerequisite": "00-login.payload.json",   // run this first if needed
    "auth": {
      "type": "sso_automatable",
      "googleAccountEmail": "mw@mike-wolf.com"
    },
    "params": {
      "first_name": {
        "required": true,
        "description": "First name"
      },
      "company_email": {
        "required": false,
        "derived": true,
        "derivationTemplate": "{first_name_lower}.{last_name_lower}@example.org",
        "confirmDerived": true
      }
    },
    "homeBookend": true,     // return to home page before and after
    "verificationStrategy": {
      "pre": "store initial state",
      "post": "store final state",
      "assertion": "final == initial + 1",
      "primaryVerification": "confirmation_message == 'Success'"
    }
  }
}
```

---

## `abstractTargets`

Named UI element definitions. The extension resolves these at runtime using the 7-step chain.

```json
"abstractTargets": {
  "first-name-input": {
    "match": "first name",        // semantic label to match
    "type": "input",              // "input" | "button" | "link" | "select"
    "data_se": "person-first-name-input",  // data-se attribute (if known)
    "anchors": ["#onboard-form"],          // CSS scoping hints
    "cachedSelector": "input[data-v-10]",  // written by improve.js after resolution
    "cachedConfidence": 0.92,
    "resolvedOn": "2026-04-14T00:00:00Z",
    "resolvedVia": "vuetify-sibling"
  }
}
```

### Key AbstractTarget Fields

| Field | Purpose |
|-------|---------|
| `match` | Semantic label — what text/aria-label identifies this element |
| `type` | `input`, `button`, `link`, `select`, `checkbox`, `text` |
| `data_se` | `data-se` attribute value (fast, stable selector on YeshID) |
| `anchors` | CSS selectors to scope the search area |
| `cachedSelector` | Written by `improve.js` after successful resolution; used first if confidence ≥ 0.85 and age < 30 days |
| `cachedConfidence` | 0.0–1.0; score assigned by the resolver |
| `resolvedOn` | ISO timestamp of last resolution |
| `resolvedVia` | Which resolution step succeeded (see below) |
| `fallbackSelectors` | Explicit CSS list; tried last if all 7 steps fail |

### `resolvedVia` Values

| Value | Step |
|-------|------|
| `cached` | Step 1: cached selector, confidence ≥ 0.85, age < 30d |
| `vuetify-label` | Step 2: `.v-label` inside `.v-input` |
| `vuetify-sibling` | Step 3: `div.mb-2` sibling label walk |
| `table-row` | Step 3b: `<td>Label</td><td><input></td>` pattern |
| `aria-placeholder` | Step 4: `aria-label` or `placeholder` match |
| `name-contains` | Step 5: button text match |
| `fallback` | Step 6: explicit `fallbackSelectors` list |

---

## Chain Steps

Each step in `chain` is an object with an `action` field:

```json
{
  "action": "navigate",
  "url": "{{base_url}}/organization/people/onboard",
  "stepId": "nav-to-onboard"
}
```

```json
{
  "action": "type",
  "target": "first-name-input",    // references abstractTargets key
  "value": "{{first_name}}",
  "stepId": "type-first-name"
}
```

```json
{
  "action": "click",
  "target": "submit-button",
  "stepId": "click-submit"
}
```

```json
{
  "action": "wait_for",
  "condition": "url_contains",
  "value": "/people",
  "timeout": 5000,
  "stepId": "wait-for-nav"
}
```

```json
{
  "action": "read",
  "target": "confirmation-message",
  "storeAs": "confirmation_text",
  "stepId": "read-confirm"
}
```

```json
{
  "action": "assess_state",
  "storeAs": "h0c",
  "stepId": "store-initial-state"
}
```

```json
{
  "action": "js",
  "code": "rows.find(r => r.textContent.includes('{{user_identifier}}'))",
  "stepId": "find-user-row"
}
```

**All action types:** `navigate`, `type`, `click`, `wait_for`, `read`, `assess_state`, `js`, `find_row`, `click_text`, `hover`, `scroll`, `select`, `click_preset`, `probe_affordances`, `delay`

---

## HEAL — Self-Improvement System

After a successful run, merge resolved selectors back into the payload:

```bash
node ~/Projects/yeshie/improve.js \
  sites/yeshid/tasks/03-user-modify.payload.json \
  /tmp/chain-result.json
```

**What `improve.js` does:**
1. Reads the ChainResult (from `/tmp/chain-result.json` or relay log)
2. For each step that resolved an abstractTarget, reads `resolvedVia`, `resolvedOn`, `cachedSelector`, `cachedConfidence`, `signaturesObserved`
3. Writes these fields back into the payload's `abstractTargets`
4. Increments `_meta.runCount`, sets `_meta.lastSuccess`
5. When `runCount >= 5`, promotes `mode` from `learning` → `verification` → `production`

**Accepts both canonical and legacy field names** in the ChainResult.

---

## Adding a New Site

1. Create `sites/{domain}/` directory
2. Create `sites/{domain}/site.model.json` (L3 state graph):
   ```json
   {
     "site": "example.com",
     "framework": "vuetify3",
     "states": { ... },
     "cachedSelectors": {}
   }
   ```
3. Create `sites/{domain}/tasks/` and add payload files
4. If non-Vuetify, add `models/generic-{framework}.model.json` for L2 patterns
5. Run `04-site-explore` equivalent to discover pages, buttons, inputs
6. Author task payloads based on discovered affordances

---

## YeshID-Specific Patterns

| Pattern | Detail |
|---------|--------|
| `div.mb-2` sibling | Labels appear as sibling `div.mb-2` above `.v-input` — NOT `.v-label` inside `.v-input` |
| Edit form table rows | `<td>First name</td><td><input></td>` pattern — resolved via Step 3b |
| View vs Edit mode | Detail page is read-only; must click "Edit" button to make inputs appear |
| Save button label | "Confirm" not "Save" — include both in `name_contains` |
| Generated IDs | `input-v-10`, `input-v-12` change every page load — never hardcode in `cachedSelector` |
| `data-se` attributes | Stable across sessions — prefer these when available |

---

## `js` Action and CSP

YeshID blocks `eval()`. The `js` action code string is **not evaled** — instead `PRE_RUN_DOMQUERY` in `background.ts` pattern-matches it and routes to a pre-bundled function:

| Code pattern | Routes to |
|-------------|-----------|
| `rows.find(r =>` or `find(r =>` | `PRE_FIND_ROW_AND_CLICK(identifier)` |
| `btns` or `button` | keyword button search |
| `checkbox` | checkbox click pattern |
| `clearAndType` / `findVuetifyInput` | Vuetify field modification |
| `nativeInputValueSetter` | React/Vue textarea injection |

All executed via `chrome.scripting.executeScript` (pre-bundled, bypasses CSP).


---

## React / Vue DOM Gotchas

These patterns are required when injecting into React-controlled or Vue-controlled textareas.

### nativeInputValueSetter (React value injection)

Standard `.value =` assignment doesn't trigger React's synthetic event system. Use:

```js
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
nativeInputValueSetter.call(inputEl, newValue);
inputEl._valueTracker.setValue(previousValue); // tricks React into seeing a "change"
inputEl.dispatchEvent(new Event('input', { bubbles: true }));
```

Then press Enter or click the send button. This is documented in SPECIFICATION.md.

**When to use:** Any React textarea where `.value =` + `dispatchEvent` doesn't fire the handler
(e.g. ChatGPT-style prompt boxes, any React-controlled `<textarea>`).

### Vue 3 / Vuetify typed input

Use `chrome.debugger Input.insertText` — produces `isTrusted: true` events that Vue 3 v-model
requires. Regular `.dispatchEvent` with `isTrusted: false` is ignored by Vue 3.
