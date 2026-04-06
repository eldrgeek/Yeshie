# Yeshie RSI Loop — Continuity Document
**For:** New Claude Web (CW) session continuing from April 6, 2026 (Part 2) session
**Project:** ~/Projects/yeshie
**Read this first. Then read nothing else.**

## Planned Architecture: Persistent Tri-Model Listeners

### Current problem
`yeshie-listen.sh` is one-shot: handle one message, exit, watcher restarts (2-8s gap → `no_listener` failures).
Escalation (Haiku→Sonnet→Opus) is baked into the shell script and brittle.

### Target architecture

Three persistent `claude` processes, each maintaining a Socket.IO connection to the relay — exactly like the extension does today:
Relay ←—socket (role: listener-haiku)—— claude --model haiku  --output-format stream-json [loop]
Relay ←—socket (role: listener-sonnet)— claude --model sonnet --output-format stream-json [loop]
Relay ←—socket (role: listener-opus)—— claude --model opus   --output-format stream-json [loop]

Each process:
1. Connects to relay with `{ role: 'listener-<model>' }`
2. Enters its own internal loop: `yeshie_listen → process → yeshie_respond → repeat`
3. Never exits — relay restarts it only on crash (launchd, like the relay itself) or when the base-listener.md changes. 

### CC invocation with JSON I/O
```bash
claude \
  --model claude-haiku-4-5 \
  --output-format stream-json \
  --input-format json \
  -p "$(cat prompts/base-listener.md)" \
  < /tmp/listener-context.json
```

`--output-format stream-json`: each event (text delta, tool call, result, cost) is a newline-delimited JSON object — no text scraping, clean error detection, parseable costs/exit codes.

`--input-format json`: stdin is a JSON object `{ "prompt": "...", "context": {...} }` rather than a raw text file — structured, no quoting hazards.

### Relay changes needed
- Track `extensionSocket` per model: `listenerSockets = { haiku, sonnet, opus }`
- Default route: send to `haiku`; if haiku returns `{ escalate: true }`, retry with `sonnet`, then `opus`
- `/chat/status` reports which tiers are currently connected
- Remove grace-period hack (was masking the one-shot gap problem)

### Shell changes needed
- New: `scripts/start-listeners.sh` — launches all three with `launchctl` like the relay
- Retire: `scripts/yeshie-listen.sh` one-shot model + `scripts/yeshie-listener-watch.sh` watcher
- Three new launchd plists: `com.yeshie.listener-haiku`, `com.yeshie.listener-sonnet`, `com.yeshie.listener-opus`

### Benefits
- Zero listener gap → no more `no_listener` failures mid-campaign
- Escalation is relay logic, not shell script fragility
- JSON I/O → structured responses, parseable costs, clean tool-call detection
- Each model tier stays warm (system prompt loaded, context ready)

### Downstream Impact on Existing Docs/Code

These items in this document and in the codebase become **stale or wrong** once the tri-model architecture is implemented:

| Item | Current state | Changes to |
|---|---|---|
| **Issue 2** (listener gap) | Active known issue | Eliminated — remove from Known Issues |
| **`chat/status` response** | `{ listenerConnected: bool }` | `{ listeners: { haiku, sonnet, opus } }` — update Pre-Campaign Checklist |
| **Convention: "Never fire parallel campaigns"** | Required (listener gap) | Rationale changes — gap gone, but sequential still preferred for debug clarity. Update wording. |
| **`scripts/yeshie-listen.sh`** | Active listener script | Retired — note in File Map |
| **`scripts/yeshie-listener-watch.sh`** | Active watcher | Retired — note in File Map |
| **`scripts/start-listeners.sh`** | Does not exist | New — launches 3 persistent Claude processes via launchd |
| **launchd plists** | `com.yeshie.relay`, `com.yeshie.watcher` | Add: `com.yeshie.listener-haiku`, `com.yeshie.listener-sonnet`, `com.yeshie.listener-opus` |
| **First Actions checklist** | Step 5 references rebuild | Add step: verify all 3 listener tiers connected |
| **`run-campaign.sh` retry logic** | 3 retries × 15s (listener-gap workaround) | Simplify or remove — no gap to bridge |
| **Relay `index.js` escalation** | N/A (done in shell) | Escalation logic now lives in relay: `haiku → sonnet → opus` on `{ escalate: true }` |

