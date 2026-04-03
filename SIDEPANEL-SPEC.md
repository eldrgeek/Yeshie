# Yeshie Chat Side Panel — Feature Specification

## Overview

Add an AI-powered help panel to YeshID that lets users ask questions, get answers from the YeshID knowledge base, execute tasks in the app via Yeshie payloads, or be guided through tasks step-by-step with on-screen tooltips.

Three modes of response:

1. **Answer** — Claude answers from the docs knowledge base (pure text)
2. **Do** — Claude executes the task in the app autonomously via Yeshie payloads
3. **Teach** — Claude walks the user through the task step-by-step with positioned tooltips

---

## What We Learned From the Docs

The YeshID knowledge base at `docs.yeshid.com` (powered by Pylon) contains **~18 articles** across 4 collections:

| Collection | Articles | Content Type |
|---|---|---|
| **Getting Started Guides** (5) | Sign-Up, Add Applications, Slack Notifications, Source of Truth, Connecting Apps | Onboarding walkthroughs with step-by-step instructions |
| **Connect & Integrate** (9) | Zoom, OpenAI, Asana, Slack, Atlassian, Cloudflare, Ramp, Salesforce SCIM, Template Variables | Integration setup guides — copy credentials, configure scopes, activate |
| **Access** (3) | Submit Access Request (YeshID), Submit via Slack, Action a Request | Workflow guides for the access request feature |
| **Advanced Guides** (1) | Script/Code Backed Integrations [BETA] | Technical reference — ES5.1 runtime, `context.get()`, `fetch()`, actions |

**Content characteristics:**
- Articles are procedural — numbered steps with screenshots
- Most are 200–500 words, moderate depth
- Topics map directly to YeshID app pages (People, Applications, Access, Workflows)
- Several articles reference UI elements by name ("Click 'Connect and Integrate'", "Navigate to My Apps")
- The doc set is small enough to fit entirely in a Claude context window (~15K tokens total)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Chrome Side Panel (Yeshie)                     │
│  ┌───────────────────────────────────────────┐  │
│  │  Chat UI (Vue 3 + Vuetify to match app)   │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  Message history                    │  │  │
│  │  │  [User]: How do I connect Zoom?     │  │  │
│  │  │  [Yeshie]: I can help! Would you    │  │  │
│  │  │   like me to:                       │  │  │
│  │  │   📖 Explain how  💪 Do it  🎓 Teach│  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  [Ask Yeshie anything...      ] [⏎] │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │                    │                │
    ┌────┘                    │                └────┐
    ▼                         ▼                     ▼
 ANSWER                      DO                   TEACH
 ──────                    ──────                ───────
 Claude +              Yeshie relay            Tooltip
 docs RAG              + progress overlay      overlay
 (text only)           (autonomous)            (step by step)
```

### Execution Progress Overlay ("Yeshie is thinking...")

When Yeshie executes a payload (Do mode) or learns a new page, a translucent overlay panel appears anchored to the bottom-right of the page (inside the tab, not the side panel). This makes Yeshie's work visible and controllable.

```
┌──────────────────────────────────────────────┐
│  (YeshID app page content)                   │
│                                              │
│                    ┌────────────────────────┐ │
│                    │ Yeshie — Offboarding   │ │
│                    │ ✅ Navigate to People  │ │
│                    │ ✅ Search "John Smith" │ │
│                    │ ✅ Open profile        │ │
│                    │ ⏳ Click Manage → ...  │ │
│                    │ ○  Set date            │ │
│                    │ ○  Confirm offboard    │ │
│                    │ ○  Verify deactivated  │ │
│                    │                        │ │
│                    │ [💬 Suggest] [✖ Cancel]│ │
│                    └────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**Visual states per step:**
- `✅` Completed — green check, collapsed to one line
- `⏳` In progress — amber spinner, expanded with detail text
- `○` Pending — grey circle, dimmed
- `❌` Failed — red X, expanded with error message

**User controls:**
- **Cancel** — aborts the chain immediately. Background worker sends `abort` signal. Any in-flight step completes but no further steps execute. The overlay shows which steps completed and which were skipped.
- **Suggest** — opens a text input where the user can type a correction or hint (e.g. "the button is called 'Remove' not 'Delete'"). The suggestion is sent to the relay, which passes it to the Claude listener as a mid-chain context injection. Claude can use it to adjust subsequent steps.

