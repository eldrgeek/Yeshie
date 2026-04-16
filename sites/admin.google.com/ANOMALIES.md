# Google Admin × Yeshie — Anomalies & Field Notes
_Session: 2026-04-13 | Org: admin.google.com (embeddedsystemsresearch.org)_

---

## A-001 · `read` returns null on all Google Admin SPA pages
**Severity:** CRITICAL  
**Observed:** Same SPA pattern as Okta — Google Admin is a React/Angular SPA. `read` after `navigate` returns null.  
**Fix:** Use `perceive` for all pages. Confirmed working on: `/ac/users`, `/ac/groups`, `/ac/orgunits`, `/ac/security/sso`.  
**Status:** ✅ Workaround confirmed

---

## A-002 · No H1/H2 headings on most pages — custom web components
**Severity:** MEDIUM — structural parsing difference from Okta  
**Observed:** `/ac/users` and `/ac/groups` return `headings: []`. Google Admin uses custom Material Design web components that `perceive`'s heading scanner doesn't capture.  
**Exception:** `/ac/security/sso` does return an H1: "Manage SSO profile assignments for organizational units or groups". Dashboard returns `H2: 'Mike Wolf'` and `SPAN`-level headings.  
**Impact:** Can't use headings to confirm page identity — use `url` field from perceive instead.  
**Status:** ✅ Documented, use URL check instead of heading check

---

## A-003 · Table headers are doubled + sort instructions concatenated
**Severity:** LOW — parsing oddity  
**Observed:** Users table header: `"NameName Name. Sorted in ascending order. Activate to sort in descending order."`. Groups table header: `"Group nameGroup name Group name. Sorted in ascending order..."`.  
**Root cause:** Material Design table renders column header text twice (label + aria-label), and sort instructions are appended from `aria-describedby` or `title` attributes captured as additional text nodes.  
**Impact:** Header matching logic must use `str.startsWith('Name')` or similar, not exact match.  
**Status:** ✅ Documented

---

## A-004 · Per-row action buttons appear in `perceive.buttons` not `mainActions`
**Severity:** MEDIUM — action discovery pattern differs from Okta  
**Observed:** On `/ac/users`: "Reset password", "Rename user" per row — appear in `buttons[]` array, not `mainActions[]`. On `/ac/groups`: "View", "Add members", "Manage members", "Edit settings", "More options ↓DELETE GROUP" per row — all in `buttons[]`.  
**Root cause:** `perceive` separates buttons (`<button>` tags) from links (`<a>` tags). Google Admin uses `<button>` for row actions, while Okta used `<a>` elements.  
**Impact:** Use `perceive.buttons` to discover per-row actions. `mainActions` only has nav links on Google Admin pages.  
**Status:** ✅ Documented

---

## A-005 · "More options ↓DELETE GROUP" concatenated into single button text
**Severity:** LOW — text extraction oddity  
**Observed:** The "More options" dropdown trigger button and "DELETE GROUP" option appear as one concatenated string: `"More options \ue5c5DELETE GROUP"`. The `\ue5c5` is the Material Icons arrow-drop-down glyph.  
**Root cause:** `perceive` captures all text within the dropdown container including the hidden options as a single text node.  
**Impact:** `click_text("Delete group")` may work if the text is visible after expansion; avoid relying on the concatenated button text for matching.  
**Status:** ✅ Documented

---

## A-006 · Icon-only buttons appear as Material Icons Unicode codepoints
**Severity:** LOW  
**Observed:** Multiple buttons with text: `"\ue314"` (arrow_back), `"\ue8b8"` (person_add), `"\ue5c5"` (arrow_drop_down), `"\ue145"` (add), `"\ue675"` (expand_more), `"\ue5d4"` (tune), `"\ue5dc"` (close).  
**Root cause:** Google Admin uses Material Icons font — icon characters are Unicode private-use area codepoints. `perceive` captures the raw codepoint as the button text.  
**Impact:** Cannot use `click_text` on icon buttons. Use CSS selector `button[aria-label='...']` or wrap in a named abstractTarget with the appropriate aria-label.  
**Status:** ✅ Documented

---

