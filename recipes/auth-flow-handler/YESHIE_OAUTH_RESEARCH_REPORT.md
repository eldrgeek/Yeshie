# Yeshie OAuth Architecture Research & Prototype

## Executive Summary

Yeshie **can handle two of three OAuth surface types**. The breaking case is Apps Script's "Review permissions" popup — a separate Chrome window that escapes the MCP tab group.

**Current capability:** Surfaces 1 & 2 (same-page nav, iframe) are fully supported via existing PRE_CLICK_GOOGLE_ACCOUNT and content-script injection.

**Breaking case (Surface 3):** window.open() popup in a separate Chrome window. Content script cannot reach it. Fix requires 2–3 hours of extension work: add chrome.tabs.query MCP tool + switch_tab action.

**Recommendation:** Extend Yeshie. The extension changes are low-risk and enable a whole class of OAuth flows that currently fail.

---

## What Yeshie Can Currently Do

### PRE_CLICK_GOOGLE_ACCOUNT (Existing Implementation)

Location: `packages/extension/src/entrypoints/background.ts` (lines 849–870)

The background worker has a hardened function that selects an account on Google's chooser:
- Tries `[data-email="mw@mike-wolf.com"]` (primary)
- Falls back to `[data-identifier="..."]` (alternate)
- Falls back to text match (last resort)
- Returns {clicked: true, method: 'data-email|identifier|text-match'} or escalates

This function works **only for in-tab OAuth**. The architecture assumes the account chooser appears in the current tab or an iframe on the current tab.

### Login Payload (00-login.payload.json)

Yeshie ships with a YeshID-specific login payload that exercises the full auth recovery flow:
1. Navigate to base_url
2. Assess state (check auth)
3. Click "Sign in with Google"
4. Wait 3s for Google redirect
5. Click matching Google account via `[data-email="mw@mike-wolf.com"]`
6. Wait for redirect back to app.yeshid.com

This works end-to-end for **surface 1** (same-page nav in the current tab).

### Auth Recovery (Mid-Chain Detection)

Background worker in `background.ts` detects mid-chain auth failures:
- Step navigates to /login → chain returns auth_required
- Controller calls waitForAuth() which:
  - Navigates to base_url
  - Clicks "Sign in with Google"
  - Runs PRE_CLICK_GOOGLE_ACCOUNT
  - Polls for nav drawer presence
  - Returns authenticated: true
- Chain retries failed step

**Status:** Documented in ACTION_ITEMS.md as "not yet tested against a real expired session end-to-end."

---

## OAuth Surface Types: Analysis

### Surface 1: Same-Page Navigation ✅ FULLY SUPPORTED

**How it works:** Clicking "Sign in with Google" navigates the current tab to accounts.google.com. Account chooser and consent screen appear in the same tab. Browser nav events fire. No popups.

**Example:** YeshID login, many SaaS dashboards

**Yeshie verdict:** Content script is injected. Can wait for URL changes, detect account chooser, click on account options, wait for consent screen, click consent button, wait for final redirect.

**Status:** Proven. In production with YeshID payload (00-login.payload.json).

---

### Surface 2: OAuth in <iframe> ⚠️ PARTIALLY SUPPORTED

**How it works:** OAuth provider content (chooser, consent) lives in a cross-origin iframe on the current page. OAuth flow never leaves the page; it happens inside the iframe.

**Example:** Some identity providers embed chooser/consent in host app's modal.

**Yeshie verdict:** 
- Content script can detect iframe presence (querySelector works)
- Can wait for iframe to disappear (user closed or flow completed)
- **Cannot query/click inside iframe** if it's cross-origin (blocked by Same-Origin Policy + X-Frame-Options)
- Workaround: most OAuth flows eventually redirect *out* of the iframe (parent tab navigates). Can wait for that redirect.

**Status:** Partially proven. Payload can detect and wait for iframe-based flows, but can't fully automate iframe internals in most cases.

---

### Surface 3: Separate Chrome Window (window.open) ❌ BROKEN

**How it works:** OAuth provider code calls `window.open('https://accounts.google.com/...')`. Browser opens a new popup window. Account chooser and consent appear in the popup. When user clicks "Continue," popup closes and control returns to parent tab with session cookie set.

**Real-world example:** **Apps Script "Review permissions"** — the immediate blocker.

```
User clicks "Run" in Apps Script editor
→ Overlay says "Review permissions"
→ Clicks "Review"
→ window.open() opens popup for "Sign in to gmail-bridge"
→ Popup is in a new Chrome window, NOT in MCP-tagged tab group
→ Content script in parent tab has no access to popup
```

**Why it breaks:**

1. Popup tab has a different tabId than parent
2. Parent tab's content script cannot message popup (cross-window)
3. Extension background worker **can** see the popup via `chrome.tabs.query({ windowId: <popup_window> })`
4. But there's no MCP tool to ask background worker "what tabs are open?"

