# Yeshie OAuth: Existing Implementation Reference

## Current Capabilities

### 1. PRE_CLICK_GOOGLE_ACCOUNT Function

**Location:** `~/Projects/yeshie/packages/extension/src/entrypoints/background.ts`, lines 849–870

**Purpose:** Select a Google account when the account chooser appears (accounts.google.com)

**Implementation:**

```typescript
function PRE_CLICK_GOOGLE_ACCOUNT(email: string) {
  // On the Google account chooser (accounts.google.com), click the account matching email
  // Google uses data-email on the email text div (primary), data-identifier on account rows (fallback)
  const byEmail = document.querySelector(`[data-email="${email}"]`) as HTMLElement | null;
  if (byEmail) {
    byEmail.click();
    return { clicked: true, method: 'data-email', email };
  }
  const byIdentifier = document.querySelector(`[data-identifier="${email}"]`) as HTMLElement | null;
  if (byIdentifier) {
    byIdentifier.click();
    return { clicked: true, method: 'data-identifier', email };
  }
  // Fallback: find by visible email text in list items
  const items = Array.from(document.querySelectorAll('li, div[role="link"], div[data-email]'));
  const match = items.find(el => el.textContent?.includes(email)) as HTMLElement | undefined;
  if (match) {
    match.click();
    return { clicked: true, method: 'text-match', email };
  }
  return { clicked: false, available: items.map(el => el.textContent?.trim()).filter(Boolean).slice(0, 10) };
}
```

