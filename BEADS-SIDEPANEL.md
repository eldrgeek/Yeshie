# Yeshie Side Panel — Bead Definitions

Each bead is a self-contained unit of work with explicit inputs, outputs, file changes, test requirements, and acceptance criteria. Beads are designed to be executed by any capable LLM agent (Claude Code, Gemini, Codex) without knowledge of other beads.

**Dependency graph:**
```
Bead 5 ──→ Bead 6a ──→ Bead 7 ──→ Bead 8 ──→ Bead 9
                │                     │
           Bead 6b (parallel)    Bead 8b (parallel)
```

Beads 5, 6a, 6b can run on separate agents in parallel after Bead 5 completes.

---

## Bead 5: Docs Knowledge Base Extraction

**Goal:** Create a build script that crawls `docs.yeshid.com` and produces a single JSON file containing all article content, suitable for injection into a Claude system prompt.

**Context for agent:**
- YeshID's documentation is at `https://docs.yeshid.com/` (powered by Pylon)
- 4 collections, ~18 articles total
- Homepage: links to collections at `/collections/{id}-{slug}`
- Collections: link to articles at `/articles/{id}-{slug}`
- Article pages: main text content is in the `<main>` element
- Some articles have sub-collections (e.g. "Custom Actions" under "Connect & Integrate")

**Input files:** None (reads from web)

**Output files:**
```
~/Projects/yeshie/scripts/extract-docs.mjs
~/Projects/yeshie/scripts/docs-kb.json       (generated output)
```

**File spec — `extract-docs.mjs`:**
- Node.js ES module (the project has `"type": "module"` in package.json)
- Uses `fetch` (built-in Node 18+) + `cheerio` for HTML parsing
- Install cheerio as a dev dependency: `npm install -D cheerio`
- Crawl strategy:
  1. Fetch homepage, extract collection URLs
  2. For each collection, fetch page, extract article URLs (including sub-collections)
  3. For each article, fetch page, extract: title, article ID (from URL), collection name, full text content from `<main>`, last-updated date
  4. Deduplicate by article ID
- Output: write `scripts/docs-kb.json` with this schema:

```json
{
  "extractedAt": "2026-04-01T00:00:00Z",
  "articleCount": 18,
  "articles": [
    {
      "id": "4212716734",
      "title": "Connect & Integrate Zoom",
      "collection": "Connect & Integrate",
      "url": "https://docs.yeshid.com/articles/4212716734-how-to-connect-integrate-zoom",
      "lastUpdated": "11 months ago",
      "content": "Introduction\nConnecting and Integrating Zoom with YeshID will enable..."
    }
  ]
}
```

- Content extraction: strip navigation, headers, footers, "Powered by Pylon", emoji ratings, "How helpful was this article?" section, and the table-of-contents sidebar. Keep only the article body text.
- Add `"Related Articles"` field if the article links to other articles.
- Print summary to stdout: `Extracted 18 articles (14,532 tokens est.) → scripts/docs-kb.json`
- Token estimate: count words, multiply by 1.3

**Test requirements:**

Create `tests/unit/extract-docs.test.ts`:

```
TEST 1: Schema validation
  - Read scripts/docs-kb.json (run extract first, or use a fixture)
  - Verify it parses as valid JSON
  - Verify it has `extractedAt` (ISO date string), `articleCount` (number > 0), `articles` (array)
  - Each article has: id (string), title (string, non-empty), collection (string), url (string starting with https://), content (string, length > 50)

TEST 2: Known articles present
  - Verify articles array contains entries with titles matching:
    "Connect & Integrate Zoom"
    "Script / Code Backed Integrations"
    "Submitting Access Requests in YeshID"
  - (Use substring matching — titles may have [BETA] suffixes etc.)

TEST 3: Content quality
  - No article content contains "Powered by Pylon"
  - No article content contains "How helpful was this article"
  - No article content contains the emoji rating characters
  - Every article content length > 100 characters

TEST 4: No duplicates
  - All article IDs are unique
  - articleCount matches articles.length
```

**Acceptance criteria:**
- `node scripts/extract-docs.mjs` runs without errors and produces `scripts/docs-kb.json`
- All 4 tests pass
- JSON file is < 100KB
- All existing tests still pass (`npm test` from project root — expect 85 passing)

**Commit message format:** `Bead 5 PASS: docs KB extraction — {N} articles, {K}KB`

---

## Bead 6a: Relay Chat Endpoints (Claude Listener Pattern)

**Goal:** Add the long-poll listener infrastructure to the relay server so a Claude instance can wait for chat messages from the side panel and respond back.

**Context for agent:**
- The relay is at `~/Projects/yeshie/packages/relay/index.js`
- It's an Express + Socket.IO server running on port 3333
- It already has `POST /run` (execute payloads) and `GET /status` endpoints
- The new endpoints implement a "Claude Listener" pattern: Claude long-polls `GET /chat/listen`, the side panel posts to `POST /chat`, Claude responds via `POST /chat/respond`
- This is NOT calling the Anthropic API. A real Claude instance (on a MAX plan) calls yeshie_listen via MCP, which hits GET /chat/listen.