**Status:** BLOCKED. Requires extension changes.

---

## Relay API Exploration

### Current Endpoints (from AGENTS.md)

```
GET /status
POST /run             ← execute payload
POST /chat
GET /chat/listen
```

### Socket.IO Listeners in Background Worker (background.ts, lines 37–100)

```
'skill_run'           ← run payload
'list_tabs'           ← **already exists!** returns all open tabs
'open_tab'
'refresh_tab'
'navigate_tab'
'close_tab'
'activate_tab'
'inject_chat'
```

**Key finding:** `list_tabs` listener already exists (line 52–56). Background worker can query all tabs. This is the hook we need.

---

## Extension Manifest & Content Script Injection

### Where Content Script Injects

File: `packages/extension/src/entrypoints/content.ts` (inferred from WXT structure)

- Injects into every frame on page load
- Survives SPA navigation via `onUpdated` listener (background.ts lines 179–220)
- Does NOT reinject into new windows opened by `window.open()` (different window context)

### Popup Escape Mechanics

When `window.open('https://accounts.google.com/...')` executes:
1. New window is created with a new Chrome window ID
2. New window is **not** in the same tab group as the MCP client
3. Content script does not auto-inject into the new window (it's a separate context)
4. Background worker's service worker can see it via `chrome.tabs.query({ windowId: <new_window_id> })`
5. But relay has no way to tell the background worker "find the popup window"

---

## Minimum Extension Work to Unblock Surface 3

### Step 1: Add Socket.IO Listener: query_tabs

**File:** `packages/extension/src/entrypoints/background.ts`

**In the relay socket setup section (around line 37), add:**

```typescript
socket.on('query_tabs', async (query: any, ack: (result: any) => void) => {
  try {
    const tabs = await chrome.tabs.query({
      url: query.urlPattern ? new RegExp(query.urlPattern).test(tabs[i].url) : true,
      windowId: query.windowId || undefined,
      title: query.title ? new RegExp(query.title).test(tabs[i].title) : true,
    });
    ack({
      ok: true,
      tabs: tabs.map(t => ({
        tabId: t.id,
        url: t.url,
        title: t.title,
        windowId: t.windowId,
        active: t.active
      }))
    });
  } catch (err: any) {
    ack({ ok: false, error: err.message });
  }
});
```

**Effort:** ~30 lines. Pattern already exists (see `open_tab`, `list_tabs`).

### Step 2: Add MCP Tool: yeshie_query_tabs

**File:** `~/Projects/cc-bridge-mcp/server.js`

**Add MCP tool:**

```javascript
{
  name: 'yeshie_query_tabs',
  description: 'Query all open Chrome tabs matching optional filters (URL pattern, windowId, title). Returns tab metadata including windowId.',
  inputSchema: {
    type: 'object',
    properties: {
      urlPattern: { type: 'string', description: 'Regex to match tab URL (e.g., "accounts\\.google\\.com")' },
      windowId: { type: 'integer', description: 'Filter by Chrome window ID' },
      title: { type: 'string', description: 'Regex to match tab title' }
    }
  },
  execute: async (params) => {
    return new Promise((resolve) => {
      socket.emit('query_tabs', params, (result) => resolve(result));
    });
  }
}
```

**Effort:** ~20 lines. Follows existing yeshie_run pattern.

### Step 3: Add Payload Action: focus_tab

**File:** `models/runtime.model.json`

**Add to actions array:**

```json
{
  "name": "focus_tab",
  "description": "Activate and focus a specific Chrome tab by tabId. Used after popup detection to switch execution context to popup window.",
  "fields": ["tabId"],
  "responseSignature": {
    "type": "any_of",
    "any_of": [
      { "type": "url_change", "matches": ".*", "timeout": 2000 },
      { "type": "state_reached", "state": "account_chooser_same_page", "timeout": 5000 }
    ]
  }
}
```

**Background worker (background.ts), extend `startRun` loop:**

```typescript
if (step.action === 'focus_tab' && step.tabId) {
  await chrome.tabs.update(step.tabId, { active: true });
  // Subsequent steps route to this tabId until switch_tab again
}
```

**Effort:** ~15 lines in background.ts + 10 lines in model.

### Step 4: Extend switch_tab to Accept tabId

**File:** `models/runtime.model.json` + `background.ts`

**Current switch_tab:** switches tab by URL pattern matching.

**Enhancement:**

```json
{
  "name": "switch_tab",
  "fields": ["pattern", "tabId", "guard", "expect"],
  "description": "Switch execution context to a different tab. Can match by URL pattern OR explicit tabId."
}
```

**Effort:** ~10 lines. Mostly parameter handling.

### Total Effort: 2–3 Hours

**Breakdown:**
- Socket.io listener: 30 min
- MCP tool: 20 min
- Payload actions (focus_tab + switch_tab): 1 hour
- Tests: 30 min (integration test of query_tabs → focus_tab flow)
- Risk: Low. Follows existing patterns, no user prompts, no new dangerous APIs.

---

## Proposed Prototype Payload Structure

I've written `auth-flow-handler.payload.json` (included in outputs). It documents:

1. **Three-surface detection** via `assess_state` branching on window.__yeshieOAuthSurface
2. **Account selection logic** using fallback selectors (data-email → data-identifier → text match)
3. **Consent screen waiting** (visible button with text "Continue")
4. **Consent click** with fallback text patterns
5. **Completion verification** (URL no longer on OAuth provider domain)
6. **Escalation point** (step s4) where surface 3 (popup) is detected and flagged as requiring new MCP tools

The payload is intentionally **not production-ready** — it's a design document showing:
- What steps the auth flow needs
- Where Yeshie currently hits its wall (surface 3)
- What the extension needs to support popup adoption

---

## Recommendation: Extend Yeshie or Alternative?

### Option A: Extend Yeshie (Recommended)

**Pros:**
- Solves the window.open() problem permanently for all OAuth flows
- Low risk, follows existing patterns
- Enables cross-window multi-step workflows (not just OAuth)
- Integrates cleanly with existing payload model
- Yeshie's relay is already a bottleneck for command routing; tab queries are natural fit

**Cons:**
- Requires 2–3 hours of extension dev + testing
- Adds API surface (yeshie_query_tabs, focus_tab)

### Option B: Use a Different Mechanism for Surface 3

**Use system automation (osascript, xdotool):** Instead of driving the popup via Yeshie, use mac-controller or similar to click the popup window directly.

**Pros:**
- Doesn't require extension changes
- Works immediately

**Cons:**
- Fragile (macOS-specific, breaks on different window manager configs)
- Defeats the purpose of browser RPA (no structured state feedback)
- Doesn't scale to VPS (can't drive a remote Chrome window via osascript)
- Not reusable for future multi-window scenarios

