# Okta × Yeshie — Anomalies & Field Notes
_Session: 2026-04-13 | Org: trial-8689388-admin.okta.com_

---

## A-001 · `read` returns null on all Okta SPA pages
**Severity:** CRITICAL — breaks all read-based payloads  
**Observed:** Every navigate → read chain returns `text: null` on /admin/users, /admin/groups, /admin/apps/active, and user profile pages.  
**Root cause:** Okta Admin Console is a React SPA using client-side routing (React Router). The Yeshie content script (`PRE_GUARDED_READ`) only captures DOM on the initial page load. After a `navigate` action uses `chrome.tabs.update`, the URL changes but the document does not fully reload — the content script is not re-injected.  
**Fix:** Use `perceive` instead of `read` for all Okta admin console pages. `perceive` works correctly on SPA-navigated pages and returns structured: `{headings, buttons, fields, mainActions, navLinks, tables, title, url}`.  
**Workaround tested:** `tabs/refresh` did not fix read — content script still doesn't re-initialize.  
**Status:** ✅ Workaround confirmed (use `perceive`)

---

## A-002 · `probe_affordances` action is unsupported in wxt-built extension
**Severity:** MEDIUM — `probe_affordances` is in old `background.js` (April 5) but NOT in wxt build  
**Observed:** `{"stepId":"s1","action":"probe_affordances"}` returns `{status: "unsupported", durationMs: 0}`.  
**Root cause:** The wxt build (`.output/chrome-mv3/background.js`, April 13) is what Chrome actually loads. It does not include a `probe_affordances` handler. The root `packages/extension/background.js` (April 5) had 16 handlers including `probe_affordances`, but this file is no longer the active build.  
**Fix:** Use `perceive` (which IS in the wxt build).  
**Status:** ✅ Documented, workaround available

---

## A-003 · `js` action uses pattern matching — arbitrary code rejected
**Severity:** HIGH — blocks fallback DOM inspection via JS  
**Observed:** Any `js` step with non-recognized code returns `{__error: 'No matching pattern for js step'}`.  
**Root cause:** The wxt-built extension's `js` handler compares injected code against a hardcoded set of known patterns (baked-in for YeshID workflows). Arbitrary code like `document.title + '|' + document.querySelectorAll('tr').length` does not match any pattern.  
**Impact:** Cannot use `js` as a fallback for custom DOM inspection, table extraction, or scrolling on Okta pages.  
**Fix options:** (1) Add new patterns to `background.ts` and rebuild; (2) use `perceive` for all structural inspection; (3) use `click_text`/`find_row` for interaction.  
**Status:** ⚠️ Unresolved — requires extension rebuild to fix

---

## A-004 · `{{var}}` interpolation reads from API `params`, NOT from `payload.params`
**Severity:** HIGH — causes silent empty-string substitution  
**Observed:** Setting `payload.params: {"base_url": "..."}` does NOT make `{{base_url}}` resolve in chain steps. `{{base_url}}` interpolates to empty string if `params: {}` is passed in the `/run` API call body.  
**Root cause:** In `relay/index.js`, `skill_run` passes the API-level `params` object to the interpolation context, not `payload.params`. `payload.params` is schema documentation only.  
**Fix:** Always pass runtime variable values in the top-level `params` field of the `/run` POST body: `{"tabId": ..., "payload": {...}, "params": {"userId": "00u..."}}`.  
**Example of BROKEN pattern:** `POST /run {"payload": {"params": {"userId": "..."}, "chain": [...]}}`  
**Example of CORRECT pattern:** `POST /run {"params": {"userId": "..."}, "payload": {"chain": [...]}}`  
**Status:** ✅ Documented

---

## A-005 · Relative URLs in `navigate` resolve against `chrome-extension://` origin
**Severity:** HIGH — causes tab to land on chrome-extension URL  
**Observed:** `navigate` with url `/admin/users` navigated tab to `chrome-extension://oicficnhfjffhcahjpeibmeofbinlbfp/admin/users`.  
**Root cause:** `chrome.tabs.update(tabId, {url: '/admin/users'})` uses relative URL resolution against the extension's own origin.  
**Fix:** Always hardcode full URLs in Okta payload chains: `"url": "https://trial-8689388-admin.okta.com/admin/users"`. Never use `{{base_url}}/path` pattern.  
**Status:** ✅ Fixed in all payload files (05–08)

---