**Input files:**
```
~/Projects/yeshie/packages/relay/index.js    (modify)
```

**New endpoints to add:**

### `GET /chat/listen?timeout=300`
- Long-poll endpoint. Claude's MCP tool calls this and blocks.
- If `chatQueue` has messages, return the oldest one immediately.
- Otherwise, hold the connection open until:
  - A message arrives (via POST /chat) → resolve with the message
  - Timeout expires → respond with `{ type: 'timeout' }`
- Only one listener at a time. If a second listener connects, close the first with `{ type: 'replaced' }`.
- Response shape:
```json
{
  "type": "chat_message",
  "id": "msg_1712009100000_abc123",
  "message": "How do I connect Zoom?",
  "mode": "answer",
  "currentUrl": "https://app.yeshid.com/access/applications",
  "tabId": 1637799805,
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### `POST /chat`
- Side panel sends user messages here.
- Generate a unique message ID: `msg_{timestamp}_{random}`
- If a listener is waiting → resolve its pending response with the message. Then hold THIS response open (the side panel is waiting for Claude's answer).
- If no listener → return `{ type: 'no_listener', message: 'Yeshie is offline' }` immediately (status 503).
- If listener is connected but busy → queue the message, return `{ type: 'queued' }`.
- Timeout: if Claude doesn't respond within 120 seconds, return `{ type: 'timeout' }` to the side panel.

### `POST /chat/respond`
- Claude posts its response after processing a message.
- Body: `{ chatId: "msg_...", response: { type: "answer", text: "...", citations: [...] } }`
- Resolves the pending side panel response with the response payload.
- Returns `{ ok: true }`.

### `POST /chat/suggest`
- Mid-execution user suggestion.
- Body: `{ runId: "...", suggestion: "the button is called Remove not Delete" }`
- Queues the suggestion for the next `yeshie_listen` call (as a `{ type: 'suggestion', ... }` message).
- Returns `{ ok: true }`.

### `GET /chat/status`
- Returns `{ listenerConnected: boolean, queuedMessages: number, pendingResponses: number }`.

**State management:**
```javascript
let chatQueue = [];                    // Messages waiting for a listener
let pendingListener = null;            // { resolve, reject, timer }
let pendingResponders = new Map();     // chatId → Express res object
let suggestionQueue = [];              // Suggestions queued for listener
```

**Test requirements:**

Create `tests/unit/relay-chat.test.ts` (or `.test.js` — match existing test conventions):

```
TEST 1: POST /chat with no listener returns 503
  - POST /chat with a message body
  - Expect status 503
  - Expect response: { type: 'no_listener', ... }