**Implementation:** The overlay is a shadow DOM element injected by the content script. It receives step updates from the background worker via `chrome.runtime.sendMessage`. The content script listens for `step_progress` messages and updates the overlay DOM.

```typescript
interface StepProgressUpdate {
  runId: string;
  taskName: string;           // "Offboarding John Smith"
  steps: {
    stepId: string;
    label: string;            // Human-readable: "Search for user"
    status: 'pending' | 'running' | 'ok' | 'error';
    detail?: string;          // Error message or timing info
    durationMs?: number;
  }[];
  canCancel: boolean;
  canSuggest: boolean;
}
```

The overlay also appears during **learning/exploration** runs (e.g. `04-site-explore` payload) so users can watch Yeshie map out the site in real time. During learning, the step labels are discovery-flavored: "Exploring People page...", "Found 6 navigation links", "Mapping form fields...", etc.

### Component Breakdown

**1. Side Panel UI** — New WXT entrypoint: `sidepanel.html`

Uses Chrome's `chrome.sidePanel` API (Chrome 114+). The panel is a standalone HTML page rendered in the browser's native side panel area. It communicates with the background worker via `chrome.runtime.sendMessage`.

- Built with Vue 3 + Vuetify 3 (matches YeshID's look & feel)
- Chat interface with message history
- Mode selector buttons (Answer / Do / Teach) appear when Claude identifies a task
- Typing indicator while Claude is thinking
- Context-aware: reads current page URL to scope responses

**2. Docs Knowledge Base** — Pre-extracted, bundled with extension

Since the entire doc set is ~15K tokens, we pre-extract all articles at build time into a single JSON file (`docs-kb.json`) bundled with the extension. No vector DB needed.

```json
{
  "articles": [
    {
      "id": "4212716734",
      "title": "Connect & Integrate Zoom",
      "collection": "Connect & Integrate",
      "url": "https://docs.yeshid.com/articles/4212716734-...",
      "content": "Introduction\nConnecting and Integrating Zoom...",
      "appPages": ["/access/applications"],
      "keywords": ["zoom", "integration", "oauth", "scim"]
    },
    ...
  ],
  "extractedAt": "2026-04-01T00:00:00Z"
}
```

**Build-time extraction:** A Node script (`scripts/extract-docs.mjs`) crawls `docs.yeshid.com`, extracts article text, and writes `docs-kb.json`. Run manually or in CI when docs change. The extension ships with the snapshot.

**3. Claude Integration** — Claude Listener on MAX Plan (no API tokens)

Instead of calling the Anthropic API directly (which costs per-token), we use the MAX subscription plan. A Claude instance — running in Claude Code, Cowork, or Claude Desktop — connects to the relay via an MCP tool that long-polls for incoming chat messages. When a user asks a question in the side panel, the relay wakes the waiting Claude, which processes the request with full docs context and responds.

**The Claude Listener Pattern:**

```
Side Panel (user types question)
    │
    │ chrome.runtime.sendMessage
    ▼
Background Worker
    │
    │ HTTP POST /chat
    ▼
Relay (port 3333)
    │
    │ Resolves the long-poll Promise
    ▼
Claude Listener MCP Tool (yeshie_listen)    ← Claude MAX instance blocks here
    │
    │ Claude processes with docs KB + site model in system prompt
    │ Returns: { mode, text, payload, steps, ... }
    │
    │ Calls yeshie_run for Do mode, or returns answer/teach steps
    ▼
Relay
    │
    │ HTTP response
    ▼
Background Worker → Side Panel (renders response)
```

**How it works:**

1. A Claude instance (running under MAX plan) calls the `yeshie_listen` MCP tool
2. `yeshie_listen` sends a long-poll request to the relay: `GET /chat/listen?timeout=300`
3. The relay holds the connection open until a chat message arrives (or timeout → re-poll)
4. When a user sends a message from the side panel, the relay resolves the pending listener
5. Claude receives the message, processes it with its full context (docs KB, site model, conversation history, current page URL), and responds
6. For Answer mode: Claude returns text directly
7. For Do mode: Claude calls `yeshie_run` (it already has this tool) and reports back
8. For Teach mode: Claude returns a `TeachStep[]` array
9. After responding, Claude immediately calls `yeshie_listen` again to wait for the next message

**Relay implementation:**

```javascript
// Listener state
let pendingListener = null;  // { resolve, reject, timer }

// Claude calls this via MCP — blocks until a chat message arrives
app.get('/chat/listen', (req, res) => {
  const timeout = parseInt(req.query.timeout) || 300;

  // If there's already a queued message, return it immediately
  if (chatQueue.length > 0) {
    return res.json(chatQueue.shift());
  }

  // Otherwise, hold the connection open
  const timer = setTimeout(() => {
    pendingListener = null;
    res.json({ type: 'timeout' });  // Claude re-polls
  }, timeout * 1000);

  pendingListener = {
    resolve: (msg) => { clearTimeout(timer); res.json(msg); },
    reject: (err) => { clearTimeout(timer); res.status(500).json({ error: err }); },
    timer
  };
});

// Side panel sends messages here
app.post('/chat', (req, res) => {
  const { message, mode, currentUrl, tabId, history } = req.body;
  const chatMsg = { type: 'chat_message', message, mode, currentUrl, tabId, history };

  if (pendingListener) {
    // Wake the waiting Claude
    pendingListener.resolve(chatMsg);
    pendingListener = null;
    // Hold this response open until Claude responds back
    pendingResponders.set(chatMsg.id, res);
  } else {
    // Queue it for when Claude reconnects
    chatQueue.push(chatMsg);
    res.json({ type: 'queued' });
  }
});

// Claude posts its response here after processing
app.post('/chat/respond', (req, res) => {
  const { chatId, response } = req.body;
  const responder = pendingResponders.get(chatId);
  if (responder) {
    responder.json(response);
    pendingResponders.delete(chatId);
  }
  res.json({ ok: true });
});
```

**MCP tool definition (in cc-bridge-mcp/server.js):**

```javascript
server.tool('yeshie_listen', {
  description: 'Block waiting for a chat message from the Yeshie side panel. ' +
    'Returns when a user sends a message. Call this in a loop to act as a ' +
    'persistent chat listener. Returns { type, message, mode, currentUrl, tabId, history }.',
  params: {
    timeout_seconds: { type: 'number', default: 300, description: 'Max wait time' }
  }
}, async ({ timeout_seconds }) => {
  const resp = await fetch(`http://localhost:3333/chat/listen?timeout=${timeout_seconds}`);
  return await resp.json();
});