**Note:** Do not refactor these items until the tri-model implementation is complete and tested. The table above is the change list for that implementation session.

---

## What Yeshie Is

A Chrome extension + local relay that lets Claude run web automation payloads against live browser tabs. Architecture:

```
CW (you) → POST /chat → Relay (port 3333) → Socket.IO → Chrome Extension → Live tab → ChainResult
```

Your job is **Recursive Self Improvement**: design tasks, dispatch campaigns, evaluate results, change components, iterate

---

## Two-Loop RSI Architecture

Yeshie has two distinct improvement loops operating at different levels. Understanding which loop you're in determines what you're allowed to change.

### Inner Loop — Execution & Model RSI
**Components:** Tab Panel ↔ Listener (Haiku/Sonnet/Opus) ↔ Extension

This loop runs during campaigns. It self-improves by updating the **three-layer model files** only:
- `models/runtime.model.json` — Layer 1: ISA spec
- `models/generic-vuetify.model.json` — Layer 2: framework patterns
- `sites/{domain}/site.model.json` — Layer 3: site state graph
- Payload `cachedSelector` / `cachedConfidence` / `resolvedOn` fields (via `improve.js`)

After 5 successful runs, a payload promotes itself to `production` mode — pure cached lookups, no heuristics.

**The inner loop does NOT change:** prompt text, relay code, extension code, architecture.

### Outer Loop — Architecture & Learning Loop RSI
**Actors:** CD (Claude Desktop) / CCw (Claude CoWork)

The outer loop's job is to **supervise how well the inner loop is learning** — and to fix it when it isn't. CD/CCw RSIs by:
- Changing **prompts** (`prompts/base-listener.md`, listener system prompts)
- Changing **data structures** (payload schema, model format, relay message protocol)
- Changing **code** (relay, extension, background.ts, scripts)
- Changing **architecture** (e.g., moving from one-shot listeners → persistent tri-model listeners)

**Decision triggers for outer-loop intervention:**
- Campaign failure patterns that model updates can't fix
- Learning plateau (selectors resolving but not caching; tasks not promoting to production)
- New site or framework needs a new Layer 2 model
- Scaling requirements exceed current listener architecture

**The rule:** If the problem is "the model doesn't know this selector yet" → inner loop (run more campaigns, let `improve.js` cache it). If the problem is "the system can't learn efficiently" → outer loop (CD/CCw changes the architecture).

---

---

## What Was Built — April 5, 2026 Session

### Infrastructure (all working)
| Component | Location | Purpose |
|---|---|---|
| Relay server | `packages/relay/index.js` | Routes messages, hosts status board |
| Status board | `http://localhost:3333/status-board` | Live job monitor, auto-refreshes 10s |
| Campaign runner | `scripts/run-campaign.sh` | Sends tasks sequentially, one at a time |
| Watchdog | `scripts/watchdog.sh` | Heartbeats to status board, injects into CD on done |
| Listener | `scripts/yeshie-listen.sh` | Haiku→Sonnet→Opus escalation, one message/invocation |

MW: campaigns should be run by you, Claude Code or Claude CoWork checking the results for each test.