TEST 2: Listen → Post → Receive roundtrip
  - Start a GET /chat/listen request (async, don't await yet)
  - POST /chat with { message: "hello", mode: "answer", currentUrl: "https://app.yeshid.com/" }
  - The GET /chat/listen should resolve with the message
  - Verify: type === 'chat_message', message === 'hello', id exists

TEST 3: Post → Respond → Side panel receives
  - Start GET /chat/listen (async)
  - POST /chat with a message (async — this will hang until Claude responds)
  - GET /chat/listen resolves with the message (get the chatId)
  - POST /chat/respond with { chatId, response: { type: 'answer', text: 'Use OAuth' } }
  - The POST /chat response should now resolve with { type: 'answer', text: 'Use OAuth' }

TEST 4: Listen timeout
  - GET /chat/listen?timeout=1 (1 second)
  - Wait 1.5 seconds
  - Response should be { type: 'timeout' }

TEST 5: Message queuing
  - POST /chat when no listener → 503
  - (Messages are not queued when no listener — they fail fast)

TEST 6: Suggest endpoint
  - POST /chat/suggest with { runId: 'run-1', suggestion: 'try clicking the blue button' }
  - Response: { ok: true }
  - GET /chat/listen should return the suggestion as next message

TEST 7: Chat status
  - GET /chat/status
  - Expect: { listenerConnected: false, queuedMessages: 0, pendingResponses: 0 }
  - Start a listener
  - GET /chat/status
  - Expect: { listenerConnected: true, ... }

TEST 8: Listener replacement
  - Start listener A (GET /chat/listen)
  - Start listener B (GET /chat/listen)
  - Listener A should resolve with { type: 'replaced' }
  - Listener B should be the active listener
```

**How to test:** Tests should start a test instance of the relay on a random port (not 3333) using `app.listen(0)` and make HTTP requests to it. Use `node:test` or the project's existing test runner (vitest — check package.json).

**Acceptance criteria:**
- All 8 tests pass
- All existing tests still pass (`npm test` — 85 passing)
- `curl -s http://localhost:3333/chat/status` returns valid JSON when relay is running
- No changes to existing `/run` or `/status` endpoints (no regressions)

**Commit message format:** `Bead 6a PASS: relay chat endpoints — listener pattern + {N} tests`

---

## Bead 6b: MCP Tools — yeshie_listen & yeshie_respond

**Goal:** Add two new MCP tools to the cc-bridge server so Claude can act as a persistent side panel chat listener.

**Context for agent:**
- The MCP server is at `~/Projects/cc-bridge-mcp/server.js`
- It already has tools: `shell_exec`, `claude_code`, `yeshie_run`, `yeshie_status`
- The relay runs on `http://localhost:3333`
- These tools are the MCP interface to the relay's chat endpoints (from Bead 6a)

**Dependency:** Bead 6a must be complete (relay chat endpoints exist)

**Input files:**
```
~/Projects/cc-bridge-mcp/server.js    (modify)
```

**Tools to add:**

### `yeshie_listen`
- Description: "Block waiting for a chat message from the Yeshie side panel. Returns when a user sends a message or timeout expires. Call in a loop to act as a persistent listener."
- Parameters:
  - `timeout_seconds` (number, default 300): Max time to wait
- Implementation: `GET http://localhost:3333/chat/listen?timeout={timeout_seconds}`
- Returns the JSON response from the relay
- Must handle: network errors (relay down), timeouts, JSON parse errors
- On error, return `{ type: 'error', error: 'Relay not reachable' }` (don't throw — let Claude decide what to do)

### `yeshie_respond`
- Description: "Send a response back to the Yeshie side panel after processing a chat message."
- Parameters:
  - `chat_id` (string, required): The message ID from yeshie_listen
  - `response` (object, required): The response payload — `{ type: 'answer'|'do_result'|'teach_steps', ... }`
- Implementation: `POST http://localhost:3333/chat/respond` with `{ chatId, response }`
- Returns `{ ok: true }` on success

### `yeshie_chat_status`
- Description: "Check the chat listener status — whether a listener is connected, queued messages, etc."
- Parameters: none
- Implementation: `GET http://localhost:3333/chat/status`
- Returns the status JSON

**Test requirements:**

These are integration tests — they require the relay to be running. Create a test script rather than unit tests:

```
~/Projects/cc-bridge-mcp/tests/chat-tools-test.mjs

TEST 1: yeshie_chat_status returns valid response
  - Call the tool (via direct function call or HTTP to MCP server)
  - Verify response has listenerConnected, queuedMessages fields

TEST 2: yeshie_listen timeout
  - Call yeshie_listen with timeout_seconds: 2
  - Should return { type: 'timeout' } after ~2s

TEST 3: Full roundtrip
  - Start yeshie_listen (async) with timeout 10s
  - POST a message to relay /chat endpoint
  - yeshie_listen should return the message
  - Call yeshie_respond with a response
  - Verify the POST /chat caller received the response
```

**Acceptance criteria:**
- MCP server restarts cleanly with new tools (`node server.js` — no errors)
- `yeshie_listen`, `yeshie_respond`, `yeshie_chat_status` appear in tool list
- Integration tests pass when relay is running
- Existing tools (`yeshie_run`, `yeshie_status`, `shell_exec`) still work

**Commit message format:** `Bead 6b PASS: MCP chat tools — yeshie_listen + yeshie_respond`

---

## Bead 7: Chrome Side Panel — Shell + Chat UI

**Goal:** Create the Chrome side panel with a chat interface. The panel opens when the extension icon is clicked, lets the user type a message, sends it to the relay, and displays the response. Answer mode only (no Do/Teach yet).

**Context for agent:**
- Extension is at `~/Projects/yeshie/packages/extension/`
- Built with WXT (wxt.config.ts) — MV3 Chrome extension
- Background worker: `src/entrypoints/background.ts`
- Content script: `src/entrypoints/content.ts`
- Build: `cd packages/extension && npx wxt build` (or the watcher does it automatically)
- The extension already has permissions: activeTab, scripting, debugger, tabs, storage, alarms
- The relay is at localhost:3333 — the background worker already makes fetch calls to it
- WXT supports side panels: create a `sidepanel.html` entrypoint or `sidepanel/index.html`

**Dependencies:** Bead 6a (relay chat endpoints)

**Input files:**
```
~/Projects/yeshie/packages/extension/wxt.config.ts         (modify)
~/Projects/yeshie/packages/extension/src/entrypoints/background.ts  (modify)
```

**New files:**
```
~/Projects/yeshie/packages/extension/src/entrypoints/sidepanel/
  index.html        ← HTML shell (loads the JS)
  main.ts           ← Vue app mount point
  App.vue           ← Main chat component
  style.css         ← Minimal styles (no Vuetify in v1 — keep it simple)
```

**Side panel implementation:**

The side panel is a simple chat interface. For this bead, skip Vue/Vuetify complexity — use vanilla HTML + TypeScript with a simple DOM approach, or a minimal Vue 3 setup without Vuetify (Vuetify is heavy and adds build complexity). The goal is functional, not beautiful.

**HTML structure:**
```html
<div id="app">
  <div id="header">Yeshie</div>
  <div id="messages">
    <!-- Chat messages render here -->
  </div>
  <div id="status">
    <!-- "Yeshie is offline" or "Connected" -->
  </div>
  <div id="input-area">
    <input type="text" id="chat-input" placeholder="Ask Yeshie anything..." />
    <button id="send-btn">Send</button>
  </div>
</div>
```

**Behavior:**
1. On load, check listener status via background worker → relay `GET /chat/status`
2. Show "Connected" or "Yeshie is offline — start a Claude listener session"
3. User types message, presses Enter or clicks Send
4. Side panel sends `chrome.runtime.sendMessage({ type: 'chat_message', message, currentUrl, tabId })`
5. Background worker forwards to relay `POST /chat`
6. While waiting: show typing indicator ("Yeshie is thinking...")
7. Response arrives → render as assistant message bubble
8. Messages persist in the panel during the session (in-memory array)

**Background worker additions (in background.ts):**

```typescript
// Register side panel
chrome.sidePanel.setOptions({ path: 'sidepanel/index.html', enabled: true });

// Open side panel on extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle chat messages from side panel
// Add to existing onMessage listener:
if (msg.type === 'chat_message') {
  const { message, currentUrl, tabId } = msg;
  try {
    const resp = await fetch('http://localhost:3333/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode: 'answer', currentUrl, tabId, history: [] })
    });
    const data = await resp.json();
    sendResponse(data);
  } catch (e) {
    sendResponse({ type: 'error', error: e.message });
  }
  return true; // async response
}

if (msg.type === 'chat_status') {
  try {
    const resp = await fetch('http://localhost:3333/chat/status');
    sendResponse(await resp.json());
  } catch (e) {
    sendResponse({ listenerConnected: false, error: e.message });
  }
  return true;
}
```

**WXT config changes:**
```typescript
manifest: {
  // Add to existing permissions array:
  permissions: ['activeTab', 'scripting', 'debugger', 'tabs', 'storage', 'alarms', 'sidePanel'],
  // Add side_panel config:
  side_panel: {
    default_path: 'sidepanel/index.html'
  }
}
```

**Test requirements:**

Create `tests/unit/sidepanel.test.ts`:

```
TEST 1: Side panel HTML is valid
  - Read sidepanel/index.html
  - Verify it contains: #messages, #chat-input, #send-btn elements (in the HTML string)
  - Verify it loads a script (main.ts or main.js)

TEST 2: Message formatting
  - Import the message rendering function
  - Call with { role: 'user', content: 'Hello' }
  - Verify it produces HTML with class 'user-message' and text 'Hello'
  - Call with { role: 'assistant', content: 'Hi there' }
  - Verify it produces HTML with class 'assistant-message'

TEST 3: Extension builds successfully
  - Run `cd packages/extension && npx wxt build` (shell test)
  - Verify exit code 0
  - Verify .output/chrome-mv3/sidepanel/ directory exists
  - Verify .output/chrome-mv3/manifest.json contains "side_panel"
```

**Manual verification (for human, not automated):**
- Load extension in Chrome
- Click the Yeshie icon → side panel opens
- Type "hello" → see "Yeshie is offline" or actual response if listener is running
- Panel survives page navigation

**Acceptance criteria:**
- `npx wxt build` succeeds with no errors
- Manifest includes `sidePanel` permission and `side_panel` config
- `sidepanel/index.html` exists in build output
- All unit tests pass
- All existing 85 tests still pass

**Commit message format:** `Bead 7 PASS: Chrome side panel — chat UI + relay integration`

---

## Bead 8: Progress Overlay (content script)

**Goal:** Create a content script that renders a step-progress overlay on the page during Yeshie payload execution. The overlay shows step status, supports cancel, and supports user suggestions.

**Context for agent:**
- Content scripts in this extension are at `src/entrypoints/`
- The existing `content.ts` handles postMessage bridging
- This is a NEW content script specifically for the overlay UI
- It must use shadow DOM to isolate styles from YeshID's Vuetify CSS
- It receives `step_progress` messages from the background worker via `chrome.runtime.onMessage`
- YeshID's z-index layers go up to ~2000 (Vuetify dialogs). The overlay needs z-index >= 10000.
- The overlay should only appear on `app.yeshid.com` pages

**Dependencies:** None (this is a standalone UI component that listens for messages)

**Input files:**
```
~/Projects/yeshie/packages/extension/wxt.config.ts    (may need to verify content script config)
```

**New files:**
```
~/Projects/yeshie/packages/extension/src/entrypoints/content-overlay.ts
~/Projects/yeshie/packages/extension/src/overlay/
  progress-panel.ts     ← Creates and manages the progress overlay DOM
  teach-tooltip.ts      ← Placeholder for Bead 9 (teach mode)
  styles.ts             ← CSS-in-JS styles (injected into shadow DOM)
```

**WXT content script definition (in content-overlay.ts):**
```typescript
export default defineContentScript({
  matches: ['https://app.yeshid.com/*'],
  runAt: 'document_idle',
  main() {
    // Create shadow DOM host
    // Listen for messages from background
    // Render/update overlay
  }
});
```

**Overlay DOM structure (inside shadow root):**
```html
<div id="yeshie-overlay" style="position:fixed; bottom:20px; right:20px; z-index:10000; ...">
  <div class="yeshie-header">
    <span class="yeshie-logo">Y</span>
    <span class="yeshie-title">Offboarding John Smith</span>
    <button class="yeshie-minimize">_</button>
  </div>
  <div class="yeshie-steps">
    <div class="yeshie-step ok">✅ Navigate to People</div>
    <div class="yeshie-step ok">✅ Search "John Smith"</div>
    <div class="yeshie-step running">⏳ Open profile<span class="detail">resolving selector...</span></div>
    <div class="yeshie-step pending">○ Click Manage</div>
    <div class="yeshie-step pending">○ Offboard</div>
  </div>
  <div class="yeshie-controls">
    <button class="yeshie-suggest-btn">💬 Suggest</button>
    <button class="yeshie-cancel-btn">✖ Cancel</button>
  </div>
  <div class="yeshie-suggest-input" style="display:none">
    <input type="text" placeholder="What should Yeshie do differently?" />
    <button>Send</button>
  </div>
</div>
```

**Message protocol (background → content script):**

```typescript
// Show overlay with initial steps
{ type: 'overlay_show', runId: string, taskName: string, steps: StepInfo[] }

// Update a single step's status
{ type: 'overlay_step_update', runId: string, stepId: string, status: 'running'|'ok'|'error', detail?: string, durationMs?: number }

// Hide overlay
{ type: 'overlay_hide', runId: string }
```

**Cancel flow:**
1. User clicks Cancel
2. Content script sends `chrome.runtime.sendMessage({ type: 'cancel_run', runId })`
3. Background worker sets an abort flag for that runId
4. Background worker responds to content script with acknowledgment
5. Overlay shows remaining steps as "⏭ Skipped"

**Suggest flow:**
1. User clicks Suggest → input field appears
2. User types suggestion, clicks Send
3. Content script sends `chrome.runtime.sendMessage({ type: 'user_suggestion', runId, suggestion })`
4. Background worker forwards to relay `POST /chat/suggest`

**Background worker additions (in background.ts):**
```typescript
// When a chain run starts, send overlay_show to the tab's content script
// For each step completion, send overlay_step_update
// On chain complete/error, send overlay_hide after a 3-second delay

// Handle cancel request
if (msg.type === 'cancel_run') {
  abortFlags.set(msg.runId, true);
  sendResponse({ ok: true });
  return true;
}

// Handle suggestion
if (msg.type === 'user_suggestion') {
  fetch('http://localhost:3333/chat/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: msg.runId, suggestion: msg.suggestion })
  }).then(() => sendResponse({ ok: true }));
  return true;
}
```

**Styling requirements:**
- Semi-transparent dark background (rgba(0,0,0,0.85))
- White text, 14px system font
- Max width: 320px, max height: 400px (scrollable)
- Rounded corners (8px)
- Subtle box shadow
- Steps list: each step is a single line, icon + text
- Running step: amber/yellow color, optional pulse animation
- Completed step: green, slightly dimmed
- Error step: red, shows error text
- Minimizable: header click toggles between full view and just the header bar

**Test requirements:**

Create `tests/unit/progress-panel.test.ts`:

```
TEST 1: Overlay DOM creation
  - Import createProgressPanel from progress-panel.ts
  - Call with a mock container element (jsdom)
  - Verify shadow root exists
  - Verify #yeshie-overlay element exists inside shadow root

TEST 2: Step rendering
  - Create panel, call show() with taskName and 5 steps
  - Verify 5 .yeshie-step elements rendered
  - All initially have class 'pending'

TEST 3: Step state transitions
  - Create panel with 3 steps
  - Call updateStep(stepId, 'running')
  - Verify that step has class 'running' and shows ⏳
  - Call updateStep(stepId, 'ok', { durationMs: 150 })
  - Verify that step has class 'ok' and shows ✅

TEST 4: Error state
  - Create panel, set step to 'error' with detail 'Element not found'
  - Verify step has class 'error', shows ❌, and detail text is visible

TEST 5: Cancel button fires event
  - Create panel, register cancel callback
  - Simulate click on cancel button
  - Verify callback was called with runId

TEST 6: Suggest flow
  - Create panel, register suggest callback
  - Simulate click on suggest button → input appears
  - Set input value to "try the blue button"
  - Simulate click on send
  - Verify callback was called with { runId, suggestion: "try the blue button" }

TEST 7: Hide/show
  - Create panel, call show() → overlay visible
  - Call hide() → overlay hidden (display: none)

TEST 8: Minimize toggle
  - Create panel, call show()
  - Simulate click on minimize button
  - Verify steps area is hidden, only header visible
  - Click again → steps visible
```

**Acceptance criteria:**
- Extension builds with the new content script (`npx wxt build` succeeds)
- All 8 overlay tests pass
- All existing 85 tests still pass
- Overlay renders in shadow DOM (verify: no style leakage test — overlay styles don't affect parent page)

**Commit message format:** `Bead 8 PASS: progress overlay — shadow DOM + cancel/suggest + {N} tests`

---

## Bead 8b: Wire Progress Overlay to Chain Execution (parallel with Bead 8)

**Goal:** Modify the background worker's chain executor to emit step-progress events to the content script overlay during payload runs.

**Context for agent:**
- The chain executor is in `background.ts`, in the `startRun` function
- Currently it executes steps sequentially and returns a ChainResult at the end
- We need it to also send `overlay_show`, `overlay_step_update`, and `overlay_hide` messages to the tab's content script as each step progresses
- We also need an abort mechanism: if the user clicks Cancel on the overlay, the chain should stop after the current step

**Dependencies:** Bead 8 (overlay exists and listens for messages)

**Input files:**
```
~/Projects/yeshie/packages/extension/src/entrypoints/background.ts    (modify)
```

**Changes to background.ts:**

1. **Before chain starts:** Send `overlay_show` to the tab:
```typescript
chrome.tabs.sendMessage(tabId, {
  type: 'overlay_show',
  runId,
  taskName: payload._meta?.description || 'Running task',
  steps: chain.map(s => ({
    stepId: s.stepId,
    label: s.note || s.action + ' ' + (s.target || s.selector || s.text || ''),
    status: 'pending'
  }))
});
```

2. **Before each step executes:** Send `overlay_step_update` with status 'running':
```typescript
chrome.tabs.sendMessage(tabId, {
  type: 'overlay_step_update',
  runId,
  stepId: step.stepId,
  status: 'running'
});
```

3. **After each step completes:** Send update with 'ok' or 'error':
```typescript
chrome.tabs.sendMessage(tabId, {
  type: 'overlay_step_update',
  runId,
  stepId: step.stepId,
  status: result.status === 'ok' ? 'ok' : 'error',
  detail: result.error || null,
  durationMs: result.durationMs
});
```

4. **Abort check:** Before each step, check `abortFlags.get(runId)`. If true, skip remaining steps and mark them as 'skipped' in the overlay.

5. **After chain completes:** Wait 3 seconds, then send `overlay_hide`.

6. **Cancel handler:** Add message handler for `{ type: 'cancel_run', runId }` that sets the abort flag.

7. **Suggest handler:** Add message handler for `{ type: 'user_suggestion', runId, suggestion }` that forwards to relay.

**Test requirements:**

Create `tests/unit/chain-overlay.test.ts`:

```
TEST 1: Step events are emitted
  - Mock chrome.tabs.sendMessage
  - Execute a chain with 3 steps (mock step execution)
  - Verify overlay_show was sent with 3 steps
  - Verify overlay_step_update was sent 6 times (running + ok for each step)

TEST 2: Abort stops execution
  - Start a chain with 5 steps
  - Set abort flag after step 2
  - Verify only 2 steps executed
  - Verify remaining steps sent as 'skipped'

TEST 3: Error step shows in overlay
  - Chain with step that throws
  - Verify overlay_step_update sent with status 'error' and detail message

TEST 4: Overlay hidden after completion
  - Execute chain
  - Verify overlay_hide sent after chain completes
```

**Acceptance criteria:**
- Chain execution still works as before (no behavioral regressions)
- Overlay messages are sent during execution
- Abort flag stops chain after current step
- All existing 85 tests still pass
- New tests pass

**Commit message format:** `Bead 8b PASS: chain executor → overlay wiring + abort + {N} tests`

---

## Bead 9: Teach Mode — Tooltip Overlay

**Goal:** Build the teach-mode tooltip system that positions instructional tooltips on specific page elements, with a dimming mask and step progression.

**Context for agent:**
- This builds on the shadow DOM container from Bead 8 (content-overlay.ts)
- Claude generates `TeachStep[]` and sends them to the side panel
- The side panel forwards steps to the content script, which renders tooltips one at a time
- Each tooltip points at a specific DOM element with an arrow
- A dimming mask highlights the target element
- The user performs the action, then clicks "Next" (or it auto-advances when the target element is clicked)

**Dependencies:** Bead 8 (shadow DOM overlay infrastructure)

**Input files:**
```
~/Projects/yeshie/packages/extension/src/overlay/teach-tooltip.ts    (placeholder from Bead 8)
~/Projects/yeshie/packages/extension/src/entrypoints/content-overlay.ts   (modify)
```

**TeachStep interface:**
```typescript
interface TeachStep {
  stepIndex: number;
  totalSteps: number;
  instruction: string;        // "Click 'Add Application' in the top right"
  targetSelector: string;     // CSS selector for the target element
  highlightTarget: boolean;   // true → dim everything except target
  waitForAction?: 'click' | 'type' | 'navigate' | null;  // auto-advance trigger
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}
```

**Tooltip DOM (inside shadow root):**
```html
<div id="yeshie-teach-mask" style="position:fixed; inset:0; z-index:9999; pointer-events:none;">
  <!-- SVG mask with cutout for target element -->
</div>
<div id="yeshie-teach-tooltip" style="position:absolute; z-index:10001;">
  <div class="tooltip-content">
    <div class="step-counter">Step 2 of 5</div>
    <div class="instruction">Click "Add Application" in the top right corner</div>
    <div class="tooltip-controls">
      <button class="skip-btn">Skip</button>
      <button class="next-btn">Next →</button>
    </div>
  </div>
  <div class="tooltip-arrow"></div>  <!-- CSS triangle pointing at target -->
</div>
```

**Positioning algorithm:**
1. Find target element: `document.querySelector(targetSelector)`
2. If not found: show tooltip centered with message "Element not found — it may appear after you complete a previous step"
3. Get element rect: `element.getBoundingClientRect()`
4. Determine tooltip position (auto = pick side with most space):
   - top: tooltip above element, arrow points down
   - bottom: tooltip below, arrow points up
   - left/right: similar
5. Ensure tooltip stays within viewport bounds
6. If `highlightTarget`: create SVG mask with a rectangular cutout over the target element. The mask covers the rest of the page with a semi-transparent overlay. The cutout has `pointer-events: auto` so the user can interact with the target.

**Auto-advance:**
- If `waitForAction === 'click'`: add a one-time click listener on the target element. When fired, auto-advance to next step.
- If `waitForAction === 'navigate'`: watch for URL change (MutationObserver on document, or `popstate`/`hashchange`). When URL changes, advance.
- User can always click "Next" manually.

**Message protocol:**
```typescript
// Start teach mode with steps
{ type: 'teach_start', steps: TeachStep[] }

// Advance to specific step
{ type: 'teach_goto', stepIndex: number }

// End teach mode
{ type: 'teach_end' }
```

**Content script → background messages:**
```typescript
// User clicked Next or action was detected
{ type: 'teach_step_complete', stepIndex: number }

// User clicked Skip
{ type: 'teach_skip' }

// User exited teach mode
{ type: 'teach_exit' }
```

**Styling:**
- Tooltip: white background, subtle shadow, rounded corners, 280px max-width
- Arrow: 12px CSS triangle matching tooltip background
- Mask: rgba(0,0,0,0.5) with sharp cutout (not blurred)
- Step counter: small grey text above instruction
- Instruction: 16px, dark text
- Next button: blue/primary color
- Smooth transitions between steps (tooltip slides to new position)

**Test requirements:**

Create `tests/unit/teach-tooltip.test.ts`:

```
TEST 1: Tooltip creation
  - Import createTeachTooltip
  - Create with a mock container + shadow root (jsdom)
  - Call startTeach with 3 TeachSteps
  - Verify tooltip element exists, showing step 1 instruction

TEST 2: Positioning — target found
  - Create a mock target element at position { top: 100, left: 200, width: 100, height: 40 }
  - Start teach with position: 'bottom'
  - Verify tooltip is positioned below the element (top > 140)

TEST 3: Positioning — target not found
  - Start teach with selector that matches nothing
  - Verify tooltip shows "Element not found" message
  - Verify tooltip is centered in viewport

TEST 4: Step progression
  - Start teach with 3 steps
  - Verify step 1 shown
  - Call advanceStep() or simulate Next click
  - Verify step 2 shown with updated counter "Step 2 of 3"
  - Advance again → step 3
  - Advance again → teach_end event fired

TEST 5: Auto-advance on click
  - Create target element in DOM
  - Start teach with waitForAction: 'click' and that target's selector
  - Simulate click on target element
  - Verify auto-advanced to next step

TEST 6: Skip button
  - Start teach, click Skip
  - Verify teach_skip event fires
  - Teach mode ends

TEST 7: Dimming mask
  - Start teach with highlightTarget: true
  - Verify mask element exists with the target cutout area
  - Verify cutout dimensions match target element's getBoundingClientRect()

TEST 8: Cleanup on teach_end
  - Start teach, then end it
  - Verify tooltip and mask are removed from DOM
  - Verify no lingering event listeners (mock removeEventListener tracking)
```

**Acceptance criteria:**
- All 8 tooltip tests pass
- Extension builds successfully
- All existing tests still pass
- Tooltip renders inside shadow DOM (style isolation verified)

**Commit message format:** `Bead 9 PASS: teach tooltip — positioning + mask + auto-advance + {N} tests`

---

## Bead 10: Listener System Prompt + Startup Script

**Goal:** Create the system prompt for the Claude listener instance and a startup script to launch it. This is the "brain" that ties everything together.

**Dependencies:** Beads 5 (docs-kb.json), 6a (relay endpoints), 6b (MCP tools)

**Output files:**
```
~/Projects/yeshie/prompts/listener.md
~/Projects/yeshie/scripts/yeshie-listen.sh
```

**File spec — `prompts/listener.md`:**

A Markdown file that serves as the system prompt for the Claude instance acting as the Yeshie listener. Must include:

1. **Role definition:** "You are Yeshie, a helpful assistant embedded in YeshID..."
2. **Listener loop instructions:** Call yeshie_listen in a loop, process each message, respond via yeshie_respond, repeat. On timeout, re-listen immediately. On error, wait 5s and retry.
3. **Mode handling rules:**
   - ANSWER: Use the docs KB to answer. Cite article titles. If unsure, say so. Never hallucinate YeshID features.
   - DO: Map the user's request to an existing payload if one matches. If no payload matches, compose a dynamic chain using known action types (navigate, click, type, wait_for, click_text, find_row, delay, perceive). Call yeshie_run. Report the result.
   - TEACH: Break the task into TeachStep[] based on docs. Each step needs: instruction (human-readable), targetSelector (CSS selector for the UI element), position ('auto' is fine), waitForAction ('click' for most button/link steps). Return as JSON.
4. **Available payloads:** List the payload files and what they do:
   - `01-user-add.payload.json` — Onboard a new user (params: first_name, last_name, email)
   - `02-user-delete.payload.json` — Offboard/deactivate a user (params: user_identifier)
   - `03-user-modify.payload.json` — Modify user attributes (not yet validated)
5. **Docs KB:** Include the full content of `docs-kb.json` (or instructions to load it)
6. **Page context mapping:** The URL → context mapping table from the spec
7. **Suggestion handling:** If a `{ type: 'suggestion' }` message arrives mid-execution, incorporate it into reasoning for remaining steps.
8. **Tone:** Concise, helpful, not overly chatty. Match YeshID's professional tone.

**File spec — `scripts/yeshie-listen.sh`:**
```bash
#!/usr/bin/env bash
# Start a Claude Code session as the Yeshie side panel listener.
# Usage: ./scripts/yeshie-listen.sh
# Or:    alias yeshie-listen='~/Projects/yeshie/scripts/yeshie-listen.sh'

set -euo pipefail
cd "$(dirname "$0")/.."

# Verify relay is running
if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
  echo "Error: Yeshie relay is not running on port 3333"
  echo "Start it with: launchctl kickstart -k gui/$(id -u)/com.yeshie.relay"
  exit 1
fi

echo "Starting Yeshie listener..."
exec claude \
  --system-prompt "$(cat prompts/listener.md)" \
  --mcp-config ~/.claude/mcp.json \
  -p "Start the Yeshie listener loop. Call yeshie_listen to wait for messages. When a message arrives, process it and call yeshie_respond. Then call yeshie_listen again. Repeat forever."
```

**Test requirements:**

```
TEST 1: listener.md is valid
  - File exists and is non-empty
  - Contains "yeshie_listen" (mentions the tool)
  - Contains "yeshie_respond" (mentions the tool)
  - Contains "ANSWER" and "DO" and "TEACH" (mode definitions)
  - Contains at least 3 article titles from docs-kb.json (or references the file)
  - Word count > 500 (substantial system prompt)

TEST 2: yeshie-listen.sh is executable
  - File exists
  - Has executable permission (or starts with #!/usr/bin/env bash)
  - Contains relay health check (curl localhost:3333)
  - Contains 'claude' command invocation

TEST 3: No syntax errors in shell script
  - bash -n scripts/yeshie-listen.sh (syntax check only)
```

**Acceptance criteria:**
- `prompts/listener.md` exists with comprehensive listener instructions
- `scripts/yeshie-listen.sh` exists and passes syntax check
- Tests pass
- A human can read listener.md and understand exactly what the Claude instance should do

**Commit message format:** `Bead 10 PASS: listener prompt + startup script`

---

## Summary Table

| Bead | Name | Est. Time | Dependencies | Tests | Key Output |
|------|------|-----------|-------------|-------|------------|
| 5 | Docs KB Extraction | 2-3 hrs | None | 4 | `scripts/extract-docs.mjs` + `docs-kb.json` |
| 6a | Relay Chat Endpoints | 3-4 hrs | None | 8 | `/chat/listen`, `/chat`, `/chat/respond`, `/chat/suggest` |
| 6b | MCP Chat Tools | 1-2 hrs | 6a | 3 | `yeshie_listen`, `yeshie_respond`, `yeshie_chat_status` |
| 7 | Side Panel Shell | 3-4 hrs | 6a | 3 | `sidepanel/index.html` + chat UI + background wiring |
| 8 | Progress Overlay | 3-4 hrs | None | 8 | `content-overlay.ts` + shadow DOM progress panel |
| 8b | Chain→Overlay Wiring | 2-3 hrs | 8 | 4 | Step events emitted during chain execution |
| 9 | Teach Tooltip | 4-5 hrs | 8 | 8 | Positioned tooltips + dimming mask + auto-advance |
| 10 | Listener Prompt | 1-2 hrs | 5, 6a, 6b | 3 | `prompts/listener.md` + `yeshie-listen.sh` |

**Total: ~41 tests across 8 beads**

**Parallelism opportunities:**
- Beads 5, 6a, 8 can all start simultaneously (no dependencies on each other)
- Bead 6b starts after 6a
- Bead 7 starts after 6a
- Bead 8b starts after 8
- Bead 9 starts after 8
- Bead 10 starts after 5, 6a, 6b

**Maximum parallelism with 3 agents:**
```
Agent 1: Bead 5 ──→ Bead 10
Agent 2: Bead 6a ──→ Bead 6b ──→ Bead 7
Agent 3: Bead 8 ──→ Bead 8b ──→ Bead 9
```
Total wall-clock time: ~10–12 hours with 3 parallel agents.