server.tool('yeshie_respond', {
  description: 'Send a response back to the Yeshie side panel after processing a chat message.',
  params: {
    chat_id: { type: 'string', description: 'The chat message ID to respond to' },
    response: { type: 'object', description: 'The response payload' }
  }
}, async ({ chat_id, response }) => {
  await fetch('http://localhost:3333/chat/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: chat_id, response })
  });
  return { ok: true };
});
```

**Claude's listener loop (the prompt/instructions for the listening Claude instance):**

```
You are Yeshie, a helpful assistant embedded in YeshID. You run as a persistent
listener — call yeshie_listen in a loop, process each incoming message, then
call yeshie_respond with your answer.

You have access to:
- The YeshID docs knowledge base (in your system prompt)
- The YeshID site model (page states, navigation structure)
- yeshie_run (execute automation payloads in the browser)
- yeshie_status (check extension connection)

For each incoming message, determine the best mode:
- ANSWER: Return text with doc citations
- DO: Call yeshie_run with the appropriate payload, report the result
- TEACH: Return TeachStep[] for the side panel to render as tooltips

The user may also send "suggest" messages mid-execution with corrections.
Incorporate these into your reasoning for subsequent steps.
```

**Why this is better than API tokens:**
- Zero marginal cost — uses the MAX subscription already being paid for
- Claude has persistent conversation context across messages (no re-injecting history)
- Claude can use all existing MCP tools (yeshie_run, shell_exec, etc.) directly
- The listening Claude instance can also proactively observe and learn
- Same pattern can scale to multiple listeners (one per site, or one per user)

**Fallback:** If no Claude listener is connected (nobody started the loop), the relay returns `{ type: 'no_listener' }` to the side panel, which shows "Yeshie is offline — start a Claude session to enable chat." A simple script or alias (`yeshie-listen`) starts the loop.

**4. Three Response Modes**

### Mode: ANSWER
Claude receives the user's question plus the full docs KB as context, plus the current page URL. Returns a text answer with doc citations.

```
System: You are Yeshie, a helpful assistant for YeshID. Answer using ONLY
the knowledge base below. If unsure, say so. Cite article titles.
The user is currently on: {currentPageUrl}