### Key architectural decisions made
- **Status board in separate Chrome window** — not a tab, to prevent the extension from hijacking it with YeshID navigation.
- **CD injection on completion** — watchdog calls osascript to type into Claude Desktop when job finishes.
- **Always pipe task via stdin:** `

---

## What Was Built — April 6, 2026 Session

### Tab-Aware Side Panel Conversations

The Yeshie side panel now maintains **separate conversations per browser tab**. Previously it had one global conversation; now each tab has its own history.

**Files changed:**
| File | What changed |
|---|---|
| `packages/extension/src/entrypoints/sidepanel/main.ts` | Replaced flat `messages[]` with `Map<number, Message[]>` keyed by tabId. Header now shows active domain (e.g. `Yeshie — app.yeshid.com`). Side panel listens for `tab_activated`, `show_user_message`, `show_response`, `get_tab_history`, `tab_removed` messages from background. |
| `packages/extension/src/entrypoints/sidepanel/index.html` | Header styling: truncates long domain names. |
| `packages/extension/src/entrypoints/background.ts` | Added: `chrome.tabs.onActivated` + `chrome.windows.onFocusChanged` → broadcasts `tab_activated` to side panel. `chrome.tabs.onRemoved` → broadcasts `tab_removed` for memory cleanup. Added `inject_chat` socket.io handler (relay → background → side panel + /chat). Fixed pre-existing bug: `chat_message` handler was discarding `history` (always sent `history: []`), now correctly forwards `msg.history`. `teach_start` now uses `msg.targetTabId` (originating conversation tab) before falling back to active-tab heuristic. |
| `packages/relay/index.js` | Added `POST /chat/inject` HTTP endpoint: accepts `{ tabId, message }`, forwards `inject_chat` to extension socket. Added `inject_chat` socket.io handler on any client socket: forwards to extension, acks immediately. |
| `tests/unit/sidepanel.test.ts` | 5 new test cases: per-tab isolation, two-tabs-same-site distinctness, tab close cleanup, response-lands-in-originating-tab, structural checks of new API. |
| `tests/unit/relay-chat.test.ts` | 4 new test cases: `/chat/inject` 503/400 validation, `tabId`+`history` forwarding, concurrent dual-tab independent flows. |

### Test results: 259 pass, 1 pre-existing failure
The only failing test is `tests/unit/listener.test.ts` line 52 — it asserts `base-listener.md` contains `"claude_code"`. This was already failing before this session and is unrelated to tab changes.

### How inject_chat works (for testing)
A test client can inject a message into a specific tab's side panel conversation two ways:

**Via HTTP (curl):**
```bash
curl -s -X POST http://localhost:3333/chat/inject \
  -H "Content-Type: application/json" \
  -d '{"tabId": <tab_id>, "message": "your test message"}'
```

**Via Socket.IO (WebSocket):**
```javascript
const socket = io('http://localhost:3333');
socket.emit('inject_chat', { tabId: 42, message: 'test' });
socket.on('inject_ack', (r) => console.log(r)); // { ok: true }
```

The relay forwards `inject_chat` → extension background → side panel displays as user message → background POSTs to `/chat` → listener receives it as a normal chat message → response routed back to that tab's conversation.

### Response always lands in originating tab
If the user sends a message from Tab A then switches to Tab B while waiting, the response still appears in Tab A's conversation (not Tab B's). The `sendingTabId` is captured at send time.
---

## What Was Built — April 6, 2026 Session (Part 2)

### Frontier Model Automation (trustedType overhaul)

`trustedType()` in `background.ts` was rewritten to handle both React-controlled textareas and contenteditable (ProseMirror/Tiptap) inputs correctly.

**The React textarea hack** (`_valueTracker.setValue(prev)` before dispatching input event) was already documented in SPECIFICATION.md from a prior session — this session rediscovered and applied it to fix DeepSeek submit failures. Add to memory if you see React textarea submit failing silently.

**Two input modes:**
- `textarea` → `nativeInputValueSetter` + `_valueTracker.setValue(prev)` + positional send button click
- `contenteditable` (Tiptap/ProseMirror) → `Input.insertText` (CDP) + Enter key

**Frontier model status:**
| Model | Tab ID | Input type | Send selector | Status |
|---|---|---|---|---|
| Grok | 1637801571 | `div.tiptap.ProseMirror[contenteditable='true']` | `button[aria-label='Submit']` | ✅ Validated |
| DeepSeek | 1637801583 | textarea | `div[role='button'][class*='ds-icon-button--sizing-container']` | ⚠️ CF Turnstile blocks CDP navigate — manual nav works |
| Claude.ai | 1637801558 | contenteditable | TBD | ⬜ Not tested |
| ChatGPT | 1637801574 | TBD | TBD | ⬜ Not tested |
| Gemini | 1637801577 | TBD | TBD | ⬜ Not tested |

**DeepSeek Cloudflare note:** CDP-initiated navigation to `chat.deepseek.com` lands on `chrome-error://` due to Turnstile. Skip the `navigate` step — user navigates manually. The hidden `div#cf-overlay` in DOM is the CF widget; once it's dismissed and the prompt input is visible, automation works.