## A-006 · Apps page table has empty headers `[]`
**Severity:** LOW — structural oddity in perceive output  
**Observed:** `/admin/apps/active` — `perceive` returns `tables: [{headers: [], rowCount: 5}]`. No column headers captured.  
**Root cause:** The app list is rendered as MUI cards/grid, not a standard `<table>` with `<th>` elements. The `perceive` handler finds a list-like structure and counts items as rows but can't extract headers.  
**Workaround:** App names and instance hrefs are available in `mainActions` with pattern `/admin/app/{type}/instance/{id}/`.  
**Status:** ✅ Documented, workaround available

---

## A-007 · Status badge text concatenated with label (no separator)
**Severity:** LOW — display oddity  
**Observed:** Apps page shows `{text: "ACTIVE0"}` and `{text: "INACTIVE0"}` in mainActions — the count badge is concatenated directly onto the label.  
**Root cause:** MUI `Chip` or `Badge` renders the count as a child element; `perceive`'s text extraction concatenates all text nodes in the anchor without a separator.  
**Impact:** Can't easily parse count from label. The count is `0` for both in a fresh trial org (Okta's built-in apps don't count here).  
**Status:** ✅ Documented, low priority

---

## A-008 · Security pages not accessible in trial org
**Severity:** MEDIUM — limits security automation coverage  
**Observed:** All of the following return H2: "Page Not Found":
  - `/admin/security/general`
  - `/admin/security/mfa`
  - `/admin/security`
  - `/admin/settings/general`
  - `/admin/access/authenticators`
**Root cause:** Okta Identity Engine (OIE) trial org restructured security settings. Classic paths (`/admin/security/general`) are not valid in OIE. Correct paths may require `admin/access/policies` or feature-flag gating.  
**Status:** ⚠️ Unresolved — correct OIE security paths not yet determined

---

## A-009 · Admin's own profile shows no lifecycle action buttons
**Severity:** LOW — expected Okta behavior  
**Observed:** Navigating to Michael Wolf's profile (`/admin/user/profile/view/00u11lcq3lk8XQjBt698`) — no "More Actions", "Deactivate", "Suspend" buttons visible. `click_text("More Actions")` returns error.  
**Root cause:** Okta prevents admins from deactivating or suspending themselves via the UI (self-protection).  
**Impact:** Payload 08 `click_text("More Actions")` will fail if run on the authenticated user's own ID.  
**Fix:** Always pass a non-self userId when running lifecycle actions.  
**Status:** ✅ Documented in payload 08

---

## A-010 · User profile H1 contains concatenated name + email
**Severity:** LOW — parsing oddity  
**Observed:** Profile page H1 returns: `"Hermes AI\n            hermes@hermes.ai"` (name + 12-space-indent + email, all in one heading text).  
**Root cause:** MUI `Typography` component for the profile header has two child spans whose text is captured as one by `perceive`.  
**Impact:** Need to split on `\n` to separate display name from email.  
**Status:** ✅ Documented

---

## A-011 · System Log URL is `/report/` not `/admin/` prefix
**Severity:** MEDIUM — path confusion likely  
**Observed:** System log is at `/report/system_log_2`, not `/admin/reports/system_log_2` or `/admin/report/system_log_2`.  
**Root cause:** Okta's legacy report paths use `/report/` prefix (without `/admin`). The `/reports` landing page uses `/reports` (plural). These are distinct path namespaces.  
**Impact:** Navigating to `/admin/reports` would land on "Page Not Found".  
**Status:** ✅ Documented in payload 07

---

_Last updated: 2026-04-13_  
_Yeshie version: wxt build 2026-04-13 11:28 (chrome-mv3)_

---

## A-012 · abstractTargets require `cachedConfidence >= 0.85` AND `resolvedOn` to be used
**Severity:** HIGH — root cause of all "Cannot resolve: {target}" errors  
**Observed:** Any inline `abstractTargets` entry missing either `cachedConfidence` or `resolvedOn` returns: `Cannot resolve: {targetName}`. The extension silently falls through to its AI resolver, which also fails if the field isn't on screen at the exact moment.  
**Exact engine check (from wxt-built background.js):**
```
cachedSelector
  && (e.cachedConfidence || 0) >= 0.85
  && e.resolvedOn
  && Date.now() - new Date(e.resolvedOn).getTime() < 2592e6  // 30 days
  && document.querySelector(e.cachedSelector)               // element must exist NOW
```
**Fix:** Always include both fields in every abstractTarget:
```json
"cachedSelector": "input[name='profile.firstName']",
"cachedConfidence": 0.95,
"resolvedOn": "2026-04-13T00:00:00.000Z"
```
**Cross-reference:** Also in Google Admin ANOMALIES A-009.  
**Status:** ✅ Fixed in all Okta payloads (02–08)

