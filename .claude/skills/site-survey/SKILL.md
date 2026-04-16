# Site Survey Skill

Produce a complete, accurate map of what a site lets you do and how to do it —
good enough that someone who has never seen the site could write automation for it.

The output of this skill is the input to payload authoring. Keep it simple and
human-readable. A complete simple record beats a sophisticated incomplete one.

---

## Phase 1 — Read the Documentation

Go to the site's documentation (docs_url). Read enough to produce a plain-English
capability list:

- Add a person to the organization
- Remove a person from the organization
- View who has access to which apps
- Connect a new application

This is your **capability vocabulary**. One sentence per item, active voice, no
jargon. If something is vague ("manage access") flag it and return when you see
the UI. Note features that seem undocumented or incomplete.

Write this list to survey.md under: ## Capabilities (from docs)

---

## Phase 2 — Survey the Application

Start at the home/overview page. Read the site the way a thoughtful new employee
would on their first day — methodically, not randomly.

### Navigation rule

Follow the top-level navigation. Go one level deep from each item. If a page has
tabs, open each tab. If an action opens a modal or drawer, open it and record
what's inside. Stop there. Do not recurse further.

### For each page, record:

**What kind of page is this?**
One of: dashboard, list, form, detail view, settings, modal, drawer.
One sentence on what it is for.

**What can you do here?**
List every action in plain English using the label the UI shows.
"Onboard person" not "click the blue button top-right".

**How are the interactive elements identified?**
Use this priority order. Stop at the first that works:

1. data-cy or data-testid attribute → [data-cy="value"] or [data-testid="value"]
2. Meaningful class name (describes purpose, not appearance) → use it
3. Visible label text adjacent to the field → quote the label text
4. Button or link text → use the exact text shown in the UI
5. Placeholder text → acceptable fallback
6. Position relative to something stable → last resort, plain English

**What happens after the action?**
URL you land on. What confirms success: redirect, snackbar, count change.

### DOM inspection — run in browser console as needed

Find test-stable attributes:

    Array.from(document.querySelectorAll('[data-cy],[data-testid]'))
      .map(el => ({
        attr: el.getAttribute('data-cy') ? 'data-cy' : 'data-testid',
        value: el.getAttribute('data-cy') || el.getAttribute('data-testid'),
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().substring(0, 40)
      }))

Find all buttons (deduped):

    Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter(el => el.textContent?.trim())
      .map(el => el.textContent?.trim())
      .filter((v,i,a) => a.indexOf(v) === i)

Find labels and adjacent inputs:

    Array.from(document.querySelectorAll('label,[class*="label"]'))
      .filter(el => el.textContent?.trim())
      .map(el => ({ label: el.textContent?.trim(), sibling: el.nextElementSibling?.tagName }))

Find a stat by label text (text-anchored, stable across redesigns):

    const label = Array.from(document.querySelectorAll('*'))
      .find(el => el.children.length === 0 && el.textContent?.trim() === 'YOUR LABEL HERE');
    label?.nextElementSibling?.textContent?.trim()

---

## Phase 3 — Map and Gap Analysis

For each capability from Phase 1, fill in:

| What you can do | URL | Path to get there | Required inputs | Success signal |
|---|---|---|---|---|

Then add:

**In the app, not in the docs** — actions you found with no documentation.
**In the docs, not in the app** — documented features with no obvious UI.

---

## Anti-Patterns — Do Not Use These as Selectors

**Generated IDs**: #input-v-10, #checkbox-v-42
Assigned at render time. Change on every page load.

**Obfuscated classes**: .asfd8y73f, .css-1x2y3z
Build tool output. Meaningless and unstable.

**Pure styling classes**: .bg-white, .rounded-sm, .text-body-2, .elevation-1
Describes appearance not identity. Same class on hundreds of unrelated elements.

**Framework state classes**: .v-btn--variant-flat, .v-input--focused
Internal framework state. Not stable identifiers.

**Combination locks**: stacking five styling classes to pin one element.
Each class is fragile. Stacking makes a more fragile fragile selector.

**Element type alone**: div or span without meaningful context.
textarea.prompt-input is fine. div:nth-child(3) is not.

**The test for any class name:**
Would a developer have typed this thinking about what the element DOES?
  .prompt-input → yes     .bg-bold → no
  .search-input → yes     .v-btn--size-default → no

---

## Output Format

Write to sites/[sitename]/survey.md as you go.
Write each page when you visit it. Do not wait until the end.

    ## Capabilities (from docs)

    ## Pages

    ### [Page Title] — [URL]
    **Type:** dashboard / list / form / detail / settings
    **What you can do here:**
    - ...
    **Targets found:**
    - "Label text" → [data-cy="x"] input
    **After action:**
    - Redirects to /foo  OR  Shows snackbar "User created"

    ## Capability Map
    | What you can do | URL | Path | Inputs | Success signal |

    ## Gaps
    ### In the app, not in the docs
    ### In the docs, not in the app

---

## Parameters

- docs_url     — documentation site to read first
- app_url      — application home/overview URL
- output_dir   — where to write survey.md
- auth_note    — how authentication is handled (e.g. "logged in as X")

---

## Execution Rules (learned from first run)