**Site models and tasks created:**
- `sites/chat.deepseek.com/site.model.json` + `tasks/01-submit-prompt.payload.json`
- `sites/grok.com/site.model.json` + `tasks/01-submit-prompt.payload.json`

### Persistent Memory System

Three-tier continuity structure created so future sessions don't re-learn hard-won discoveries:

| File | Purpose |
|---|---|
| `CLAUDE.md` (top section) | Hot cache — essentials Claude reads in every session |
| `memory/mike.md` | Mike's profile, working style, ADD note, collaborative patterns |
| `memory/patterns.md` | Hard-won technical discoveries (add anything that took >10min) |
| `memory/projects.md` | Yeshie sprint status, cc-bridge tools, INTOO context |

**Rule:** Any discovery that took >10min to figure out → `memory/patterns.md`. Any pattern that's needed in every session → promote to CLAUDE.md hot cache table.

### Three-Case Notification Architecture

When async work finishes (after MCP bridge timeout), Claude Desktop gets a macOS notification.

**Case 1 — chain `notify` step:**
Add as last step in any payload:
```json
{ "stepId": "sN", "action": "notify", "message": "Done: {{task}}", "title": "Yeshie" }
```
Flow: extension `socket.emit('notify')` → relay `runOsascript()` → macOS notification (3 retries, 2s gap). Works after bridge timeout because extension↔relay socket persists.

**Case 2 — bash fire-and-forget:**
End any `nohup` script with:
```bash
curl -s -X POST http://localhost:3333/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Done", "title": "Yeshie"}'
```
Or use the osascript retry loop directly (see `memory/patterns.md`).

**Case 3 — MCP tool completions:**
`notifyHost()` wired into `shell_exec`, `claude_code`, `yeshie_run` in `cc-bridge-mcp/server.js`. Uses detached `spawn` + `unref()`. `yeshie_run` skips fallback if chain already has a `notify` step.

**New relay endpoint:** `POST http://localhost:3333/notify` — `{ message, title }`.

### Also: Extension rebuilt
`background.ts` changes from April 6 session are built and live. Issue 4 in Known Issues is resolved.

---

## Current State

### Infrastructure health check
```bash
curl -s http://localhost:3333/status        # relay + extension
curl -s http://localhost:3333/chat/status   # listener
```
Both should show `extensionConnected: true` and `listenerConnected: true`.

### Campaign progress
| Campaign | File | Status |
|---|---|---|
| 01-people | `sites/yeshid/rsi-tasks/01-people.tasks.txt` | ✅ Ran — 5/7 OK, 24 people confirmed |
| 02-directory-groups | `sites/yeshid/rsi-tasks/02-directory-groups.tasks.txt` | 🔄 Rerun needed — task 1 OK (Google Workspace found), rest failed due to listener gap |
| 03-applications | `sites/yeshid/rsi-tasks/03-applications.tasks.txt` | ⬜ Not run |
| 04-access-audit | `sites/yeshid/rsi-tasks/04-access-audit.tasks.txt` | ⬜ Not run |
| 05-security | `sites/yeshid/rsi-tasks/05-security.tasks.txt` | ⬜ Not run |
| 06-workflows | `sites/yeshid/rsi-tasks/06-workflows.tasks.txt` | ⬜ Not run |
| 07-settings | `sites/yeshid/rsi-tasks/07-settings.tasks.txt` | ⬜ Not run |

---

## Known Issues — Fix Before Running

### Issue 1: TabId for campaign curl POSTs (CRITICAL — caused tab hijacking)
The campaign `run-campaign.sh` script sends tasks via `POST /chat` without a `tabId`. The extension's side panel is now tab-aware, but the listener's DO-mode `yeshie_run` calls still need the correct tab to execute payloads against.

**Fix:** At campaign start, discover the YeshID tab ID via `Control Chrome:list_tabs` — look for the `app.yeshid.com` tab. Pass `"tabId": <id>` in every `/chat` POST body so the listener can pass it to `yeshie_run`.