---

## A-013 · Add-user flow (02) confirmed working end-to-end
**Severity:** INFO — positive finding  
**Observed:** Full add-user chain (navigate → click_text "Add person" → type × 4 fields → click submit → perceive) completed with `success: true`. Test user "Yeshie Test" (ID: `00u11x5jinoSKzBC5698`) created at `yeshietest@yeshietest.com`.  
**Key condition:** abstractTargets must include `cachedConfidence` and `resolvedOn` (see A-012).  
**Status:** ✅ VERIFIED 2026-04-13

---

## A-014 · Deactivate flow confirmed: More Actions → Deactivate → OK
**Severity:** INFO — confirmed selector pattern  
**Observed on test user "Yeshie Test" (STAGED state):**
1. `click_text("More Actions")` → opens dropdown ✓
2. `click_text("Deactivate")` → opens confirmation modal with H2: "Deactivate Person" ✓
3. `click_text("OK")` → confirms deactivation ✓ ← NOTE: third step is "OK" not "Deactivate"
**Old selector `[data-se='deactivate-user-btn']`:** NOT found in Okta OIE trial org. Classic UI selector — does not apply.  
**Correct pattern for payload 03/08:**
```json
{"action":"click_text","text":"More Actions"},
{"action":"delay","ms":700},
{"action":"click_text","text":"Deactivate"},
{"action":"delay","ms":1500},
{"action":"click_text","text":"OK"}
```
**Status:** ✅ VERIFIED 2026-04-13

---

## A-015 · Deactivated users remain visible in /admin/users list
**Severity:** LOW — expected Okta behavior  
**Observed:** After deactivating "Yeshie Test", the users list still shows 8 users (rowCount: 8). Deactivated users are not removed — they appear with a different status badge.  
**Impact:** `perceive.tables[0].rowCount` is not a reliable count of ACTIVE users. Use the Status column or filter via Okta API if active-only count needed.  
**Status:** ✅ Documented

---

## A-016 · YeshID session expires during extended automation sessions (~30-40 min)
**Severity:** MEDIUM — cross-system session management  
**Observed:** YeshID tab (1637807046) navigated to `/login?redirect=/` after ~35 minutes of work. Extension commands on that tab began timing out (no response from content script on login page).  
**Behavior:** The extension appears not to inject into the `/login` page (timeout on all actions). The tab becomes permanently unresponsive to relay commands until re-authenticated.  
**Fix:** Monitor tab URL before issuing YeshID chains. If tab is at `/login`, re-auth is required (manual step). Open a new tab to `/organization/people` after re-auth.  
**Status:** ⚠️ Unresolved — requires manual re-auth; consider session health-check payload

---

_Last updated: 2026-04-13 (extended session)_

---

## A-017 · Queued Yeshie messages fire to stale tabId after tab re-navigation
**Severity:** HIGH — tab context mismatch causes unintended navigation  
**Observed:** 2026-04-14 autonomous session. Tab 1637807369 was the Okta admin console. Three background curl messages were dispatched to that tabId targeting Okta admin URLs (`/admin/groups`, `/admin/reports`, `/admin/security/general`). The tab later navigated to `app.yeshid.com/overview` (Okta session ended). The queued messages eventually fired and:
1. `/admin/groups` — caused the tab to navigate back to `trial-8689388-admin.okta.com/admin/groups` (session apparently recovered)
2. `/admin/reports` — navigated to `trial-8689388-admin.okta.com/admin/reports` → **404 Page Not Found** (see A-011; correct path is `/report/system_log_2`)
3. `/admin/security/general` — all steps returned `unsupported` (extension version mismatch; see A-008)

**Root cause (compound):**
- Messages are enqueued by tabId; the tabId is not validated against current tab URL before firing
- `/admin/reports` is not a valid Okta OIE path (known from A-011, not applied to new payload 09)
- Simultaneous long-running background curls to multiple tabs create uncontrolled sequencing

**Fix:**
- Always validate current tab URL before firing a chain (add a state-check step or use `stateGraph` guards)
- Do NOT enqueue multiple messages to the same tabId without waiting for the prior response
- Fix `09-list-reports.payload.json` URL to `/report/system_log_2` (see A-011)
- Kill background curl processes if tab context changes: `pkill -f "<tabId>"`

**Cleanup required:** Tab 1637807369 closed (404 state). Tab 1637807420 navigated to admin/users as replacement.  
**Status:** ✅ Documented, payload 09 fixed

---

_Last updated: 2026-04-14_
