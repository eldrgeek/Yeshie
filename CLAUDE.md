# Yeshie — Agent Context Document

**Project:** `~/Projects/yeshie`
**What it is:** A Chrome extension + local relay server that lets Claude run web automation payloads against live browser tabs. Claude sends a payload JSON -> extension executes it autonomously across page navigations -> returns a ChainResult.

---

## Current State

### Validated payloads (YeshID)
- `01-user-add` — 18 steps, creates a user in YeshID
- `02-user-delete` — 18 steps, 7.7s, full offboard flow
- `03-user-modify` — 14 steps, 8.4s, edit user attributes (first name, last name, email)
- `04-site-explore` — 19 pages discovered, 149 buttons, 53 inputs, 27 tables

### Remaining payloads (not yet validated)
- `05-integration-setup` — SCIM integration (has `preRunChecklist` for SCIM docs research)

### Login flow automation (implemented)
The extension detects session expiry and handles Google SSO re-authentication:
- **Pre-chain:** `PRE_CHECK_AUTH` runs before any chain; if unauthenticated, triggers `waitForAuth`
- **Mid-chain:** navigate handler detects redirect to `/login` and returns `auth_required`; chain loop calls `waitForAuth` then retries the failed step
- **`waitForAuth` flow:** navigates to YeshID login -> clicks "Sign in with Google" -> detects `accounts.google.com` tab URL -> runs `PRE_CLICK_GOOGLE_ACCOUNT(mw@mike-wolf.com)` -> polls for redirect back to YeshID with nav drawer present
- **Note:** Google account email is hardcoded as `mw@mike-wolf.com` — should be parameterized later
- **Caveat:** Not yet tested against a real expired session end-to-end

### Infrastructure
156 tests passing across 12 suites (`npm test`). Both services run via launchd — no manual startup.

| Service | launchd label | Log |
|---------|--------------|-----|
| Relay (port 3333) | `com.yeshie.relay` | `/tmp/relay.log` |
| Watcher + build server (port 27182) | `com.yeshie.watcher` | `/tmp/wxt.log` |

**Health check:** `curl -s http://localhost:3333/status` — expect `{"ok":true,"extensionConnected":true,"pending":0}`

**If `extensionConnected: false`** — reload the extension in `chrome://extensions` (click the reload icon on the Yeshie card). The keepalive alarm (24s) prevents service worker sleep after that.

**If relay or watcher is down:**
```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay
launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher
```

---

## How to Run a Payload

### Via yeshie_run (preferred)
```
yeshie_run(
  payload_path="~/Projects/yeshie/sites/yeshid/tasks/03-user-modify.payload.json",
  params={"user_identifier": "Claude", "new_first_name": "Claude", "new_last_name": "AI", "base_url": "https://app.yeshid.com"},
  tab_id=<YeshID tab id or omit for active tab>
)
```

### Via curl
```bash
curl -s -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\": $(cat ~/Projects/yeshie/sites/yeshid/tasks/03-user-modify.payload.json),
    \"params\": {\"user_identifier\": \"Claude\", \"new_first_name\": \"Claude\", \"new_last_name\": \"AI\", \"base_url\": \"https://app.yeshid.com\"},
    \"tabId\": null,
    \"timeoutMs\": 120000
  }"
```

---

## Architecture

```
Claude (yeshie_run tool or curl)
    |
    | HTTP POST /run
    v
packages/relay/index.js   (Socket.IO server, port 3333)
    |
    | Socket.IO WebSocket
    v
Chrome Extension Background Worker (background.ts)
    |
    |-- chrome.scripting.executeScript (pre-bundled fns, bypasses CSP)
    |-- chrome.debugger Input.insertText (isTrusted events for Vue 3)
    v
Live browser tab -> ChainResult -> socket -> relay -> HTTP response
```

**Key design decisions:**
- Background worker persists across page navigations (content scripts die on nav)
- `chrome.scripting.executeScript` with pre-bundled functions bypasses page CSP (YeshID blocks `eval()`)
- `chrome.debugger Input.insertText` produces `isTrusted:true` events that Vue 3 v-model requires
- Extension has `<all_urls>` host permission — can execute on any domain including `accounts.google.com`

---

## Target Resolution (`PRE_RESOLVE_TARGET`)

7-step priority chain in background.ts:

1. **Cached selector** — confidence >= 0.85, age < 30 days
2. **`.v-label` inside `.v-input`** — standard Vuetify pattern
3. **`div.mb-2` sibling** — YeshID's label pattern (walk siblings to find input)
3b. **Table-row label** — `<td>Label</td><td><input></td>` pattern (YeshID edit form)
4. **`aria-label` / `placeholder`** — attribute matching
5. **`name_contains` button text** — for buttons/links
6. **`fallbackSelectors`** — explicit CSS list in payload

### YeshID-specific patterns discovered
- **People list:** `div.mb-2` sibling labels above `.v-input` (NOT `.v-label` inside `.v-input`)
- **Edit form:** Table-row labels (`<td>First name</td><td><input></td>`) — resolved via Step 3b
- **View vs Edit mode:** Detail page starts read-only; must click "Edit" button to make inputs appear
- **Save button:** Labeled "Confirm" (not "Save") — `name_contains` should include both
- **Generated IDs:** `input-v-10`, `input-v-12` etc change every page load — never hardcode

---

## The `js` Action and CSP Workaround

Payload `js` steps contain code strings. Since `eval()` is blocked, `PRE_RUN_DOMQUERY` in background.ts pattern-matches the code and routes to pre-bundled functions:

