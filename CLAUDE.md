# Yeshie — Agent Context Document

**Project:** `~/Projects/yeshie`  
**What it is:** A Chrome extension + local relay server that lets Claude run web automation payloads against live browser tabs. Claude sends a payload JSON → extension executes it autonomously across page navigations → returns a ChainResult.

---

## Immediate State (pick up here)

### What's working right now
- ✅ 85/85 unit tests passing (`npm test` from project root)
- ✅ `01-user-add` payload confirmed working end-to-end (user created in YeshID)
- ✅ `02-user-delete` payload confirmed working end-to-end (18/18 steps, 7.7s)
- ✅ Chrome extension built and loaded (WXT, MV3, version 0.1.1)
- ✅ Local relay server connects extension ↔ Claude via Socket.IO + HTTP
- ✅ `yeshie_run` and `yeshie_status` tools added to cc-bridge MCP server
- ✅ Extension connects to relay automatically via Socket.IO on startup
- ✅ Vuetify 3 full event sequence click (PointerEvent + MouseEvent) working
- ✅ `click_text` with async polling (PRE_FIND_AND_CLICK_TEXT) — no separate delay needed
- ✅ `wait_for` with `url_pattern` support for Vue router navigation detection
- ✅ `delay` action type for explicit waits

### What needs finishing (next task)
Validate `03-user-modify` end-to-end. Both `01-user-add` and `02-user-delete` are confirmed working. Next: modify user attributes, then site exploration (`04`), then generalize to a second site.

**Both services run automatically on login via launchd** — no manual startup needed.

| Service | launchd label | Log |
|---------|--------------|-----|
| Relay (port 3333) | `com.yeshie.relay` | `/tmp/relay.log` |
| Watcher + build server (port 27182) | `com.yeshie.watcher` | `/tmp/wxt.log` |

Plist files: `~/Library/LaunchAgents/com.yeshie.relay.plist` and `com.yeshie.watcher.plist`  
Watcher script (permanent): `~/Projects/yeshie/packages/watch-and-build.mjs`

**Check everything is healthy:**
```bash
curl -s http://localhost:3333/status
# Expected: {"ok":true,"extensionConnected":true,"pending":0}
```

**If `extensionConnected: false`** — reload the extension in `chrome://extensions` (click ↺ on the Yeshie card). The extension has an always-on keepalive alarm (every 24s) to prevent the MV3 service worker from sleeping, so after one manual reload it stays connected indefinitely.

**If relay or watcher is down** (e.g. after crash):
```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay
launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher
```

**To stop both services:**
```bash
launchctl unload ~/Library/LaunchAgents/com.yeshie.relay.plist
launchctl unload ~/Library/LaunchAgents/com.yeshie.watcher.plist
```

**Chrome extension path:** `~/Projects/yeshie/packages/extension/.output/chrome-mv3/`  
The extension auto-hot-reloads: background worker polls `localhost:27182` every 2s, calls `chrome.runtime.reload()` when build number changes. After each reload, navigate to the target site to reinject the content script.

---

## How to Run a Payload

### Via cc-bridge yeshie_run tool (preferred)
```
yeshie_run(
  payload_path="~/Projects/yeshie/sites/yeshid/tasks/02-user-delete.payload.json",
  params={"user_identifier": "Deletable", "base_url": "https://app.yeshid.com"},
  tab_id=<active YeshID tab id>
)
```
Returns full ChainResult JSON when the chain completes.

### Via curl (always works, good for debugging)
```bash
curl -s -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\": $(cat ~/Projects/yeshie/sites/yeshid/tasks/02-user-delete.payload.json),
    \"params\": {\"user_identifier\": \"Deletable\", \"base_url\": \"https://app.yeshid.com\"},
    \"tabId\": null,
    \"timeoutMs\": 120000
  }"
```

### Check relay status
```bash
curl -s http://localhost:3333/status
# {"ok":true,"extensionConnected":true,"pending":0}
```

---

## Architecture