**Note:** The tab-aware side panel changes (April 6) addressed conversations in the panel itself. The campaign runner issue is separate — it's about which tab payload execution targets.

### Issue 2: Listener gap between tasks
The listener is one-shot (handles one message then exits). The watcher restarts it, but there's a 2-8s gap. Tasks arriving during the gap get `no_listener`.

**Fix applied:** `run-campaign.sh` already retries once after 8s. Increase to 3 retries with 15s wait if still failing.
**Workaround:** Check `curl -s http://localhost:3333/chat/status` shows `listenerConnected: true` before launching any campaign.

**Permanent fix:** The planned tri-model listener architecture (see "Planned Architecture" above) eliminates this entirely — persistent processes never leave a gap. This issue and its workarounds should be removed once that architecture is implemented. This is an **outer-loop RSI task** (requires changing relay code, scripts, and launchd config).

### Issue 3: Google account chooser
When YeshID session expires, Google OAuth redirects to account chooser. The extension hangs.

**Protocol:** Always click `mw@mike-wolf.com` without asking. Check Chrome tabs before each campaign — if you see `accounts.google.com`, click through it first.

### ~~Issue 4: Extension needs rebuild~~ — RESOLVED
`background.ts` changes from April 6 Part 1 + Part 2 sessions are built. Extension is current.
If extension ever becomes stale after future `background.ts` changes:
```bash
cd ~/Projects/yeshie/packages/extension && npm run build
# Reload in chrome://extensions, verify extensionConnected: true
```

### Issue 5: cc-bridge-mcp server needs restart for notifyHost to activate
The `notifyHost()` addition to `cc-bridge-mcp/server.js` requires restarting Claude Desktop (which restarts the MCP server) to take effect.

---

## Pre-Campaign Checklist (run every time)

```bash
# 1. Relay and extension up?
curl -s http://localhost:3333/status

# 2. Listener up?
curl -s http://localhost:3333/chat/status

# 3. Check Chrome tabs
# Use Control Chrome:list_tabs
# Should see: one app.yeshid.com tab, status board window
# If Google auth page present: click mw@mike-wolf.com before proceeding

# 4. Note the YeshID tab ID from step 3 — use it in campaign launch
```

---

## How to Launch a Campaign

### Step 1: Write the runner script (avoid inline quoting)
```bash
SESSION="rsi-02-$(date +%Y%m%d-%H%M%S)"
LOG="/tmp/yeshie-rsi/$SESSION/runner.log"
mkdir -p "/tmp/yeshie-rsi/$SESSION"

cat > /tmp/run-02.sh << RUNNER
#!/bin/bash
cd ~/Projects/yeshie
bash scripts/run-campaign.sh sites/yeshid/rsi-tasks/02-directory-groups.tasks.txt $SESSION >> $LOG 2>&1
echo "EXIT: \$?" >> $LOG
RUNNER
chmod +x /tmp/run-02.sh
```

### Step 2: Launch with watchdog
```bash
nohup bash /tmp/run-02.sh > /dev/null 2>&1 &
CAMP_PID=$!
nohup bash ~/Projects/yeshie/scripts/watchdog.sh $CAMP_PID "campaign-02" $LOG 60 > /tmp/watchdog-02.log 2>&1 &
echo "Campaign PID: $CAMP_PID | Log: $LOG"
```

### Step 3: End your turn immediately
Watchdog posts heartbeats to status board every 60s. On completion it injects "DONE..." into Claude Desktop. You will be notified.

### Step 4: When notified, read results
```bash
cat $LOG
# or for a specific task result:
cat /tmp/yeshie-rsi/$SESSION/task-01.json
```

---

## Campaign RSI Loop Protocol

This is the core loop. Follow it strictly.

```
1. CW: Run pre-campaign checklist
2. CW: Launch campaign N with watchdog, END TURN
3. Watchdog: Posts heartbeats to status board
4. Watchdog: On completion → injects "[HH:MM:SS] DONE campaign-N..." into CD
5. CW: Wakes on injection, reads log
6. CW: Evaluates results:
   - All tasks OK? → Launch campaign N+1
   - Some failed? → Fix root cause, rerun campaign N
   - Infrastructure issue? → Fix it, verify, then rerun
7. CW: Update TASKS-50-YESHID.md with learned tasks
8. Go to step 1
```

