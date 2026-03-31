# Bead 4 — WXT Extension

## Goal
Build a Chrome MV3 extension at packages/extension/ that runs YeshID payloads
end-to-end across page navigations without losing state.

## The Two Problems This Solves
1. Page navigation destroys window context — background worker persists
2. YeshID CSP blocks eval() — chrome.scripting.executeScript with pre-bundled
   functions is NOT subject to page CSP

## Architecture

```
MCP / ClaudeInChrome
        │
        │ chrome.runtime.sendMessage({type:'skill_run', payload, params})
        ▼
  Background Worker (background.ts)
  - Holds full chain state in memory across navigations  
  - Tracks current tab, current step index
  - On each navigation: re-injects content script, resumes chain
  - Uses chrome.scripting.executeScript for pre-bundled actions
  - Uses chrome.debugger for Input.insertText (trusted events)
  - Returns ChainResult when chain completes
        │
        │ chrome.scripting.executeScript({ func: prebuiltFn, args, world: 'MAIN' })
        ▼
  Content Script / MAIN world (actions run here)
  - guardedFind(labelText) → selector
  - guardedClick(selector)  
  - guardedRead(candidates) → text
  - waitForElement(selector, timeout) → boolean
```

## Files to Create

### packages/extension/manifest.json
```json
{
  "manifest_version": 3,
  "name": "Yeshie",
  "version": "0.1.0",
  "description": "Payload executor for web automation",
  "permissions": ["activeTab", "scripting", "debugger", "tabs", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "Yeshie"
  }
}
```

### packages/extension/background.js

The background worker. NO TypeScript, NO imports, NO bundler needed for MVP.
Plain ES2022 JavaScript that Chrome can load directly.

Key responsibilities:
1. Listen for messages: `skill_run`, `get_status`, `abort`
2. Maintain run state: `{ runId, payload, params, stepIndex, buffer, resolvedTargets, tabId }`
3. On `skill_run`: start execution, return `{ runId }` immediately (async)
4. Execute each step by calling `executeStep(step, runState)` 
5. For navigate steps: call `chrome.tabs.update(tabId, {url})`, wait for tab to complete, then resume
6. For all other steps: call `chrome.scripting.executeScript` with pre-bundled function
7. For type steps: use `chrome.debugger.attach/sendCommand/detach` for Input.insertText
8. Store ChainResult in `chrome.storage.session` when done
9. Callers poll `get_status(runId)` to check completion

```javascript
// State
const runs = new Map(); // runId -> RunState

// Pre-bundled functions (inline — these run in MAIN world via executeScript)
function FIND_BY_LABEL(labelText) {
  // Same logic as target-resolver.ts findInputByLabelText
  // Strategy A: .v-label inside .v-input
  // Strategy B: .mb-2 sibling
  // Strategy C: aria-label/placeholder
  // Returns: { selector, elementFound: true } or { selector: null, elementFound: false }
}

function RESOLVE_TARGET(abstractTarget) {
  // Inline 6-step resolution (no imports)
  // Returns: { selector, confidence, resolvedVia, elementFound }
}

function GUARDED_TYPE(selector, value) {
  // Sets input value using native setter + input event
  // Returns: { ok: true, actualValue } or { ok: false, error }
}

function GUARDED_CLICK(selector) {
  // Finds element, clicks it
  // Returns: { ok: true } or { ok: false, error }  
}

function GUARDED_READ(candidates) {
  // Tries each selector, returns first text found
  // Returns: { text, selector } or { text: null }
}

function ASSESS_STATE(stateGraph) {
  // Evaluates signals against current DOM
  // Returns: { state: string }
}

function WAIT_FOR(selector, timeoutMs) {
  // Returns true if element found within timeout
  // Uses MutationObserver (NOT await/async — executeScript can't use them)
  // Returns synchronously: { found: boolean }
}

// executeStep dispatches to the right pre-bundled function
async function executeStep(step, runState) {
  const { tabId } = runState;
  
  if (step.action === 'navigate') {
    return await navigateAndWait(tabId, interpolate(step.url, runState.params));
  }
  
  if (step.action === 'type') {
    // 1. Resolve target via executeScript(RESOLVE_TARGET, [abstractTarget])
    // 2. Use chrome.debugger for Input.insertText
  }
  
  if (step.action === 'click') {
    return await chrome.scripting.executeScript({
      target: { tabId },
      func: GUARDED_CLICK,
      args: [resolvedSelector],
      world: 'MAIN'
    });
  }
  
  // etc for all action types
}

// Navigate and wait for tab to finish loading
async function navigateAndWait(tabId, url) {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { url });
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => resolve({ ok: true, url }), 500); // brief settle
      }
    });
  });
}

// chrome.runtime.onMessage handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'skill_run') {
    const runId = crypto.randomUUID();
    startRun(runId, msg.payload, msg.params, sender.tab?.id || msg.tabId);
    sendResponse({ runId });
    return true;
  }
  if (msg.type === 'get_status') {
    const run = runs.get(msg.runId);
    sendResponse(run ? { status: run.status, result: run.result } : { status: 'not_found' });
    return true;
  }
});
```

### packages/extension/content.js

Minimal — just signals readiness and provides a hook for background to verify injection.

```javascript
// Signal to background that content script is ready
chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href });
```

### packages/extension/run-payload-ext.js

Node.js CLI that sends a payload to the extension via native messaging or 
chrome.runtime (via a WebSocket bridge to the existing relay, or directly via 
chrome-remote-interface to the extension's background page).

SIMPLER APPROACH: Since we have the debugger-bridge extension already installed,
and we can communicate via window.postMessage, just expose a `skill_run` API 
that the background worker makes available via a shared storage key.

Actually the simplest approach for immediate testing:
- Background worker exposes results in chrome.storage.session
- ClaudeInChrome's javascript_tool polls chrome.storage via the content script
- OR: background posts result back to a specific tab via chrome.tabs.sendMessage

## Minimum Viable Test

After building:

1. Load extension unpacked from packages/extension/
2. Navigate to app.yeshid.com/organization/people
3. From ClaudeInChrome javascript_tool:
```javascript
chrome.runtime.sendMessage(
  'EXTENSION_ID',  
  { type: 'skill_run', payload: THE_PAYLOAD, params: { user_identifier: 'Deletable' } },
  (response) => { console.log('runId:', response.runId); }
);
```
4. Poll for result
5. 02-user-delete completes across page navigations

## IMPORTANT CONSTRAINTS

- NO bundler, NO TypeScript compilation needed for MVP — plain JS
- All pre-bundled functions must be self-contained (no imports, no closures over module scope)
- The existing src/target-resolver.ts logic must be PORTED inline as plain JS functions
- Keep it simple: get one payload working end-to-end, then refine

## Done Criteria

`02-user-delete` payload runs end-to-end against live app.yeshid.com:
- Navigates to people list ✓
- Finds "Deletable User" row ✓  
- Navigates to person detail ✓
- Finds and clicks offboard option ✓
- Confirms offboard ✓
- Returns ChainResult { success: true }
