# Technical Patterns & Hard-Won Discoveries

Accumulated across sessions. Add to this whenever something takes >10 minutes to figure out.

---

## MCP / Relay Timeouts

**Problem:** `yeshie_run` and `shell_exec` both cap at ~60s at the MCP bridge level regardless of `timeout_seconds`. Any chain taking >55s gets a bridge-level timeout, not a relay timeout.

**Fix — fire and forget:**
```bash
nohup bash -c '
  PAYLOAD=$(cat path/to/payload.json)
  curl -s -X POST http://localhost:3333/run \
    -H "Content-Type: application/json" \
    -d "{\"payload\": $PAYLOAD, \"params\": {...}, \"tabId\": ..., \"timeoutMs\": 90000}" \
    > /tmp/result.json 2>&1
' > /dev/null 2>&1 &
echo "PID: $!"
# Then: sleep 35 && cat /tmp/result.json (in a second shell_exec)
```

**Fix — split chains:** Break long chains into: (1) type+submit, (2) wait externally, (3) read response.

---

## React Controlled Inputs

**Problem:** `Input.insertText` via CDP writes to DOM but bypasses React's `_valueTracker`. React's submit handler sees empty state and ignores Enter key.

**Fix (from SPECIFICATION.md — the Automata hack):**
```javascript
const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
const prev = el.value;
if (nativeSetter) { nativeSetter.call(el, newValue); } else { el.value = newValue; }
if (el._valueTracker) { el._valueTracker.setValue(prev); }  // ← key step
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```

**Context:** This is in `trustedType()` in `background.ts`. Works for textarea. For contenteditable, use `Input.insertText` directly (Vue 3 requires isTrusted events).

---

## DeepSeek DOM Structure

**Send button:** `div[role="button"][class*="ds-icon-button--sizing-container"]`
- NOT a `<button>` — DeepSeek uses `<div role="button">`
- No aria-label. Class prefix is a CSS module hash (changes per build). Only `ds-icon-button--sizing-container` is stable.
- Confirmed HTML: `<div class="_7436101 ds-icon-button ds-icon-button--l ds-icon-button--sizing-container" role="button">`

**Textarea:** `textarea[placeholder="Message DeepSeek"]` — confirmed by probe.

**Response:** `[class*='ds-markdown']:last-of-type` — confirmed working.

**Cloudflare Turnstile:** Present in DOM as `<div id="cf-overlay" style="display:none">`. Activates on bot detection. CDP navigation can trigger it — tab lands on chrome-error. Manual submit bypasses it. The `hif-dlig.deepseek.com` analytics DNS failures are normal/expected on some networks.

---

## Frontier Model Tab IDs (as of 2026-04-06)

These change when tabs are closed/reopened:
| Model | Tab ID | URL pattern |
|-------|--------|-------------|
| Grok | 1637801571 | grok.com/c/... |
| DeepSeek | 1637801583 | chat.deepseek.com/a/chat/... |
| Claude.ai | 1637801558 | claude.ai/new |
| ChatGPT | 1637801574 | chatgpt.com/c/... |
| Gemini | 1637801577 | gemini.google.com/app/... |

**Refreshing tab IDs:** `mcp__Control_Chrome__list_tabs` works even when `execute_javascript` doesn't.

---

## Two-Loop RSI Architecture

**Inner loop** (Tab Panel ↔ Listener ↔ Extension): Only updates three-layer model files (`site.model.json`, `runtime.model.json`, etc.) and `cachedSelector` fields via `improve.js`. Does NOT change code.

**Outer loop** (CD/CCw): Changes prompts, data structures, code, and architecture. This is where `trustedType`, `PRE_PAGE_SNAPSHOT`, `PRE_RUN_DOMQUERY` improvements live.

When you find yourself editing `background.ts` or `target-resolver.ts`, that's the outer loop.

---

## Contenteditable vs Native Textarea

**Claude.ai:** ProseMirror contenteditable — `[contenteditable='true'][role='textbox']`, `.ProseMirror`
**ChatGPT:** Lexical contenteditable — `#prompt-textarea`, `[data-lexical-editor='true']`
**Gemini:** Angular rich-textarea — `[aria-label='Enter a prompt here']`, `rich-textarea div[contenteditable='true']`
**Grok:** Native TEXTAREA — `textarea[placeholder='Ask anything']` — confirmed by probe
**DeepSeek:** Native TEXTAREA — `textarea[placeholder='Message DeepSeek']` — confirmed by probe

For contenteditable: use `Input.insertText` (isTrusted events, required by Vue/Lexical).
For native textarea: use `nativeInputValueSetter` + `_valueTracker` + `click` send button.

---

## Background Worker Restarts

Hot-reload is polling `localhost:27182` every 2s. When build number changes, extension reloads. This resets `_debuggerTabId` to null. Any in-flight chain will be dropped. Always check `yeshie_status` after a build to confirm reconnection before running tests.

Logs appear in Chrome's extension page (`chrome://extensions` → Yeshie → background service worker inspect).

---

