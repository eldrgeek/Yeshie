# script.google.com — Site Context

**Purpose:** Google Apps Script IDE and project management. Used to create, edit, and deploy server-side JavaScript that runs on Google's infrastructure with access to Google Workspace APIs.

## Site Structure

| URL | Description |
|-----|-------------|
| `https://script.google.com/home` | Project list dashboard |
| `https://script.google.com/home/usersettings` | **Per-account settings.** One setting: the Google Apps Script API on/off toggle. Gates `clasp` and every Apps Script API call. |
| `https://script.google.com/d/<SCRIPT_ID>/edit` | Editor for a specific script |
| `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` | Deployed web app execution URL |

## Multi-account handling (learned 2026-08-02)

script.google.com is a multi-account Google surface. **Every setting on `/home/usersettings` is per-account**, so acting on the wrong account is a silent wrong answer: the toggle turns green, the page looks identical, and the CLI you were trying to unblock keeps failing.

**Authoritative account signal** — the Google bar avatar's `aria-label`:

```
Google Account: Mike Wolf  \n(mw.personalmail@gmail.com)
```

Assert on it with `[aria-label*="<email>"]` as a **hard** `wait_for` (no `onTimeout: continue`) *before* touching any control. `dumpText('@')` is a good secondary probe — on this page the only short text leaf containing `@` is the signed-in account email (the giant `window.WIZ_global_data` script is excluded because `dumpText` caps leaves at 100 chars).

**authuser:** on Mike's `ChromeMain` profile, `mw.personalmail@gmail.com` is the **default** session (`u/0`, no `authuser` param) — the expected `authuser=1` was *not* needed. Don't assume; assert. If another account needs it, pass `?authuser=N` on the settings URL.

**Account convention:** Google-native work belongs to `mw.personalmail@gmail.com`, not the legacy Workspace account `mw@mike-wolf.com` (see `reference_google_account_topology`). `clasp` is authorized for both via named profiles — `clasp -u personal` = personal Gmail, bare `clasp` = `mw@mike-wolf.com`.

## The `/home/usersettings` page (master/detail)

The page renders **two** `span[role="tabpanel"]` panels. The extra class `KKjvXb` marks the visible one.

1. **List panel** (visible on load) — `div[role="button"][jsname="BJHtg"]` containing the label `Google Apps Script API` and a state div reading `On`/`Off`.
2. **Detail panel** (hidden on load) — holds a "Back to Settings" button and the actual toggle.

```html
<div class="sozkvb" jsname="BJHtg" tabindex="0" role="button">
  <div class="oOo0Df">Google Apps Script API</div>
  <div class="LAdkW" jsname="qv0qaf">Off</div>
</div>
...
<div class="LsSwGf tM4CH" jscontroller="EcW08c" jsshadow jsname="EvAjje"
     aria-label="Toggle allow Google Apps Script API" role="checkbox" aria-checked="false">
```

The toggle **exists in the DOM from first paint but has a zero bounding rect** until the list row is clicked, so a coordinate click on it fails until you open the detail panel. Click the row first.

**State of record is `aria-checked`, not the text.** `aria-checked` flips synchronously; the `On`/`Off` text label re-renders a beat later, after the server round-trip. Verified live: a `wait_for aria-checked="true"` matched while an immediately following read of the label still returned `Off`. Never verify on the label alone.

**Idempotency gate.** `div:has(> [aria-label="Toggle allow Google Apps Script API"][aria-checked="false"])` matches *only* while the API is off. `read` stores `null` when nothing matches, `interpolate()` renders `null` as `''`, and a `step.condition` of `''` is falsy — so gating the click on that read makes the recipe safely re-runnable. Without a gate, a second run would toggle the API back **off**.

## Editor Environment

- **Code editor:** Monaco editor (not CodeMirror). Accessible as `monaco.editor.getModels()[0]` from the page's global scope.
- **Content injection:** Use `js` action with `monaco.editor.getModels()[0].setValue(code)` to replace editor content programmatically. Base64-encode the source code to avoid JSON escaping issues: `atob(b64)` decodes it at runtime.
- **Project title:** Clicking the project title text at top of editor enters inline rename mode. The renamed input is near the top nav bar.
- **Save:** Cmd+S via `document.dispatchEvent(new KeyboardEvent('keydown', {key:'s', metaKey:true, bubbles:true}))`. GAS also auto-saves every few seconds.

## Deploy Flow (New Deployment Dialog)

