---
audience: silicon
document: architecture
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Architecture

## System Diagram (text)

```
Claude (MCP client)
  └─ cc-bridge MCP server (~/Projects/cc-bridge-mcp/server.js)
       └─ HTTP POST /run  →  relay (packages/relay/index.js, port 3333)
            └─ Socket.IO WebSocket  →  extension background worker (background.ts)
                 ├─ chrome.scripting.executeScript(pre-bundled fn)  →  live tab DOM
                 └─ chrome.debugger Input.insertText                →  live tab DOM
                      └─ ChainResult  →  Socket.IO  →  relay  →  HTTP response  →  Claude
```

## Extension — Background Worker

File: `packages/extension/src/entrypoints/background.ts`

Responsibilities:
- Maintains Socket.IO connection to relay (survives page navigations; content scripts do not)
- Receives chain payload from relay, iterates steps, calls `PRE_*` functions via `chrome.scripting.executeScript`
- Handles auth recovery: detects `/login` redirect mid-chain, calls `waitForAuth`, retries failed step

Pre-bundled functions (injected via `executeScript`, not `eval` — CSP bypass):

| Function | Purpose |
|----------|---------|
| `PRE_CHECK_AUTH` | Pre-chain: detect unauthenticated state |
| `PRE_RESOLVE_TARGET` | 7-step element resolution cascade |
| `PRE_GUARDED_CLICK` | Click with mutation-observer guard |
| `PRE_GUARDED_READ` | Read element value/text |
| `PRE_ASSESS_STATE` | Evaluate page state conditions |
| `PRE_FIND_ROW_AND_CLICK` | Find table row matching identifier |
| `PRE_FIND_AND_CLICK_TEXT` | Click element matching text |
| `PRE_RUN_DOMQUERY` | Route `js` step code to pre-bundled fn |
| `PRE_CLICK_GOOGLE_ACCOUNT` | Select Google account during SSO |

Trusted input: `chrome.debugger Input.insertText` produces `isTrusted: true` events required by Vue 3 `v-model`.

## Target Resolution Cascade (PRE_RESOLVE_TARGET)

7-step priority, stops at first hit with confidence ≥ 0.85:

| Priority | Strategy | Condition |
|----------|-----------|-----------|
| 1 | Cached selector | confidence ≥ 0.85, age < 30 days |
| 2 | `.v-label` inside `.v-input` | Vuetify standard pattern |
| 3 | `div.mb-2` sibling | YeshID label-above-input pattern |
| 3b | Table-row label | `<td>Label</td><td><input></td>` (YeshID edit form) |
| 4 | `aria-label` / `placeholder` | Attribute matching |
| 5 | `name_contains` button text | Buttons and links |
| 6 | `fallbackSelectors` | Explicit CSS list in payload |

## Relay Server

File: `packages/relay/index.js`

- HTTP server + Socket.IO (port 3333)
- `POST /run` → emits to connected extension → awaits `chainResult` event → returns HTTP response
- `GET /status` → `{"ok":true,"extensionConnected":bool,"pending":N}`
- Logs conversations to `logs/conversations/{date}.jsonl`
- Keepalive alarm (24s) prevents extension service worker sleep

## cc-bridge MCP Server

File: `~/Projects/cc-bridge-mcp/server.js`

MCP tools exposed:

| Tool | Signature | Purpose |
|------|-----------|---------|
| `yeshie_run` | `(payload_path, params, tab_id, timeout_seconds)` | Run payload, return ChainResult |
| `yeshie_status` | `()` | Check relay + extension health |
| `yeshie_listen` | `(timeout_seconds)` | Wait for side panel chat message |
| `yeshie_respond` | `(chat_id, response)` | Reply to side panel chat |
| `yeshie_chat_status` | `()` | Check chat listener status |
| `shell_exec` | `(command, workdir, timeout_seconds)` | Run shell command (default 30s) |
| `claude_code` | `(task, workdir, timeout_seconds)` | Claude Code non-interactive (3–4 min) |

## Payload Format

```json
{
  "_meta": {
    "site": "yeshid",
    "task": "user-add",
    "mode": "exploratory | production",
    "auth": { "googleAccountEmail": "..." }
  },
  "params": ["user_identifier", "new_first_name", "base_url"],
  "chain": [
    {
      "action": "navigate | type | click | wait_for | read | assess_state | js | find_row | click_text | hover | scroll | select | click_preset | probe_affordances | delay",
      "target": { "name": "...", "cachedSelector": "...", "cachedConfidence": 0.92, "resolvedOn": "...", "fallbackSelectors": [] },
      "value": "...",
      "expected": "..."
    }
  ]
}
```

## Self-Improvement Loop

Script: `improve.js`

After successful runs, merges resolved selectors back into payloads:
```bash
node improve.js sites/yeshid/tasks/03-user-modify.payload.json /tmp/chain-result.json
```

Writes back: `cachedSelector`, `cachedConfidence`, `resolvedOn`. After 5 runs payload auto-promotes to `production` mode.

## Auth / Login Recovery

- Pre-chain: `PRE_CHECK_AUTH` runs before chain start; triggers `waitForAuth` if unauthenticated
- Mid-chain: navigate handler detects redirect to `/login` → returns `auth_required` → chain loop calls `waitForAuth` → retries step
- `waitForAuth` flow: navigate to `base_url` → click "Sign in with Google" → detect `accounts.google.com` tab → optionally run `PRE_CLICK_GOOGLE_ACCOUNT(google_account_email)` → poll for redirect back with nav drawer present
- Config: pass `google_account_email` or `sso_email` in params, or `_meta.auth.googleAccountEmail` in payload
- Caveat: not yet tested against a real expired session end-to-end

## Hot-Reload

Background worker polls `localhost:27182` every 2s. On build number change: `chrome.runtime.reload()`. After reload: navigate to target site to reinject content script (by design — avoids killing sessions).

## Key Design Decisions (summary)

| Decision | Why |
|----------|-----|
| Background worker (not content script) | Survives page navigation |
| `chrome.scripting.executeScript` (not `eval`) | Bypasses CSP (YeshID blocks `eval()`) |
| `chrome.debugger Input.insertText` | Produces `isTrusted:true` events for Vue 3 |
| Socket.IO (not plain WebSocket) | Reconnection handling, event namespacing |
| Three-layer model (L1/L2/L3) | Reuse framework knowledge across sites |
| JSON payloads (not code) | Portable, inspectable, self-improving |