{docs-kb.json content}
```

No app interaction — pure text response displayed in the chat panel.

### Mode: DO
Claude analyzes the user's request, determines which Yeshie payload to run (or composes one dynamically), and executes it autonomously in the active tab. The progress overlay appears on the page showing each step in real time.

Flow:
1. User: "Offboard the user John Smith"
2. Side panel sends message to relay, which wakes the Claude listener
3. Claude matches to `02-user-delete` payload template
4. Claude calls `yeshie_run` with `params: { user_identifier: "John Smith" }`
5. As the chain executes, step results stream to the progress overlay via the background worker
6. User watches steps check off: Search... Find row... Open profile... Manage... Offboard...
7. If something looks wrong, user clicks "Suggest" on the overlay and types a hint
8. The suggestion is sent to Claude (via `yeshie_respond` with type `suggestion`), which can adjust remaining steps
9. Claude calls `yeshie_respond` with the final result
10. Side panel shows: "Done — John Smith has been deactivated."

For tasks without a pre-built payload, Claude can compose a dynamic chain using the action types it knows (navigate, click, type, wait_for, click_text, etc.) based on its understanding of the YeshID UI from the docs + site model.

**Step progress streaming:** The relay already returns `stepResults` in the ChainResult. To stream progress in real time, we add a Socket.IO room per run. The background worker emits `step_complete` events as each step finishes. The side panel and the content script (progress overlay) both listen on this room.

```
User types "Offboard John Smith" → side panel
  → relay POST /chat → wakes Claude listener
  → Claude calls yeshie_run
  → extension executes chain, emitting step_complete via Socket.IO
  → progress overlay updates in real time
  → Claude gets ChainResult, calls yeshie_respond
  → side panel shows final message
```

### Mode: TEACH
Claude breaks the task into steps and guides the user through each one with positioned tooltips — similar to Cowork's teach mode but running entirely within the extension.

Flow:
1. User: "How do I connect Zoom?" → clicks 🎓 Teach
2. Claude generates a step sequence from the docs article
3. Extension creates a tooltip overlay anchored to the relevant UI element
4. Each tooltip shows: instruction text + "Next" button
5. User performs the action themselves, clicks Next
6. Extension advances to the next tooltip
7. After final step: "All done! Zoom is now connected."

Tooltip implementation:
- Shadow DOM container injected into the page (isolated from YeshID's styles)
- Uses `element.getBoundingClientRect()` for positioning
- Arrow pointer from tooltip to target element
- Highlight/dimming mask on the target element
- Target element identified by the same selector resolution Yeshie already uses

```typescript
interface TeachStep {
  instruction: string;       // "Click 'Add Application' in the top right"
  targetSelector: string;    // "button:has-text('Add Application')"
  highlightTarget: boolean;  // true — dim everything else
  waitForAction?: string;    // "click" — auto-advance when user clicks target
  position: 'top' | 'bottom' | 'left' | 'right';  // tooltip placement
}
```

---

## New Files & Changes

### New extension entrypoints

```
packages/extension/src/entrypoints/
  sidepanel.html              ← Side panel HTML shell
  sidepanel/
    App.vue                   ← Main chat app (Vue 3 + Vuetify)
    components/
      ChatMessage.vue         ← Message bubble (user/assistant)
      ModeSelector.vue        ← Answer/Do/Teach button row
      StepProgress.vue        ← Progress indicator in side panel
      TeachOverlay.vue        ← Tooltip overlay for Teach mode
    composables/
      useChat.ts              ← Chat state management
      useRelay.ts             ← Communication with relay via background
    docs-kb.json              ← Pre-extracted docs (build artifact)

  content-overlay.ts          ← New content script: progress overlay + teach tooltips
    (shadow DOM, injected on app.yeshid.com only)
    Renders:
      - ProgressPanel         ← Bottom-right step checklist during Do mode
      - TeachTooltip          ← Positioned tooltip during Teach mode
      - SuggestInput          ← Text field for mid-execution user suggestions

scripts/
  extract-docs.mjs            ← Crawls docs.yeshid.com → docs-kb.json
  yeshie-listen.sh            ← Starts Claude Code as persistent Yeshie listener

prompts/
  listener.md                 ← System prompt for the Claude listener instance
    (includes docs KB, site model, available payloads, mode instructions)