```
Claude (cc-bridge yeshie_run tool or curl)
    │
    │ HTTP POST /run
    ▼
packages/relay/index.js   (Node.js, Socket.IO server, port 3333)
    │
    │ Socket.IO  (persistent WebSocket, auto-reconnects)
    ▼
Chrome Extension Background Worker
packages/extension/src/entrypoints/background.ts
    │
    ├── chrome.scripting.executeScript (pre-bundled functions, bypasses page CSP)
    └── chrome.debugger Input.insertText (trusted events for Vue 3 reactivity)
    │
    ▼
Live browser tab (app.yeshid.com)
    │
    ▼
ChainResult → socket → relay → HTTP response → caller
```

**Why this architecture:**
- Background worker persists across page navigations (window context dies on nav, which killed all previous injection-based approaches)
- `chrome.scripting.executeScript` with pre-bundled functions bypasses page CSP (YeshID blocks `eval()` and `new Function()`)
- `chrome.debugger Input.insertText` produces `isTrusted:true` events that Vue 3 v-model responds to (synthetic events are silently ignored)
- Socket.IO relay decouples Claude from the browser — the chain runs autonomously

---

## Repository Structure

```
~/Projects/yeshie/
├── CLAUDE.md                           ← you are here
├── SPECIFICATION.md                    ← full product spec (Rev 12, ~200KB)
├── YESHIE-LEARNINGS.md                 ← architecture decisions and learnings
├── src/
│   ├── target-resolver.ts              ← 6-step semantic target resolution
│   ├── step-executor.ts                ← all 13 action type handlers
│   └── dry-run.ts                      ← pre-flight resolution checker
├── tests/
│   ├── unit/
│   │   ├── target-resolver.test.ts     ← 27 tests
│   │   ├── step-executor.test.ts       ← 38 tests
│   │   ├── dry-run.test.ts             ← 13 tests
│   │   └── schema.test.ts              ← 7 tests
│   └── fixtures/vuetify-onboard.html   ← test fixture (real YeshID DOM structure)
├── models/
│   ├── runtime.model.json              ← Layer 1: ISA spec (action types, resolution algo)
│   └── generic-vuetify.model.json      ← Layer 2: Vuetify 3 patterns
├── sites/yeshid/
│   ├── site.model.json                 ← Layer 3: YeshID state graph + target registry
│   └── tasks/
│       ├── 00-login.payload.json       ← Auth (SSO bypass via assess_state)
│       ├── 01-user-add.payload.json    ← ✅ CONFIRMED WORKING end-to-end
│       ├── 02-user-delete.payload.json ← next to validate
│       ├── 03-user-modify.payload.json
│       ├── 04-site-explore.payload.json
│       └── 05-integration-setup.payload.json
├── improve.js                          ← self-improvement merge script
├── packages/
│   ├── extension/                      ← Chrome MV3 extension (WXT + TypeScript)
│   │   ├── src/entrypoints/
│   │   │   ├── background.ts           ← main: relay socket client + chain executor
│   │   │   └── content.ts              ← postMessage relay (page ↔ background)
│   │   ├── wxt.config.ts
│   │   └── .output/chrome-mv3/        ← LOAD THIS IN CHROME (unpacked)
│   └── relay/
│       └── index.js                    ← Socket.IO + HTTP relay (port 3333)
└── ~/Projects/cc-bridge-mcp/
    └── server.js                       ← yeshie_run + yeshie_status MCP tools here
```

---

## Key Technical Facts

### YeshID specifics
- **URL:** `https://app.yeshid.com`
- **Auth:** Google SSO only — no email/password. Session expires on tab reload. Do not reload tabs programmatically.
- **Framework:** Vuetify 3 + Vue 3
- **CSP:** Blocks `eval()` and `new Function()` — `chrome.scripting.executeScript` with pre-compiled functions is the only way
- **Vue 3 reactivity:** Requires `isTrusted:true` input events — `chrome.debugger Input.insertText` is the only approach that works
- **Label DOM pattern (critical):** YeshID uses `div.mb-2` sibling labels above `.v-input`, NOT `.v-label` inside `.v-input` (the standard Vuetify pattern). Both strategies are in `PRE_RESOLVE_TARGET`.
- **Generated IDs:** `input-v-10`, `input-v-12` etc — change on every page load, never hardcode these as selectors
- **Search input cached selector:** `#input-v-26` on the people list page (also changes on reload — treated as a cache hit only within 30 days)