1. Click **Deploy** button (top-right toolbar) → dropdown opens
2. Click **New deployment** → dialog opens
3. Click **gear icon** next to "Select type" → type menu opens
4. Select **Web app** → form shows Description, Execute as, Who has access
5. Fill fields, click **Deploy**
6. If first deploy: **Authorization required** screen → click **Authorize access** → OAuth popup on `accounts.google.com`
7. In OAuth popup: click **Allow** to grant DocumentApp (or other) scopes
8. Popup closes → deployment completes → Web app URL shown

> **Consent boundary.** Flipping a per-account *setting* (the Apps Script API toggle) is fine for Yeshie. Approving an **OAuth scope grant** is not — if an "Authorization required" / "Allow" screen appears, stop and escalate to Mike.

## Web App URL Pattern

```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

Capture via JS: `document.body.innerText.match(/https:\/\/script\.google\.com\/macros\/s\/[^\s"'<>]+\/exec/)`

## Abstract Target Notes

| Target | Selector hint |
|--------|---------------|
| Google Apps Script API toggle | `[aria-label="Toggle allow Google Apps Script API"]` (`role=checkbox`, state in `aria-checked`) |
| Settings list row | `div[role="button"][jsname="BJHtg"]`; better reached by `click_text "Google Apps Script API"` with `trusted: true` |
| Active-account assertion | `[aria-label*="<email>"]` on the Google bar avatar |
| Project title input | `input` near top nav, appears on click of project name |
| Deploy type gear | Button in New Deployment dialog, before/near "Select type" label |
| Description field | First `input` in deployment form |
| Execute as | `select` or `mat-select` labeled "Execute as" |
| Who has access | `select` or `mat-select` labeled "Who has access" |
| Allow button (OAuth) | `#submit_approve_access` or `[data-value="Allow"]` on `accounts.google.com` |

## jsaction / jsshadow controls — `trusted: true` beats them

Google's UI here is Closure/jsaction: controls carry `jscontroller`, `jsshadow`, and `jsaction="click:cOuCgd; mousedown:UX7yZ; mouseup:lbsD7e; …"`. `element.click()` and synthetic events routinely fail to drive them.

**`click` / `click_text` with `trusted: true` works.** That path goes through `trustedCoordClick` → `chrome.debugger` → CDP `Input.dispatchMouseEvent`, i.e. genuinely trusted browser input at the element's centre coordinates. It flipped the Apps Script API toggle first try on 2026-08-02.

✅ **The `deploy-apps-script.payload.json` "CONFIRMED BLOCKER" is retired.** It claims the deployment-type `[role="menuitemcheckbox"]` is untoggleable and asks for a new `jsaction_trigger` action. On the 2026-08-02 runtime the sibling control `[role='menuitemcheckbox'][aria-label='Editor Add-on']` in the *same* menu flips `aria-checked` to `true` with **both** `trusted: true` (1/1) **and** plain non-trusted `element.click()` (4/4). No new action type is needed. The original failure was almost certainly target mis-resolution or a mistimed click, not `jsaction`. (The literal "Web app" checkbox in the New-deployment dialog was not itself re-tested — that bonus was descoped after a watchdog stall.)

## Runtime gotchas that bite on this site

- **Pre-chain auth check will eat your recipe.** `getAuthConfig()` defaults `authType` to `sso_automatable` (a legacy `app.yeshid.com` default). If `params.base_url`'s host equals the already-open tab's host, the runtime runs a YeshID-shaped login heuristic against script.google.com, decides it's unauthenticated, tries to navigate to `<base_url>/login`, waits 120s, and fails the chain with `Authentication failed — user did not complete login within timeout` and **zero steps executed**. Any recipe for a site where Chrome is already signed in must set `_meta.auth.type: "none"` (and `_meta.skipAuthCheck: true`). This is order-dependent and therefore intermittent: it only fires when a tab is *already* on the target host.
- **No arbitrary JS.** The `js` action is a pattern allowlist (`PRE_RUN_DOMQUERY`, MV3 CSP), not `eval`. Only `pageScan()`, `dumpText('kw')`, `statByLabel()`, `paginationTotal()`, `tableRowCount()`, `window.__var__`, and the row/button/checkbox/field patterns work. Anything else returns `{__error: 'No matching pattern for js step'}` and **fails the step**.
- **`wait_for` does not interpolate `selector`** — only `url_pattern`, and `target` as a "last resort literal". To parameterise a wait's selector (e.g. `{{account}}`), pass it as `target` and make sure no `abstractTargets` key collides with that string.
- **Params must be sent top-level to the relay.** `payload.params` is *not* auto-merged by the extension. `POST /run` or `/run/async` with `{payload, params, timeoutMs}`. `scripts/run-async.mjs` interpolates `payload.params` client-side and sends no `params` — so `params.base_url` tab-targeting is lost on that path.
- **Set `params.base_url`** so the runtime targets a script.google.com tab instead of whatever tab is active. Mike uses this browser live.
- **`read` short-circuits.** `PRE_GUARDED_READ` returns on the first element matching a candidate *even when its text is null*, so a loose early selector masks later good candidates. Anchor reads semantically with `:has()` (Chrome 150 supports it).
- **Session churn.** script.google.com periodically spawns an `accounts.google.com/RotateCookiesPage` iframe and can replace the tab's CDP target id mid-session. Don't hold a target id across steps.
- **`{"_": "PHASE …"}` comment entries** execute as real steps and return `status: 'unsupported'` with a null `stepId`. Harmless — they don't affect `goalReached`/`success` — but expect them in `stepResults`.

## Known Anomalies (editor / deploy)

- GCP SPA: each navigation takes 3-5s to fully render
- Monaco initialization takes ~3-4s after page load — include `delay 5000` before `js` injection
- Project name is "Untitled project" on creation; click the title text to rename inline
- The gear icon for deploy type may have `aria-label="Select type"` or similar
- Authorization may be skipped if the Google account already granted DocumentApp scope to a previous script
- `Execute as: Me` requires the deploying account to have DocumentApp access to the target Doc

## Authorization Popup Handling

The OAuth consent popup opens at `accounts.google.com`. Chrome may focus it as a new tab. Since the popup is cross-origin from `script.google.com`, JavaScript cannot inject into it from the parent window. Yeshie must either:

1. Follow the new tab (if Chrome brings it to focus) and run `click_text "Allow"` there
2. Or use `perceive` to detect the current URL, then dispatch `click_text "Allow"` if on `accounts.google.com`

If Yeshie cannot follow the popup, the authorization step becomes a manual blocker — note in the SOMA report. **Granting scopes is Mike's call, not Yeshie's.**

## Test deployments — a DIFFERENT dialog from New deployment (learned 2026-08-02)

`Deploy ▸ Test deployments` and `Deploy ▸ New deployment` are separate dialogs. The Test-deployments dialog is where an **editor add-on** gets installed for the signed-in user.

**Skip the Deploy dropdown.** `[role='menuitem'][aria-label='Test deployments']` is in the DOM from first paint with a **zero rect**. A plain non-trusted `element.click()` on it opens the dialog directly — 4/4 live. Driving the visible dropdown (`click_text "Deploy"` then the item) failed ~50% of runs because the Deploy button toggles and a mistimed click closes the menu.

**Flow for an editor add-on (there is no Install button):**

1. click `[role='menuitem'][aria-label='Test deployments']` (non-trusted)
2. gear `[aria-label='Enable deployment types']` — state of record is **`aria-expanded`**; clicking while expanded *collapses* it
3. `[role='menuitemcheckbox'][aria-label='Editor Add-on']` — state of record is **`aria-checked`**
4. `Create new test` → form: **Version** (Latest Code) · **Config** (Installed for current user | Enabled in current document | Installed and Enabled | Test in AuthMode.None) · **Test document** (disabled input + Drive-picker button) · `Save test`
5. `Save test`

> "Deploy → Test deployments → **Install**" is the **Google Workspace Add-on** flow. For an **Editor Add-on** (`DocumentApp.getUi().createAddonMenu()`) there is **no Install and no Uninstall control anywhere in this dialog** — verified against the full dialog `textContent`. The editor-add-on equivalent of installing is *saving a test*, and a **Test document is mandatory** (`Save test` with it empty returns ok, prints no error, and creates nothing).

Deployment type does **not** persist across dialog opens — reopening always returns to "Please select a deployment type".

## The tab must be foregrounded — this breaks trusted clicks everywhere

**When the target tab is not the ACTIVE tab of a FOREGROUNDED Chrome window, `getBoundingClientRect()` inside it returns a stale layout**, so `trustedCoordClick` computes stale coordinates and the click lands on nothing — while still reporting `status: "ok"` with `{ok:true,x,y}`. A trusted click cannot tell you it missed; only a response signature can.

Measured on the Test-document picker button, same selector, same payload:

| Chrome state | resolved coords | picker opened |
|---|---|---|
| foregrounded + active tab | `x=1111, y=595` | yes, 3/3 |
| backgrounded | `x=1046, y=564…592` | no, 5/5 |

Fix before any run that uses `trusted: true` on this site:

```
open -a "Google Chrome"
curl -s http://localhost:3333/tabs/list
curl -s -X POST http://localhost:3333/tabs/activate -H 'Content-Type: application/json' -d '{"tabId":<id>}'
```

## Drive picker (Test document field)

- Launcher is `*:has(> input[aria-label='Test document']) [role='button']` — it is `[role="button"]`, **not** `<button>`, and the input's direct parent is not a `<div>`, so both `div:has(> input…)` and `… button` fail.
- **Requires `trusted: true`** *and* a foregrounded tab. Non-trusted `element.click()` returns ok and does nothing.
- Opens as `iframe[src*='picker']`. It does **not** use the classic `.picker-dialog` / `.picker-dialog-bg` / `iframe.picker-frame` classes.
- Frame-scoped `click` / `click_text` / `type` / `read` work with `"frame": "picker"`. **`js` ignores `step.frame`** — `pageScan()` runs in the top document even when a frame is requested.
- **Index lag:** the picker's Recent list, My Drive list and search all lag file creation by *minutes* (one doc still invisible at T+42min; another appeared under "Today." at ~T+10min) while `drive.google.com/drive/my-drive` showed both immediately. My Drive is alphabetical **and virtualised** (renders ~A–S only). **Recent — the default tab — is the workable surface**, once the file has propagated. Picker search is fuzzy and untrustworthy (`AAAA` → "Copy of Zorina's Book").
- ⚠️ **Unsolved:** clicking the document row selects it visually but does **not** populate the Test document field, and no confirm control matches the exact text `Select`. See `install-editor-addon.payload.json` → `_meta.blockers`.

## Verifying an editor add-on by consequence (in Google Docs)

- Menubar item: **`#docs-extensions-menu`** exists. `#docs-addons-menu` and `[aria-label='Extensions']` do **not**.
- Click it with `trusted: true`, then `read` selector `.goog-menu.goog-menu-vertical:not([style*='display: none'])`.
- `dumpText()` is useless here — Docs menu labels are not leaf nodes (`dumpText('Add-ons')` → `[]`).
- Baseline on a fresh doc, captured live 2026-08-02: `Add-ons►Apps Script(E)AI Video Generator - Text to Video by Veo 3►` — **no `Playmaker`**.
- Create a scratch doc with `https://docs.google.com/document/create?title=<urlencoded>` — the `?title=` param works and sticks; driving the title input by hand did not.

## Runtime facts learned here (apply site-wide)

- **`optional: true` is the only continue-on-error key.** `onError: "continue"` is not honoured and still hard-fails the chain.
- **`wait_for` with `onTimeout: "continue"` always reports `status: "ok"`.** The real answer is the **`timedOut: true`** field on the step result.
- **`wait_for` `state.visible` is an existence check, not a visibility check** (`return { matched: step.state.visible ? !!el : !el }`). To test real visibility, attempt a trusted click — `trustedCoordClick` filters zero-rect elements.
- `click_text` with `trusted: true` only considers `a, button, [role=button], [role=menuitem], [role=menuitemradio], [role=option], li` — **`[role="menuitemcheckbox"]` is not in that list**, so text-clicking a type checkbox always fails. Use `click` with a `selector`.

## Tasks

| Payload | Verified | Description |
|---------|----------|-------------|
| `tasks/enable-apps-script-api.payload.json` | ✅ 2026-08-02 | Turn ON the per-account "Google Apps Script API" setting (unblocks `clasp`). Asserts the active account first; idempotent. |
| `tasks/install-editor-addon.payload.json` | ⚠️ partial | Install an **editor add-on** for the signed-in user via `Deploy ▸ Test deployments` (type `Editor Add-on` → `Create new test` → Test document → `Save test`), parameterised by `script_id`. Phases 1–4 verified live; **blocked at the Drive-picker confirm step** — see its `_meta.blockers`. |
| `tasks/deploy-apps-script.payload.json` | ❌ | First-run deploy of Mike Review Queue append endpoint. Its recorded jsaction-checkbox blocker is **stale** — see the `trusted: true` section above. |