```

### WXT config changes

```typescript
// wxt.config.ts additions
manifest: {
  // ... existing
  permissions: [...existing, 'sidePanel'],
  side_panel: {
    default_path: 'sidepanel.html'
  }
}
```

### Background worker additions

```typescript
// New message handlers in background.ts

// Open side panel when extension icon clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle chat messages from side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'chat_message') {
    // Forward to relay /chat endpoint
    handleChatMessage(msg.message, msg.mode, msg.tabId)
      .then(sendResponse);
    return true; // async
  }
  if (msg.type === 'teach_step') {
    // Execute teach tooltip in the active tab
    executeTeachStep(msg.step, msg.tabId)
      .then(sendResponse);
    return true;
  }
});
```

### Relay additions

Three new endpoints for the Claude Listener pattern (see Architecture section for full implementation):

```javascript
// packages/relay/index.js additions

// 1. Claude listener long-polls here (MCP tool: yeshie_listen)
app.get('/chat/listen', (req, res) => { /* ... */ });

// 2. Side panel posts chat messages here
app.post('/chat', (req, res) => { /* ... */ });

// 3. Claude posts responses here (MCP tool: yeshie_respond)
app.post('/chat/respond', (req, res) => { /* ... */ });

// 4. Mid-execution suggestions from user
app.post('/chat/suggest', (req, res) => { /* ... */ });
```

### cc-bridge MCP additions

Two new tools in `~/Projects/cc-bridge-mcp/server.js`:

```javascript
// yeshie_listen — blocks waiting for a side panel message
server.tool('yeshie_listen', { /* ... */ });

// yeshie_respond — sends Claude's response back to the side panel
server.tool('yeshie_respond', { /* ... */ });
```

### Build script for docs extraction

```javascript
// scripts/extract-docs.mjs
// Crawls docs.yeshid.com, extracts all article text, writes docs-kb.json
// Run: node scripts/extract-docs.mjs
// Uses fetch + cheerio (no browser needed)
```

### Listener startup script

```bash
# scripts/yeshie-listen.sh — starts a Claude Code session as the Yeshie listener
# Add as alias: alias yeshie-listen='~/Projects/yeshie/scripts/yeshie-listen.sh'
claude --system-prompt "$(cat ~/Projects/yeshie/prompts/listener.md)" \
  --mcp-server cc-bridge-mcp \
  --resume-or-create yeshie-listener \
  -p "Start the Yeshie listener loop. Call yeshie_listen, process messages, yeshie_respond, repeat."