### Target resolution algorithm (`PRE_RESOLVE_TARGET` in background.ts)
6-step priority chain:
1. **Cached selector** — confidence ≥ 0.85 AND age < 30 days → use directly
2. **`.v-label` inside `.v-input`** — standard Vuetify pattern
3. **`div.mb-2` sibling** — YeshID's actual label pattern (walk siblings to find input)
4. **`aria-label` / `placeholder`** — attribute matching
5. **`name_contains` button text** — for buttons/links
6. **`fallbackSelectors`** — explicit CSS list in payload

### The `js` action and CSP workaround
Payload `js` steps contain code strings. Since `eval()` is blocked, `background.ts` pattern-matches the code string and routes to pre-bundled functions:
- Code with `find(r =>` or `rows.find` → `PRE_FIND_ROW_AND_CLICK(identifier)`
- Code with `btns` or `button` → keyword search through buttons (`offboard`, `confirm`, `manage`, etc.)
- Code with `checkbox` → checkbox click pattern
- All run via `chrome.scripting.executeScript` (pre-bundled, not eval)

### Action types implemented
`navigate`, `type`, `click`, `wait_for`, `read`, `assess_state`, `js`, `find_row`, `click_text`, `hover`, `scroll`, `select`, `click_preset`, `probe_affordances`

### cc-bridge MCP tools
- `shell_exec(command, workdir, timeout_seconds)` — run shell commands (default timeout: 30s)
- `claude_code(task, workdir, timeout_seconds)` — Claude Code non-interactive (times out ~3-4min on large tasks; use `shell_exec` for file writes + npm commands instead)
- `yeshie_run(payload_path, params, tab_id, timeout_seconds)` — run payload via relay, returns ChainResult
- `yeshie_status()` — check relay + extension connection