**Starting Chrome with the debug port.**
The chrome-devtools MCP requires Chrome running with `--remote-debugging-port=9222`.
Use the `chrome-debug` or `chrome-debug-restart` alias (defined in ~/.zshrc).
These use `--user-data-dir=~/Library/Application Support/Google/ChromeDebug`, where
`ChromeDebug/Default` is a symlink to the main Chrome `Default` profile — so all
sessions (YeshID, Google, etc.) are already active. The main Chrome data dir does NOT
open the debug port; only ChromeDebug does.

    chrome-debug          # start debug Chrome alongside existing Chrome (non-destructive)
    chrome-debug-restart  # kill Chrome first, then start debug Chrome (preferred for surveys)

Verify port is open: `curl -s http://localhost:9222/json/version`

**Write before you navigate.**
Record each page's findings in survey.md BEFORE clicking away to the next page.
If you write at the end you will lose context. If the session expires mid-survey
you will have nothing. Write the section, then move on.

**Check session state before every page.**
Before navigating to each new page, verify you are still authenticated.
Signs of session expiry: redirect to /login, page title changes to "Sign In",
URL contains "login" or "auth". If this happens: stop, record it in survey.md,
and report it — do not continue as if you are still logged in.

A quick session check before each navigation:
Use `list_pages` from the chrome-devtools MCP and verify the target tab URL does not contain
`/login`. If it does, the session has expired — stop, record it in survey.md, and report it.

    # Or via shell if you need a non-MCP check:
    curl -s http://localhost:9222/json | python3 -c "
    import json,sys
    tabs=json.load(sys.stdin)
    t=[t for t in tabs if 'app.yeshid.com' in t.get('url','') and '/login' not in t.get('url','')]
    print('ok', t[0]['url'] if t else '— no authenticated yeshid tab found')
    "

**Go deep on forms — that is where the value is.**
The nav structure is easy. The hard part is: what fields does a form have,
what are they called, what are their stable identifiers?
Spend more time on forms than on list pages.
For every form field: try the data-cy snippet first, then label text.

**Write partial results explicitly.**
If you only get through half the pages before something goes wrong, write
"## Survey incomplete — stopped at [page]" and save what you have.
A partial survey is better than no survey.

---

## Phase 4 — Workflow Authoring

After Phase 3 is complete, produce `.payload.json` files for each high-value
capability. Place them in `sites/[sitename]/tasks/` numbered sequentially
after any existing payloads.

### Which capabilities get a payload?

Prioritise in this order:
1. Any form with confirmed `data-cy` selectors — write it first.
2. Any action that requires more than 2 navigation steps to reach.
3. Frequently-used admin operations (onboard, offboard, audit, import).
4. Skip read-only pages (dashboards, grids) — they need no automation.

### Payload structure

Every payload follows this schema (see existing tasks/ files for full examples):

```json
{
  "_meta": {
    "task": "kebab-case-task-name",
    "description": "One sentence: what this does.",
    "requiresAuth": true,
    "baseUrl": "https://site.example.com",
    "requiredParams": ["param1"],
    "optionalParams": ["param2"],
    "selfImproving": true,
    "runCount": 0,
    "lastSuccess": null,
    "prerequisite": "00-login.payload.json",
    "auth": { "type": "sso_automatable", "googleAccountEmail": "..." },
    "params": {
      "param1": { "required": true, "description": "..." }
    },
    "homeBookend": true,
    "verificationStrategy": {
      "pre": "what to perceive before acting",
      "post": "what to read after acting",
      "primaryVerification": "confirmation_message contains 'success keyword'"
    }
  },
  "runId": "site-task-name-{{timestamp}}",
  "mode": "learning",
  "site": "site.example.com",
  "params": { "param1": "{{param1}}", "base_url": "https://site.example.com" },
  "abstractTargets": { ... },
  "chain": [ ... ]
}
```

### abstractTargets rules

- If you have a `data-cy` value from the survey: set `cachedSelector` to
  `[data-cy="value"] input` (for text inputs) or `[data-cy="value"]` (for
  buttons/containers), `cachedConfidence: 0.95`.
- If you only have button text: use `name_contains`, `cachedSelector: null`,
  `cachedConfidence: 0.5`.
- Never use generated IDs, obfuscated classes, or nth-child selectors.

### chain step types

| action | when to use |
|---|---|
| `navigate` | go to a URL |
| `wait_for` | wait for selector or url_contains before next step |
| `perceive` | read page state before acting (always first step after nav) |
| `click` | click a target |
| `type` | fill a text input |
| `select` | choose a dropdown option |
| `upload` | set a file input |
| `read` | capture text from element into a named variable |

### Bookend rule

Every payload that modifies state MUST start and end at the home/overview URL:

```json
{ "stepId": "h0",  "action": "navigate", "url": "{{base_url}}/overview", "note": "HOME START" },
{ "stepId": "h0b", "action": "wait_for", "selector": "[data-cy=\"username\"]", "timeout": 5000 },
...
{ "stepId": "hZ",  "action": "navigate", "url": "{{base_url}}/overview", "note": "HOME END" },
{ "stepId": "hZb", "action": "wait_for", "selector": "[data-cy=\"username\"]", "timeout": 5000 }
```

### What makes a good payload

- Use confirmed `data-cy` selectors wherever available — prefer them over all else.
- Perceive before acting on any page you navigate to.
- Put a `wait_for` after every `navigate`.
- Write `note` on every step — these become the self-improvement training signal.
- For Vuetify 3 text inputs: the data-cy wrapper is on a DIV; the actual
  `<input>` is a child. Use `[data-cy="field-name"] input` as `cachedSelector`.
- For Vuetify 3 dropdowns/comboboxes: click the wrapper to open, then click the
  option inside `.v-list-item` matching the desired text.