- `find(r =>` or `rows.find` -> `PRE_FIND_ROW_AND_CLICK(identifier)`
- `btns` or `button` -> keyword search through buttons
- `checkbox` -> checkbox click pattern
- `clearAndType` / `findVuetifyInput` / `nativeInputValueSetter` -> field modification pattern

All run via `chrome.scripting.executeScript` (pre-bundled, not eval).

---

## Action Types

`navigate`, `type`, `click`, `wait_for`, `read`, `assess_state`, `js`, `find_row`, `click_text`, `hover`, `scroll`, `select`, `click_preset`, `probe_affordances`, `delay`

---

## Repository Structure

```
~/Projects/yeshie/
|-- CLAUDE.md                           <- you are here
|-- SPECIFICATION.md                    <- full product spec
|-- YESHIE-LEARNINGS.md                 <- architecture decisions
|-- src/
|   |-- target-resolver.ts              <- semantic target resolution
|   |-- step-executor.ts                <- action type handlers
|   +-- dry-run.ts                      <- pre-flight resolution checker
|-- tests/
|   |-- unit/                           <- 12 test suites, 156 tests
|   |   |-- target-resolver.test.ts
|   |   |-- step-executor.test.ts
|   |   |-- dry-run.test.ts
|   |   |-- schema.test.ts
|   |   |-- login-flow.test.ts          <- auth detection, SSO, mid-chain recovery
|   |   |-- chain-overlay.test.ts
|   |   |-- progress-panel.test.ts
|   |   |-- relay-chat.test.ts
|   |   |-- listener.test.ts
|   |   |-- sidepanel.test.ts
|   |   |-- teach-tooltip.test.ts
|   |   +-- extract-docs.test.ts
|   +-- fixtures/
|       |-- vuetify-onboard.html
|       +-- yeshid-login.html
|-- models/
|   |-- runtime.model.json              <- Layer 1: ISA spec
|   +-- generic-vuetify.model.json      <- Layer 2: Vuetify 3 patterns
|-- sites/yeshid/
|   |-- site.model.json                 <- Layer 3: YeshID state graph
|   +-- tasks/
|       |-- 00-login.payload.json
|       |-- 01-user-add.payload.json    <- PASS
|       |-- 02-user-delete.payload.json <- PASS
|       |-- 03-user-modify.payload.json <- PASS
|       |-- 04-site-explore.payload.json <- PASS
|       +-- 05-integration-setup.payload.json
|-- packages/
|   |-- extension/                      <- Chrome MV3 extension (WXT)
|   |   |-- src/entrypoints/
|   |   |   |-- background.ts           <- main: relay client + chain executor + auth flow
|   |   |   |-- content.ts              <- postMessage relay
|   |   |   |-- content-overlay.ts      <- progress overlay
|   |   |   +-- sidepanel/              <- chat side panel
|   |   +-- .output/chrome-mv3/         <- built extension (load in Chrome)
|   |-- relay/
|   |   +-- index.js                    <- Socket.IO + HTTP relay (port 3333)
|   +-- watch-and-build.mjs             <- watcher script for hot-reload
+-- improve.js                          <- self-improvement merge script
```

**Related:** `~/Projects/cc-bridge-mcp/server.js` — MCP server with `shell_exec`, `claude_code`, `yeshie_run`, `yeshie_status` tools.

---

## cc-bridge MCP Tools

- `shell_exec(command, workdir, timeout_seconds)` — run shell commands (default 30s)
- `claude_code(task, workdir, timeout_seconds)` — Claude Code non-interactive (3-4min timeout)
- `yeshie_run(payload_path, params, tab_id, timeout_seconds)` — run payload, returns ChainResult
- `yeshie_status()` — check relay + extension connection
- `yeshie_listen(timeout_seconds)` — wait for side panel chat message
- `yeshie_respond(chat_id, response)` — reply to side panel chat
- `yeshie_chat_status()` — check chat listener status

---

## Hot-Reload

Background worker polls `localhost:27182` every 2s. When build number changes, calls `chrome.runtime.reload()`. After reload, navigate to target site to reinject content script (reload doesn't affect open tabs by design — avoids killing sessions).

---

## Pending Work

### 1. Test login flow end-to-end
The `waitForAuth` + `PRE_CLICK_GOOGLE_ACCOUNT` flow is implemented but hasn't been tested against a real expired session yet. Need to verify the full cycle: detect expiry -> click SSO -> select Google account -> resume chain.

### 2. Validate `05-integration-setup`
SCIM integration payload. Has a `preRunChecklist` requiring SCIM docs research before running.

### 3. Self-improvement merge
After successful runs, merge resolved selectors back into payloads:
```bash
node ~/Projects/yeshie/improve.js \
  sites/yeshid/tasks/03-user-modify.payload.json \
  /tmp/chain-result.json
```
Writes back `cachedSelector`, `cachedConfidence`, `resolvedOn`. After 5 runs, payload switches to `production` mode.

### 4. Parameterize Google account email
Currently hardcoded as `mw@mike-wolf.com` in `waitForAuth`. Should come from payload params or site config.

### 5. Extend to other sites
Three-layer architecture works for any site:
1. Create `sites/{domain}/site.model.json`
2. Create `sites/{domain}/tasks/` with payloads
3. If non-Vuetify, add `models/generic-{framework}.model.json` for Layer 2

---

## North Star

"Point at any website -> exploration payload builds site model -> natural language task -> payload generated -> executed -> ChainResult returned. No human writes code."

**Current position:** 4/6 YeshID payloads validated. Login flow automation implemented. Extension handles cross-origin Google SSO. Next: validate remaining payload, then generalize to a second site.
