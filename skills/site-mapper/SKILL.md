# Site-Mapper Skill

Maps a web application's page structure, discovers interactive selectors, fetches available docs, and writes structured site context files for use by Yeshie agents.

---

## Input

| Parameter | Type | Description |
|-----------|------|-------------|
| `siteId` | string | Short identifier for the site (e.g. `"yeshid"`, `"okta"`, `"rippling"`) |
| `urls` | string[] | List of page URLs to map |
| `docUrls` | string[] (optional) | Explicit help/doc URLs to fetch in addition to auto-discovery |

---

## Output

Two files are written after a successful mapping run:

1. **`~/Projects/yeshie/prompts/sites/{siteId}.map.json`**
   Structured machine-readable context following `SCHEMA.map.json`.

2. **`~/Projects/yeshie/prompts/sites/{siteId}.md`** (or `{hostname}.md`)
   Human-readable context file updated with a `<!-- mappedAt: ISO8601 -->` header and a selector reference table per page.

---

## Procedure

### Step 1 — Navigate to each URL

For each URL in the `urls` list:

```
mcp__Control_Chrome__open_url({ url, new_tab: false })
```

Wait for the page to stabilize (DOMContentLoaded) before proceeding. If the page requires authentication and redirects, note the redirect target and continue mapping from there.

---

### Step 2 — Auth-redirect guard (run before perceive)

Before calling the perceive relay, verify the browser did not land on an auth page.

**Check current URL against auth patterns:**

```
AUTH_PATTERNS = ['/login', '/sign-in', '/auth', '/sso', '/session', 'okta.com/login', 'accounts.google.com']
After navigate: if current URL matches any pattern → halt, emit site-map/failed event
```

Use `mcp__Control_Chrome__get_current_tab` (or equivalent) to read the current URL, then test:

```javascript
const AUTH_PATTERNS = ['/login', '/sign-in', '/auth', '/sso', '/session', 'okta.com/login', 'accounts.google.com'];
const isAuthRedirect = AUTH_PATTERNS.some(p => window.location.href.includes(p));
if (isAuthRedirect) { /* halt */ }
```

If a match is found:
1. **Halt** — do not proceed with perceive or any further mapping for this URL.
2. **Emit** a `site-map/failed` Hermes event:
   ```json
   {
     "correlationId": "<correlationId>",
     "siteId": "<siteId>",
     "failureReason": "auth_expired",
     "failedUrl": "<current URL>",
     "timestamp": "<ISO 8601>"
   }
   ```
3. Mark the page entry with `"status": "auth-required"` in the output JSON.
4. Continue to the next URL in the list (do not abort the entire mapping run).

Auth pattern definitions are maintained in `auth-patterns.json` in this skill directory.

---

### Step 3 — Perceive the page structure

Run the Yeshie perceive relay to get structured page context:

```
POST localhost:3333/run
Body: { "action": "perceive" }
```

Expected response shape:
```json
{
  "headings": ["People", "Add Person", ...],
  "buttons": [{ "label": "Add", "selector": "button[data-testid='add-btn']" }],
  "fields":  [{ "name": "email", "type": "email", "selector": "input[name='email']", "required": true }],
  "mainActions": ["Search", "Filter", "Export"],
  "tables": [{ "id": "people-table", "columns": ["Name", "Email", "Role"] }]
}
```

If the relay is unavailable, fall back to direct DOM inspection via `mcp__Control_Chrome__execute_javascript`:

```javascript
Array.from(document.querySelectorAll('input, select, textarea, button')).map(el => ({
  tag: el.tagName,
  type: el.type || null,
  name: el.name || null,
  id: el.id || null,
  placeholder: el.placeholder || null,
  ariaLabel: el.getAttribute('aria-label'),
  dataTestId: el.getAttribute('data-testid'),
  required: el.required || el.getAttribute('aria-required') === 'true',
  classes: el.className?.substring(0, 80) || null
})).filter(el => el.name || el.ariaLabel || el.placeholder || el.dataTestId)
```

Also collect headings and landmark regions:
```javascript
({
  headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.innerText.trim()).filter(Boolean),
  landmarks: Array.from(document.querySelectorAll('[role="main"],[role="navigation"],[role="dialog"]')).map(el => ({
    role: el.getAttribute('role'), id: el.id, label: el.getAttribute('aria-label')
  }))
})
```