### Hot-reload mechanism
Background worker fetches `http://localhost:27182/` every 2s. Response is `{"build": N, "ts": ...}`. When build number changes, calls `chrome.runtime.reload()`. The watcher script at `/tmp/watch-and-build.mjs` increments the build count after each successful `wxt build`. After extension reload, the active page needs navigation to reinject the content script (extension reload doesn't affect open tabs automatically, by design — to avoid killing YeshID sessions).

---

## Pending Work (priority order)

### 1. Validate `03-user-modify` end-to-end ← START HERE
Prerequisites: logged-in YeshID session, a test user in the people list, relay running with extension connected.

`02-user-delete` is confirmed working (2026-04-01). The chain: navigate → search → find row → detail page → Manage dropdown (full PointerEvent sequence) → Offboard → date "Immediately" → confirm → verify Deactivated on people list. Key learnings:
- YeshID offboard does NOT redirect to `/workflows/` — stays on offboard page. Verify by navigating back to people list.
- `find_row` clicks the first matching link; if multiple users match, it picks the first (alphabetical/DOM order).
- `click_text` with PRE_FIND_AND_CLICK_TEXT polls for up to 1.5s — no separate delay needed before it.

### 2. Session persistence
YeshID session expires on tab navigation away from the app or on extension reload. Mitigation: start every payload chain with an `assess_state` step that checks for authentication signals and branches to a login step if needed. Since YeshID uses Google SSO (no password), the login branch should open `https://app.yeshid.com` and wait for the user to authenticate manually, then resume.

### 3. Validate remaining payloads
- `03-user-modify` — modify user attributes  
- `04-site-explore` — maps all pages and affordances, populates site model
- `05-integration-setup` — SCIM integration (has `preRunChecklist` that instructs Claude to research SCIM docs before running)

### 4. Self-improvement merge
After each successful run, merge resolved selectors back into the payload file:
```bash
node ~/Projects/yeshie/improve.js \
  sites/yeshid/tasks/02-user-delete.payload.json \
  /tmp/chain-result.json
```
This writes back `cachedSelector`, `cachedConfidence`, and `resolvedOn` for each abstractTarget that was resolved during the run. After 5 runs, the payload switches to `production` mode (single round trip, no per-step reporting).

### 5. Extend to other sites
Same three-layer architecture works for any site:
1. Create `sites/{domain}/site.model.json` (state graph + abstractTargets)
2. Create `sites/{domain}/tasks/` with payload files
3. Layers 1 and 2 (`runtime.model.json`, `generic-vuetify.model.json`) are reused unchanged
4. If the site uses a different framework, add `models/generic-{framework}.model.json` for Layer 2

---

## Running Tests

```bash
cd ~/Projects/yeshie && npm test
# Expected: 85 passed, 4 suites, ~1.5s
```

Tests use jsdom — no browser needed. If tests fail, check that `src/target-resolver.ts` and `src/step-executor.ts` compile (TypeScript errors show up as test suite failures).

---

## Git Log

```
<latest> 02-user-delete PASS: 18/18 steps, full offboard flow working
a5facb5 Bead 4c: keepalive alarm + get_active_runs + relay fixes
2d6ba78 Fix WXT dev mode: srcDir=src, entrypoints in src/entrypoints
ddf4d45 Bead 4b: WXT extension build + content script relay
73a29a8 Bead 4: Yeshie Chrome MV3 extension — background worker survives navigation
866d6a6 Bead 3b PASS: all step types + 85/85 tests green
df3684b Bead 3a PASS: step-executor + 71/71 tests green
bc7a582 Bead 2b PASS: dry-run resolution 47/47 tests green
289c9be Bead 2a PASS: target resolver + 34 unit tests all green
4d3410c Bead 1 PASS: 01-user-add payload executed successfully
```

---

## Related Projects

- `~/Projects/cc-bridge-mcp/server.js` — MCP server giving Claude shell access + yeshie_run/yeshie_status tools. Restart required after editing to pick up new tools.
- `~/Projects/yeshie/packages/debugger-bridge/` — old single-purpose debugger bridge extension, no longer needed (functionality absorbed into background.ts)

---

## North Star

"Point at any website → exploration payload builds site model → natural language task → payload generated → executed → ChainResult returned. No human writes code."

**Current position:** Extension executes payloads reliably across page navigations. Relay connects Claude to extension cleanly. `01-user-add` works. Next milestone: all 6 YeshID payloads validated, then generalize to a second site.

---

## Next Priority: Login Flow Automation

**Problem:** YeshID sessions expire when the tab navigates away or the extension reloads. Every exploration/payload run risks hitting the login page. Currently, the only recovery is manual re-login by the user.

**Goal:** Teach Yeshie to detect session expiry and handle re-authentication automatically, or at minimum gracefully pause and prompt the user.

**YeshID Login Details:**
- Auth method: Google SSO only (no email/password form)
- Login page: `https://app.yeshid.com/login`
- Buttons: "Sign in with Google", "Sign in with Microsoft"
- After SSO: redirects back to last page or `/overview`
- Session stored in cookies — survives page navigation but NOT tab close or extension reload

**What Yeshie should learn:**
1. **Detection:** Recognize when any page returns `/login` instead of the expected URL. The `assess_state` step already checks for `authenticated` state via nav drawer presence.
2. **Graceful handling:** When session expires mid-chain:
   - Pause execution
   - Show overlay: "YeshID session expired — please log in, then I'll resume"
   - Wait for the user to complete SSO
   - Detect when authentication succeeds (nav drawer appears)
   - Resume the chain from where it left off
3. **Pre-chain check:** Every payload should start with `assess_state` → if not authenticated, enter the login wait flow before proceeding
4. **Google SSO flow:** Clicking "Sign in with Google" opens Google's OAuth. The extension cannot automate this (different origin, security). But it CAN:
   - Click the "Sign in with Google" button
   - Wait for the redirect back to YeshID
   - Detect when the nav drawer appears (= authenticated)

**Implementation approach:**
- Add a `PRE_WAIT_FOR_AUTH` function to background.ts that polls for the nav drawer
- Wrap `startRun` with an auth check that enters the wait flow if needed
- Send an overlay message to the user while waiting
- On timeout (e.g., 120s), abort and report auth failure