## Notification Architecture (4 Cases)

**Goal:** Notify Mike when async work finishes, even after MCP bridge timeout. **Updated 2026-04-25** to reflect the cc.py / HUD architecture which supersedes the older keystroke-based pattern.

### Case 0 — `cc hud-ask` (PREFERRED for fire-and-forget completions)

For any background task that completes after the MCP bridge timeout, the canonical notification path is the HUD overlay:

```bash
/opt/homebrew/bin/python3 ~/Projects/mac-controller/cc.py hud-ask \
  "DONE: <task name> (exit $EXIT_CODE)" --timeout 300
```

This POSTs to `localhost:3333/hud/ask`, which displays the message in a non-modal NSPanel overlay (HUD on `localhost:3334`) with Confirm / Failed / Partial buttons. Mike can acknowledge without leaving his current work. The relay queues the message; it survives Claude Desktop being mid-response.

Why not osascript keystroke injection (the pre-2026-04 pattern)?
- Plain `key code 36` is Return — adds a newline, doesn't submit. Only Cmd+Return submits.
- Even with `using command down`, keystrokes corrupt whatever Mike is currently typing.
- Multiple completions stack notifications into the input field unsent.

Use cases 1-3 below as fallbacks when `cc hud-ask` is unavailable (HUD/relay down).

### Case 1 — yeshie_run / long chains

Add a `notify` action as the LAST step in any payload chain:
```json
{
  "stepId": "sN",
  "action": "notify",
  "message": "Chain complete: {{task}}",
  "title": "Yeshie"
}
```
Flow: `executeStep` → `socket.emit('notify', {message, title})` → relay `runOsascript()` → macOS notification.
Works even after the MCP bridge 60s timeout because the extension socket connection to the relay persists.

### Case 2 — bash fire-and-forget scripts (FALLBACK — prefer Case 0)

When writing a `nohup` fire-and-forget bash wrapper, the preferred notification is `cc.py hud-ask` (Case 0). If that's unavailable, fall back to a banner via osascript retry loop as the LAST command:
```bash
nohup bash -c '
  <your command here>
  # Notify when done (retry up to 3x)
  for i in 1 2 3; do
    osascript -e '"'"'display notification "Done" with title "Yeshie"'"'"' 2>/dev/null && break
    sleep 2
  done
' > /dev/null 2>&1 &
echo "PID: $!"
```
Or POST to relay directly (simpler, if relay is running):
```bash
curl -s -X POST http://localhost:3333/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Done", "title": "Yeshie"}'
```

### Case 3 — MCP tool completions (cc-bridge)

`notifyHost(message, title)` is wired into `shell_exec`, `claude_code`, and `yeshie_run` completions in `cc-bridge-mcp/server.js`. Uses detached `spawn('osascript', ...)` + `.unref()` so the subprocess outlives any bridge timeout. Retries up to 3x with 2s gap.

`yeshie_run` skips the fallback notify if the chain already included a `notify` step (avoids double-notification).

---

## Claude Desktop AX Injection — AXFocusedUIElement Fix

**Problem:** Claude Desktop 1.3561.0 (updated 2026-04-20) broke ax-inject. The AX tree only shows 14 native elements (AXWindow, AXGroup×10, AXButton×3) when walking from the native window. No AXTextArea visible.

**Root cause:** WKWebView content is now only accessible via `AXFocusedUIElement` on the app element, NOT by walking the window tree. This only works when Claude Desktop is the frontmost app.

**Fix:** `get_content_root(app_elem)` in `claude_ax.py`:
1. Activate Claude via both `activateWithOptions_` AND `osascript "tell application Claude to activate"` (belt-and-suspenders)
2. Wait 0.4s for focus
3. Poll `AXFocusedUIElement` until it returns an `AXWebArea` with children
4. Walk THAT tree (768 elements, finds AXTextArea at depth 19)

**Code location:** `~/Projects/yeshie/scripts/claude_ax.py`, function `get_content_root()`  
**Commit:** `c90012b4`

---

## Architecture Decisions (2026-04-20/21)

**CLI tools over MCP servers:** Mario Zechner's idea — keep a persistent bash shell open and send it messages. Simpler, more robust than MCP plumbing. Favored direction for future tooling.

**cc-bridge refactor:** Split into two MCPs — one for sandbox, one for host — because Claude sometimes uses bash (sandbox) when it should use cc-bridge (host), getting confused about which tools reach the real machine.

**Screenpipe as memory substrate:** Screenpipe records all screen activity to `~/.screenpipe/db.sqlite`. Can be queried directly via SQLite when the MCP isn't running. The `frames` + `ocr_text` tables are the primary search path. Always start screenpipe at login.

**FrontRow:** WebRTC app at `~/Projects/FrontRow`. Replaced manual WebRTC with LiveKit (wss://vpsmikewolf.duckdns.org). Socket.IO show-state server moved from suspended Render to Contebo (port 4001 via nginx TLS). Netlify site: frontrowtheater. LiveKit token endpoint: `/.netlify/functions/get-livekit-token`.