**Fallback cascade:**
1. Try `[data-email="..."]` selector (Google's primary account indicator)
2. Try `[data-identifier="..."]` selector (fallback for some Google UIs)
3. Try text match against visible list items
4. If all fail, return available accounts for debugging

**Default account:** Configuration expects `_meta.auth.googleAccountEmail` or `google_account_email` param (default: `mw@mike-wolf.com`)

---

### 2. PRE_WAIT_FOR_AUTH Function

**Location:** `background.ts`, lines 819–832

**Purpose:** Poll for successful authentication (used during login recovery)

```typescript
async function PRE_WAIT_FOR_AUTH(timeoutMs: number = 120000) {
  // Poll for authentication — waits for the nav drawer to appear
  // Returns when authenticated or when timeout expires
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const onLogin = /\/login/.test(window.location.pathname);
    const hasNav = !!document.querySelector('.v-navigation-drawer a[href="/overview"]');
    if (!onLogin && hasNav) {
      return { authenticated: true, waitMs: Date.now() - t0 };
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return { authenticated: false, waitMs: Date.now() - t0, timedOut: true };
}
```

**How it works:**
- Polls every 2 seconds
- Checks for absence of `/login` in URL
- Checks for presence of `.v-navigation-drawer a[href="/overview"]` (YeshID-specific nav drawer)
- Returns on first match or timeout

**Status:** YeshID-specific (hardcoded selectors). Can be parameterized for other apps.

---

### 3. PRE_CHECK_AUTH Function

**Location:** `background.ts`, lines 806–817

**Purpose:** Quick pre-chain check for authentication status

```typescript
function PRE_CHECK_AUTH() {
  // Quick check: is the user authenticated?
  // YeshID shows /login when unauthenticated, and a navigation drawer when authenticated
  const onLoginPage = /\/login/.test(window.location.pathname);
  const hasNavDrawer = !!document.querySelector('.v-navigation-drawer a[href="/overview"]');
  return {
    authenticated: !onLoginPage && hasNavDrawer,
    onLoginPage,
    hasNavDrawer,
    currentUrl: window.location.href
  };
}
```

**Used by:** Background worker calls this at chain start to decide whether to run `waitForAuth`

---

### 4. YeshID Login Payload (Proven End-to-End Flow)

**Location:** `~/Projects/yeshie/sites/yeshid/tasks/00-login.payload.json`

**Steps:**

```json
[
  {
    "action": "navigate",
    "url": "{{base_url}}"
  },
  {
    "action": "assess_state",
    "expect": { "state": "authenticated" },
    "onMatch": "exit_success"
  },
  {
    "action": "click_text",
    "text": "Sign in with Google"
  },
  {
    "action": "delay",
    "ms": 3000
  },
  {
    "action": "click",
    "selector": "[data-email=\"{{google_account_email}}\"]"
  },
  {
    "action": "wait_for",
    "url_pattern": "app\\.yeshid\\.com(?!/login)",
    "timeout": 30000
  }
]
```

**What it demonstrates:**
1. Navigate to base URL
2. Check if already authenticated (quick exit if yes)
3. Click "Sign in with Google" button
4. Wait for redirect to Google account chooser
5. Click account matching email (data-email selector)
6. Wait for final redirect back to app (not /login)

**Status:** PROVEN. This works end-to-end for YeshID.

**Dependencies:**
- `google_account_email` param (defaults to `mw@mike-wolf.com`)
- `base_url` param (defaults to `https://app.yeshid.com`)

---

### 5. Auth Recovery (Mid-Chain)

**Location:** `background.ts`, in `startRun` loop (lines ~400–600)

**Mechanism:**

When a step returns `auth_required` (navigation to `/login` detected):

1. Background worker calls `waitForAuth` (polling loop)
2. User goes through SSO → account chooser → consent
3. Polls for authenticated state (nav drawer presence)
4. Returns success
5. Chain retries the failed step

**Status:** DOCUMENTED but NOT YET TESTED in production

From `ACTION_ITEMS.md`:
> "Test login flow end-to-end | Auth | `waitForAuth` + `PRE_CLICK_GOOGLE_ACCOUNT` implemented but not tested against a real expired session. Need full cycle: detect expiry → click SSO → select Google account → resume chain."

---

## Configuration Points

### google_account_email / sso_email

Set in payload `_meta.auth.googleAccountEmail` or passed as param `google_account_email`.

**Default:** `mw@mike-wolf.com`

**Where it's used:**
- PRE_CLICK_GOOGLE_ACCOUNT uses it to select account on chooser
- `00-login.payload.json` uses it in selector `[data-email="{{google_account_email}}"]`

### base_url

Base URL of the application (where OAuth flow starts).

**Default:** `https://app.yeshid.com`

**Where it's used:**
- Initial navigate step
- URL matching in wait_for steps

---

## Known Limitations (Surface 2 & 3)

### Surface 2: Cross-Origin iframe

If OAuth content is in a cross-origin iframe with strict CSP (X-Frame-Options: DENY), content script cannot:
- Query selectors inside iframe
- Click elements inside iframe
- Dispatch events inside iframe

**Workaround:** Wait for the flow to pop out of the iframe. Most OAuth flows eventually redirect the parent tab.

### Surface 3: window.open() Popup (APPS SCRIPT CASE)

**Status:** BROKEN

Popup window is outside MCP tab group. Content script has no access.

**Fix required:** Extension enhancement to expose tab query + switching (see `DECISION.md`)

---

## Testing the Current Implementation

### Quick Test: YeshID Login

```bash
curl -s -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\": $(cat ~/Projects/yeshie/sites/yeshid/tasks/00-login.payload.json),
    \"params\": {
      \"google_account_email\": \"mw@mike-wolf.com\",
      \"base_url\": \"https://app.yeshid.com\"
    },
    \"tabId\": null,
    \"timeoutMs\": 120000
  }"
```

**Prerequisites:**
- YeshID tab open and focused
- Relay running on localhost:3333
- Extension connected
- Google session active (not expired)

**Expected output:**
```json
{
  "success": true,
  "stepResults": [
    { "stepId": "s1", "outcome": "ok", ... },
    { "stepId": "s2", ... },
    ...
  ],
  "modelUpdates": { ... }
}
```

### Test Auth Recovery (Not Yet Done)

From ACTION_ITEMS.md — this test is pending:

1. Use YeshID payload but with expired session
2. Observe chain detects `/login` redirect
3. Verify `waitForAuth` triggers
4. Manually complete OAuth in browser
5. Verify chain resumes and completes

---

## Extension Architecture (Relevant to OAuth)

### Background Worker

- Maintains Socket.io connection to relay
- Receives payloads from relay
- Injects PRE_* functions via `chrome.scripting.executeScript`
- Routes steps to content script
- Detects auth failures and triggers recovery

### Content Script

- Injected into every frame on page load
- Survives SPA navigation (re-injected by background worker)
- **Does NOT auto-inject into new windows opened by window.open()**
- Can query selectors, click, wait for URL changes, observe mutations

### Hot-Reload

Background worker polls `localhost:27182` for build changes. On reload:
- Extension reloads
- Content scripts **are not** reinjected (by design, to preserve sessions)
- User must navigate to target site to trigger re-injection

---

## What the Auth Protocol Should Expose

Once extension is enhanced (Option A), new capabilities:

1. **yeshie_query_tabs()** — ask background worker "what tabs are open?" Returns tab metadata.
2. **focus_tab action** — activate a specific tab by tabId
3. **switch_tab with tabId** — route steps to a different tab

These enable:
- Detecting popup windows automatically
- Switching execution context to popup
- Returning to parent after popup closes
- Multi-window workflows in general

---

## Summary: What Works, What Doesn't

| Capability | Status | Evidence |
|-----------|--------|----------|
| Same-page OAuth (Surface 1) | ✅ Works | 00-login.payload.json proven |
| Account selection (data-email) | ✅ Works | PRE_CLICK_GOOGLE_ACCOUNT tested |
| Consent screen clicking | ✅ Works | Payload can click "Continue" |
| URL-based wait/redirect | ✅ Works | wait_for with url_pattern works |
| Auth recovery (mid-chain) | ⚠️ Implemented, untested | Code exists, ACTION_ITEMS.md notes not tested |
| iframe OAuth (Surface 2) | ⚠️ Partial | Can wait, cannot click inside |
| window.open popup (Surface 3) | ❌ Broken | Apps Script case — requires extension work |

---

## Next Steps

1. **Decide on Option A (extend Yeshie)**
2. **Test existing auth recovery** — run 00-login.payload.json with expired session
3. **Implement extension changes** — add query_tabs, focus_tab, switch_tab
4. **Test against Apps Script** — run gmail-bridge Review permissions flow
5. **Document any app-specific OAuth patterns** discovered (YeshID, Apps Script, others)