---

### Step 4 — Fetch help documentation

Auto-discover doc sources by probing common paths on the same origin:

```
/help, /docs, /support, /faq, /guide, /getting-started
```

Also scan the perceive output for links containing `help`, `doc`, `support`, `guide` in their href.

For each doc URL found, fetch the page text:
```
mcp__Control_Chrome__open_url({ url: docUrl, new_tab: false })
// then get_page_text or execute_javascript to extract content
```

Record all successful doc URLs in `docSources[]`.

---

### Step 5 — Classify fields

For each field discovered in Step 2:

- **Required** if any of:
  - DOM `required` attribute is true
  - `aria-required="true"`
  - Label text contains `*` or `(required)` (case-insensitive)
  - Help docs describe the field as required

- **Optional** otherwise (default)

Add `required: true/false` to each field entry in the output.

---

### Step 6 — Detect multi-step controls

Look for patterns that require more than one interaction:

| Pattern | Detection |
|---------|-----------|
| **Date picker** | `input[type="date"]`, or input that triggers a calendar element on focus (`[role="dialog"]`, `.calendar`, `.datepicker`) |
| **Search-then-select** | Input with associated `[role="listbox"]` or `[role="combobox"]`; typing reveals a dropdown list |
| **Modal trigger** | Button that produces `[role="dialog"]` or `.modal` |
| **Tooltip trigger** | Element with `data-tooltip` or `aria-describedby` pointing to a tooltip |

Emit each multi-step control as:
```json
{
  "type": "date-picker",
  "triggerSelector": "input[name='startDate']",
  "pickerSelector": "[role='dialog'].date-picker",
  "steps": ["click trigger", "select month/year", "click day cell"]
}
```

---

### Step 7 — Rank selector stability

For every interactive element, assign a **stabilityTier** (1 = most stable):

| Tier | Attribute |
|------|-----------|
| 1 | `[data-testid]` |
| 2 | `[aria-label]` |
| 3 | `[name]` |
| 4 | Stable semantic class (no hash suffix) |
| 5 | `#id` |
| 6 | Dynamic/generated class or positional selector |

Choose the highest-tier (lowest number) available attribute as the primary selector.
Store lower-tier alternatives in `fallbacks[]`.

---

### Step 8 — Write output files

**Structured JSON** (`{siteId}.map.json`):

```json
{
  "siteId": "<siteId>",
  "mappedAt": "<new Date().toISOString()>",
  "mappedBy": "site-mapper/1.0",
  "docSources": [],
  "pages": {
    "<pathname>": {
      "title": "<document.title or h1>",
      "url": "<full URL>",
      "selectors": {
        "<logical-name>": {
          "selector": "<primary selector>",
          "stabilityTier": <1-6>,
          "fallbacks": [],
          "verifiedAt": "<ISO8601>"
        }
      },
      "fields": [],
      "actions": [],
      "multiStepControls": []
    }
  }
}
```

**Human-readable Markdown** (`{siteId}.md` or `{hostname}.md`):

```markdown
<!-- mappedAt: <ISO8601> -->
<!-- mappedBy: site-mapper/1.0 -->

# Site Map: <siteId>

## Pages

### <title> (`<pathname>`)

**URL:** <full URL>

**Selectors**

| Name | Selector | Tier | Fallbacks |
|------|----------|------|-----------|
| ... | ... | ... | ... |

**Fields**

| Name | Type | Required | Selector |
|------|------|----------|----------|

**Multi-step Controls**

| Type | Trigger | Steps |
|------|---------|-------|
```

After writing, log:
```
✅ site-mapper: wrote {siteId}.map.json ({N} pages, {M} selectors)
✅ site-mapper: updated {siteId}.md
```

---

## Notes

- If a page redirects to login, skip it and note `"status": "auth-required"` on that page entry.
- Re-running the mapper merges new selectors into the existing file; it does not overwrite selectors that already have a higher stability tier.
- The `verifiedAt` timestamp on each selector should be updated every time the mapper successfully interacts with that element.
- Keep `fallbacks[]` to a maximum of 3 alternatives.