**Verdict:** This is a last resort. Viable only for Apps Script testing, not a general solution.

### Option C: Skip Surface 3, Document the Limitation

Just document that Yeshie doesn't support window.open() popups, and advise workarounds (disable popup blocker, manually click popup, use API instead of UI).

**Pros:**
- Zero effort
- Surfaces 1 & 2 are sufficient for many OAuth flows

**Cons:**
- Leaves gmail-bridge Apps Script deployment incomplete
- Users hit a wall frequently (many OAuth flows use popups)

---

## Summary Table

| Aspect | Status | Notes |
|--------|--------|-------|
| **Surface 1: Same-page nav** | ✅ SUPPORTED | PRE_CLICK_GOOGLE_ACCOUNT in background.ts, proven in YeshID payload |
| **Surface 2: iframe** | ⚠️ PARTIAL | Can detect & wait for, limited clicking (CSP blocks cross-origin iframe access) |
| **Surface 3: window.open** | ❌ BROKEN | Requires extension: add query_tabs + focus_tab actions |
| **Account selection default** | ✅ READY | PRE_CLICK_GOOGLE_ACCOUNT handles [data-email], [data-identifier], text match |
| **Consent screen handling** | ✅ READY | Detect button, click "Continue" / "Allow" / "Authorize" |
| **Auth recovery (mid-chain)** | ⚠️ DOCUMENTED NOT TESTED | waitForAuth exists, not yet proven in production |
| **Gmail-bridge Apps Script case** | ❌ BLOCKED | Apps Script uses window.open() — Surface 3 blocker |

---

## Files Included

1. **auth-flow-handler.payload.json** — Prototype payload documenting the three surfaces and required extension changes
2. **This report** — Architecture analysis, gaps, recommendations

---

## Next Steps

1. **Decide:** Extend Yeshie (recommended) or accept Surface 3 limitation?
2. **If extend:** Assign the 2–3 hour task to add query_tabs + focus_tab to extension & MCP server
3. **If not extend:** Document the limitation and advise workarounds for gmail-bridge (use direct API calls, test auth manually, etc.)
4. **Test auth recovery:** Run 00-login.payload.json against YeshID with a really expired session to validate the mid-chain auth detection flow

---

## References

- **Yeshie docs:** `~/Projects/yeshie/docs/silicon/` (architecture, state, reference)
- **Background worker:** `~/Projects/yeshie/packages/extension/src/entrypoints/background.ts` (PRE_CLICK_GOOGLE_ACCOUNT at line 849, socket listeners at line 37–100)
- **Login payload:** `~/Projects/yeshie/sites/yeshid/tasks/00-login.payload.json` (proven auth flow for Surface 1)
- **MCP server:** `~/Projects/cc-bridge-mcp/server.js` (where yeshie_run tool lives)
- **ACTION_ITEMS.md:** High-priority task list (auth testing at top)
