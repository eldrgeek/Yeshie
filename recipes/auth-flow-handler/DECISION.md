# Yeshie OAuth Architecture Decision

## Problem Statement

Apps Script's "Review permissions" flow opens a popup window via `window.open()`. This popup is in a separate Chrome window, outside our MCP tab group. The popup contains account chooser and consent screens that need to be automated.

**Current blocker:** Yeshie's content script cannot reach the popup. No MCP tool exists to query tabs or switch execution context to the popup.

---

## Three Surfaces Analysis

| Surface | Type | How It Works | Yeshie Status | Breaking Case |
|---------|------|-------------|---------------|--------------|
| 1 | Same-page nav | OAuth redirects in current tab | ✅ SUPPORTED | None known |
| 2 | OAuth in iframe | Chooser/consent in `<iframe>` on current page | ⚠️ PARTIAL | Cannot query inside cross-origin iframe |
| 3 | window.open popup | OAuth opens new Chrome window | ❌ BROKEN | Apps Script, Google Drive perms, most web OAuth |

**Apps Script lands in Surface 3.**

---

## Why Surface 3 Fails

1. `window.open('https://accounts.google.com/...')` executes in Apps Script iframe
2. New window is created with a different windowId
3. New window is NOT in the same tab group as the MCP client
4. Yeshie's content script does not auto-inject into the new window
5. Background worker CAN see the tab via `chrome.tabs.query({ windowId: <id> })`
6. But there is NO MCP tool to ask the background worker for this info
7. Relay has no way to route commands to the popup tab

---

## Three Options

### Option A: Extend Yeshie (RECOMMENDED) ⭐

**What:** Add three small pieces to the extension:

1. **Socket.io listener: query_tabs** (background.ts, ~30 lines)
   - Background worker queries all open tabs
   - Returns tab metadata (tabId, url, title, windowId)

2. **MCP tool: yeshie_query_tabs** (cc-bridge-mcp/server.js, ~20 lines)
   - Exposes tab query to Claude via MCP

3. **Payload actions: focus_tab + switch_tab with tabId** (background.ts + runtime.model.json, ~25 lines)
   - Payload can activate a specific tab
   - Route subsequent steps to that tab

**Effort:** 2–3 hours (no complex APIs, follows existing patterns)

**Pros:**
- Solves window.open() forever, not just Apps Script
- Enables multi-window workflows (cross-tab data passing, etc.)
- Architecture is proven (relay already routes cross-origin WebSocket messages)
- Risk is LOW (no dangerous APIs, no user prompts)
- Result is general-purpose, reusable

**Cons:**
- Requires short extension dev cycle
- Adds API surface (but small)

**Risk assessment:** LOW

---

### Option B: Use System Automation (osascript / mac-controller) 

**What:** Instead of Yeshie, use macOS native UI automation to click the popup window.

**Pros:**
- Works immediately
- No extension changes needed
- Can test Apps Script deployment right now

**Cons:**
- Fragile (macOS-specific, breaks with different window managers, different Chrome versions)
- Doesn't scale to VPS (can't run osascript on remote machine)
- No structured feedback from popup (blind clicking)
- Not reusable for other multi-window scenarios
- Defeats the purpose of RPA (gives up on browser-native control)

**Risk assessment:** MEDIUM (works locally but doesn't generalize)

**Verdict:** Viable only as a **temporary workaround** for local testing. Not a production solution.

---

### Option C: Document the Limitation

**What:** Accept that Yeshie doesn't support window.open() and advise workarounds:
- Manually click the popup
- Use API instead of UI
- Test with permission pre-granted
- Disable popup blocker (if testing via automation)

**Pros:**
- Zero effort

**Cons:**
- Leaves gmail-bridge incomplete
- Users hit this wall frequently
- No general solution for future OAuth flows that use popups

**Risk assessment:** LOW technical risk, HIGH product risk

---

## Recommendation

**Choose Option A: Extend Yeshie.**

### Why

1. **Apps Script is blocked right now.** The gmail-bridge deployment needs this.
2. **2–3 hours is fast.** Not a major commitment.
3. **The pattern already exists.** Background worker has `list_tabs` listener; relay already routes Socket.io messages. We're just exposing what's already there.
4. **Solves the general problem.** Not just Apps Script, but any window.open() OAuth flow.
5. **Enables future features.** Multi-window workflows (copy from tab A, paste to tab B) become possible.
6. **Risk is minimal.** No dangerous APIs (`chrome.debugger` is not needed, no CSP bypasses). Follows existing patterns.

### Next Steps

1. Assign extension work to extend background.ts + cc-bridge-mcp/server.js + runtime.model.json
2. Add `query_tabs` socket.io listener (30 min)
3. Add `yeshie_query_tabs` MCP tool (20 min)
4. Add `focus_tab` and extend `switch_tab` (1 hour)
5. Write integration test: query_tabs → focus_tab → run steps in popup (30 min)
6. Test against real Apps Script "Review permissions" flow
7. Once verified, use updated Yeshie in gmail-bridge deployment

**Estimated total time:** 2–3 hours including tests.

---

## Architecture Notes

### How the Fix Works

1. Apps Script runs: click "Review" → popup opens
2. Parent tab (running Yeshie) calls MCP tool: `yeshie_query_tabs({ urlPattern: 'accounts\\.google' })`
3. Background worker queries Chrome tabs, finds popup tabId
4. Parent tab continues with new payload action: `{ action: 'focus_tab', tabId: <popup_id> }`
5. Background worker activates popup tab
6. Subsequent chain steps route to popup tabId (via `switch_tab`)
7. PRE_CLICK_GOOGLE_ACCOUNT runs in popup context, selects account
8. Consent screen appears, payload clicks "Continue"
9. Popup closes, session established
10. Final redirect redirects parent tab

**Invariants:**
- Background worker survives popup close (service worker context)
- Tab registry tracks popup tabId
- Relay maintains command queue
- Parent tab resumed when popup completes

---

## Decision Summary

| Dimension | Recommendation |
|-----------|-----------------|
| **Best approach** | Extend Yeshie (Option A) |
| **Effort** | 2–3 hours |
| **Risk** | LOW |
| **Benefit** | Unblocks Apps Script + enables multi-window workflows |
| **Timeline** | Can be done this week |
| **Fallback** | Option B (osascript) for temporary local testing only |
| **If rejected** | Document limitation (Option C), accept incomplete gmail-bridge |

**Status:** READY FOR IMPLEMENTATION

See `auth-flow-handler.payload.json` for the prototype payload once extension is updated.