```

---

## Page-Context Awareness

The side panel knows which YeshID page the user is on and tailors responses accordingly:

| Page Pattern | Context Injected |
|---|---|
| `/organization/people` | "User is on the People list. They can search, onboard, or manage users." |
| `/organization/people/*/details` | "User is viewing a person's profile. They can edit, offboard, or manage." |
| `/access/applications` | "User is on the Applications page. They can add or configure integrations." |
| `/workflows/*` | "User is viewing a workflow. They can track onboarding/offboarding progress." |
| `/overview` | "User is on the dashboard. Suggest getting started tasks." |

This mapping lives in `sites/yeshid/site.model.json` (already exists) and is passed to Claude with each chat message.

---

## Implementation Plan

### Phase 0: Claude Listener Infrastructure (1 day)
1. Add `/chat/listen`, `/chat`, `/chat/respond`, `/chat/suggest` endpoints to relay
2. Add `yeshie_listen` and `yeshie_respond` tools to cc-bridge MCP server
3. Write `prompts/listener.md` system prompt (docs KB + site model + mode instructions)
4. Write `scripts/yeshie-listen.sh` startup script
5. Test: start listener, POST a message to `/chat`, verify Claude responds via `/chat/respond`

### Phase 1: Side Panel + Answer Mode (1–2 days)
1. Extract all docs articles into `docs-kb.json` (build script)
2. Create `sidepanel.html` + Vue chat UI (basic: input, messages, send)
3. Add `sidePanel` permission + manifest config to WXT
4. Wire up: side panel → background → relay `/chat` → wakes Claude listener → response
5. Test: open side panel on YeshID, ask "How do I connect Zoom?", get docs-backed answer

### Phase 2: Do Mode + Progress Overlay (1–2 days)
1. Build `content-overlay.ts` — shadow DOM progress panel (step checklist, cancel, suggest)
2. Add Socket.IO room for per-run step progress streaming
3. Add mode selector UI (Answer/Do/Teach buttons) in side panel
4. Wire up: Claude calls yeshie_run → step events stream to overlay → result to side panel
5. Implement cancel (abort signal to background worker) and suggest (relay to Claude listener)
6. Test: "Offboard Deletable User" → overlay shows steps checking off → result in chat

### Phase 3: Teach Mode (2–3 days)
1. Build tooltip overlay component (shadow DOM, positioned, with arrow, dimming mask)
2. Claude generates `TeachStep[]` from docs + current page analysis
3. Content script renders steps sequentially, highlighting target elements
4. Auto-advance option: detect when user performs the indicated action (click listener on target)
5. Side panel shows synchronized step list (current step highlighted)
6. Test: "Teach me how to submit an access request" → tooltip walkthrough

### Phase 4: Polish (1 day)
1. Vuetify theme matching (use YeshID's color palette for overlay and side panel)
2. Conversation history persistence (`chrome.storage.local`)
3. Error handling: listener offline detection, reconnect logic, stale message cleanup
4. Keyboard shortcut to open panel (`Ctrl+Shift+Y`)
5. "Yeshie is offline" state in side panel when no listener is connected

---

## Key Design Decisions

**Why Claude Listener on MAX, not API tokens?**
The MAX plan is already being paid for. Every API call from the side panel would add cost; the listener pattern makes chat essentially free at the margin. It also gives the listening Claude persistent state — it remembers the conversation without re-injecting history, and it has direct access to all MCP tools (yeshie_run, shell_exec, etc.) without needing a separate orchestration layer. The long-poll pattern is simple, reliable, and has been proven before in the cc-bridge MCP server.

**Why a progress overlay on the page, not just in the side panel?**
The side panel is narrow and the user's eyes are on the page. When Yeshie is automating, the user needs to see what's happening where it's happening — on the page itself. The overlay also enables the "Suggest" interaction, which requires the user to see the current step and the page state simultaneously to know if something is going wrong. The side panel gets a summary, but the real-time play-by-play belongs on the page.

**Why Chrome Side Panel, not injected sidebar?**
YeshID has strict CSP and complex Vuetify layout. An injected sidebar would fight with the app's CSS, z-index layers, and potentially break responsive layouts. The Chrome Side Panel is a native browser feature that sits outside the page's DOM entirely — zero style conflicts, survives page navigations, and provides a native Chrome UX. The progress overlay and teach tooltips ARE injected into the page, but they use shadow DOM isolation so they don't conflict with YeshID's styles.

**Why bundle docs instead of fetching live?**
The docs site is small (~18 articles, ~15K tokens). Bundling eliminates network latency, works offline, and avoids CORS/auth issues. A build script can re-extract when docs change. For a larger doc set, we'd switch to a vector DB or chunked retrieval. The bundled docs also go into the Claude listener's system prompt, so it always has them without fetching.

**Why three modes instead of auto-detecting?**
Users should control the level of autonomy. "Offboard a user" is a destructive action — the user should explicitly choose whether Claude does it (Do) or teaches them how (Teach). Auto-detection would be unsafe for destructive operations.

**Why user suggestions mid-execution?**
Yeshie's payloads are reliable but not infallible — a UI change, an unexpected modal, or a user who knows a faster path can all improve the outcome. Rather than making the user cancel and restart, the suggest channel lets them course-correct in real time. Claude receives the suggestion as a context injection and can adapt subsequent steps. This is also the foundation for collaborative learning — if a user consistently suggests corrections, those can feed back into the payload self-improvement system.

---

## Future Extensions

**Multi-site listeners:** One Claude listener per site. The relay routes messages based on the `currentUrl` domain. Each listener has site-specific docs and site models in its system prompt.

**Proactive suggestions:** The Claude listener could also monitor page navigation (via `content_ready` messages already being sent) and proactively suggest help. "I see you're on the integrations page — would you like help connecting an app?"

**Listener as a skill:** Package the listener loop as a Yeshie skill that any Claude instance can invoke. `yeshie_listen_loop(site: "yeshid", docs: "docs-kb.json")` — makes it trivial to spin up listeners for new sites.

**Conversation export:** Chat history from the side panel gets exported to the Obsidian vault, creating a feedback loop between user questions, docs gaps, and payload improvements.