## A-007 · Google Admin URL base path is `/ac/` — not root
**Severity:** MEDIUM — will cause "Page Not Found" if wrong prefix used  
**Observed:** All functional Google Admin pages use `/ac/` prefix: `/ac/users`, `/ac/groups`, `/ac/orgunits`, `/ac/security/sso`, `/ac/home`, `/ac/dashboard`.  
**Exception:** `/admin.google.com/` root and `admin.google.com/?rapt=...` redirect to dashboard.  
**Paths that return empty/404:** `/admin/users`, `/admin/security`, `/users`, etc.  
**Fix:** Always hardcode full URL: `https://admin.google.com/ac/users`.  
**Status:** ✅ Fixed in all payload files

---

## A-008 · Add-user form fields use `aria-label` not `name` attribute
**Severity:** HIGH — all selector patterns for Okta-style payloads must be rewritten  
**Observed:** Okta form fields: `input[name='profile.firstName']`. Google Admin form fields: `input[aria-label='First name *']`, `input[aria-label='Last name *']`, `input[aria-label='Primary email *']`.  
**Root cause:** Google Admin uses Material Design components that bind to `aria-label` rather than `name` attributes. The `name` field is null for all form inputs.  
**Impact:** abstractTargets must use `cachedSelector: "input[aria-label='First name *']"`. Also note the asterisk (`*`) is literal in the aria-label — it must be included in the selector.  
**Important:** abstractTargets MUST include `cachedConfidence >= 0.85` AND `resolvedOn` date or the Yeshie extension ignores the cached selector entirely (see Okta A-012).  
**Status:** ✅ Fixed in 02-add-user.payload.json

---

## A-009 · abstractTargets require cachedConfidence ≥ 0.85 and resolvedOn (cross-site rule)
**Severity:** HIGH — applies to ALL sites, not Google Admin specific  
**Observed:** Inline `abstractTargets` with only `{"cachedSelector":"..."}` result in "Cannot resolve: {target}" error. The built Yeshie extension checks: `cachedSelector && cachedConfidence >= 0.85 && resolvedOn && age < 30 days && document.querySelector(cachedSelector)`.  
**Fix:** Always include both fields: `"cachedConfidence": 0.92, "resolvedOn": "2026-04-13T00:00:00.000Z"`.  
**Cross-reference:** Also logged as Okta ANOMALIES A-012.  
**Status:** ✅ Fixed in all Google Admin payloads

---

## A-010 · `/ac/security/sso` shows no existing SSO profiles — YeshID NOT connected
**Severity:** INFO — topology finding  
**Observed:** `/ac/security/sso` page heading: "Manage SSO profile assignments for organizational units or groups". Buttons: "ADD OIDC PROFILE", "ADD SAML PROFILE". No existing profiles listed.  
**Meaning:** Google Workspace (embeddedsystemsresearch.org) does NOT currently have YeshID configured as an SSO/SAML provider. There is no active Okta→Google or YeshID→Google directory sync visible through SSO settings.  
**Corollary:** The YeshID→Okta relationship (if any) cannot be inferred from Google Admin.  
**Status:** ✅ Documented — topology: Google Admin is standalone, no SSO federation to YeshID

---

## A-011 · `/ac/security` redirects to `/ac/managedsettings/{orgId}` 
**Severity:** LOW — URL instability  
**Observed:** Navigating to `https://admin.google.com/ac/security` redirected to `https://admin.google.com/ac/managedsettings/352555445522`. The org ID `352555445522` is embedded in the redirect target.  
**Impact:** Security settings URL is org-specific. Hard-coding `/ac/security` works as a navigate target but the landing URL will differ per org.  
**Status:** ✅ Documented

---

## A-012 · `/ac/apps/saml` returns empty — SAML app list not rendered in time
**Severity:** MEDIUM — may need longer delay or different navigation  
**Observed:** `/ac/apps/saml` returned empty perceive result (`headings:[], tables:[], buttons:[]`) with 3s delay.  
**Root cause unknown:** Either the page requires more render time, a different URL, or the SAML apps section only appears when apps are configured.  
**Status:** ⚠️ Unresolved — increase delay to 6s or try alternate path `/ac/apps/details/SAML` or check if section is gated

---

## A-013 · OUs (Organizational Units) confirmed: 5 units visible
**Severity:** INFO  
**Observed:** `/ac/orgunits` table: headers `['NameName', 'DescriptionDescription', '']`, rowCount=5. Buttons: "Create organizational unit", plus per-row Edit/Delete actions.  
**Note:** OUs are relevant for SSO profile scoping — if YeshID SSO is added later, it can be scoped to specific OUs.  
**Status:** ✅ Documented

---

_Last updated: 2026-04-13_  
_Yeshie version: wxt build 2026-04-13 11:28 (chrome-mv3)_