---

## Inject into Claude Desktop (for callbacks)

The watchdog does this automatically. If you need to do it manually:

```bash
# Write the script
cat > /tmp/inject-cd.scpt << 'SCPT'
tell application "Claude" to activate
delay 0.5
tell application "System Events"
  tell process "Claude"
    set frontmost to true
    delay 0.3
    keystroke "your message here"
    delay 0.3
    keystroke return
  end tell
end tell
SCPT

# Schedule it to fire after your turn ends
nohup bash -c 'sleep 5 && osascript /tmp/inject-cd.scpt' > /dev/null 2>&1 &
# Then END YOUR TURN IMMEDIATELY — do not add more tool calls
```

**Critical:** CD only accepts input when it's not processing. The script must fire AFTER your response ends.

---

## Status Board

- URL: `http://localhost:3333/status-board`
- Should be open in a **separate Chrome window** (not a tab)
- POST to add a message: `curl -s -X POST http://localhost:3333/status-board -H "Content-Type: application/json" -d '{"text":"your message"}'`
- Auto-refreshes every 10s with live countdown
- Relay restart clears all messages (in-memory only)

---

## Key Conventions

- **Never fire parallel campaigns** — currently: the listener is one-shot, parallelism causes all-`no_listener`. After tri-model migration: sequential still preferred for debug clarity and relay routing determinism.
- **Always write runner to a file** — `cat > /tmp/run-NN.sh` then execute. Never inline with `nohup bash -c "..."` — variable expansion silently fails
- **Status board = heartbeats; CD injection = completion only** — don't spam CD with every update
- **Google OAuth:** Always click `mw@mike-wolf.com` without asking Mike
- **YeshID has 24 people** — confirmed by campaign 01
- **Google Workspace** is the only directory — confirmed by campaign 02 task 1

---

## File Map
```
~/Projects/yeshie/
├── CONTINUITY.md                    ← this file
├── RSI-SESSION-CONTEXT.md           ← detailed session history
├── sites/yeshid/
│   ├── TASKS-50-YESHID.md          ← 50-task tracking (update after campaigns)
│   └── rsi-tasks/
│       ├── 01-people.tasks.txt
│       ├── 02-directory-groups.tasks.txt
│       ├── 03-applications.tasks.txt
│       ├── 04-access-audit.tasks.txt
│       ├── 05-security.tasks.txt
│       ├── 06-workflows.tasks.txt
│       ├── 07-settings.tasks.txt
│       └── all-tasks.txt
├── scripts/
│   ├── run-campaign.sh             ← sequential campaign runner
│   ├── watchdog.sh                 ← job monitor
│   ├── yeshie-listen.sh            ← [RETIRING] one-shot listener (haiku→sonnet→opus escalation)
│   ├── yeshie-listener-watch.sh   ← [RETIRING] watcher/restart for one-shot listener
│   └── start-listeners.sh          ← [PLANNED] launches 3 persistent listener processes via launchd
└── packages/
    ├── relay/index.js              ← relay + status board + inject endpoint
    └── extension/
        └── src/entrypoints/
            ├── background.ts       ← tab activation + inject_chat handler
            └── sidepanel/
                ├── main.ts         ← per-tab conversation management
                └── index.html      ← header shows active domain
```

---

## First Actions for New Session

1. `curl -s http://localhost:3333/status` — is relay up? (`extensionConnected: true`)
2. `curl -s http://localhost:3333/chat/status` — is listener up?
   - **Pre-tri-model:** expect `{ listenerConnected: true }`
   - **Post-tri-model:** expect `{ listeners: { haiku: true, sonnet: true, opus: true } }`
3. `Control Chrome:list_tabs` — note YeshID tab ID, check for auth page
4. Open `http://localhost:3333/status-board` in a separate Chrome window if not already open
5. Fix Issue 1 (tabId) in `run-campaign.sh` — add YeshID tab ID discovery at campaign start
6. Rerun campaign 02
7. **Frontier model work (if continuing):** Test Claude.ai, ChatGPT, Gemini automation — Grok ✅ done, DeepSeek ⚠️ CF issue deferred
