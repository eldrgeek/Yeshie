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
