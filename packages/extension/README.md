# Yeshie Extension

Chrome MV3 extension that executes Yeshie payloads across page navigations.

Solves two problems that block `ClaudeInChrome`-only execution:
1. **Page navigation** destroys window context → background worker holds state
2. **YeshID CSP** blocks `eval()` → `chrome.scripting.executeScript` with pre-bundled functions bypasses page CSP

## Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this directory (`packages/extension/`)
4. Note the **Extension ID** shown on the card (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`)

## Trigger a payload run

From DevTools console on the target tab (e.g. `app.yeshid.com`):

```javascript
// 1. Send skill_run
chrome.runtime.sendMessage(
  'YOUR_EXTENSION_ID',
  {
    type: 'skill_run',
    tabId: chrome.devtools?.inspectedWindow?.tabId,   // or omit — uses sender.tab.id
    payload: { /* full payload JSON */ },
    params: { user_identifier: 'Alice Example' }
  },
  (r) => console.log('started runId:', r.runId)
);

// 2. Poll for result
const runId = '...';
const poll = setInterval(() => {
  chrome.runtime.sendMessage('YOUR_EXTENSION_ID', { type: 'get_status', runId }, (r) => {
    console.log(r.status, r.stepIndex);
    if (r.status === 'complete' || r.status === 'failed') {
      clearInterval(poll);
      console.log('Result:', JSON.stringify(r.result, null, 2));
    }
  });
}, 1000);
```

Or via `window.postMessage` relay (from any page script):

```javascript
const requestId = crypto.randomUUID();
window.postMessage({ __yeshieExt: true, requestId, type: 'skill_run', payload: {...}, params: {...} }, '*');
window.addEventListener('message', (e) => {
  if (e.data?.__yeshieExtResponse && e.data.requestId === requestId) {
    console.log('runId:', e.data.response.runId);
  }
});
```

## Message types

| type | fields | response |
|------|--------|----------|
| `skill_run` | `payload`, `params`, `tabId?` | `{ runId, status: 'started' }` |
| `get_status` | `runId` | `{ status, stepIndex, totalSteps, result? }` |
| `abort` | `runId` | `{ aborted: true }` |

Status values: `running` → `complete` or `failed` or `aborted`

## Minimum viable test (02-user-delete)

```javascript
// In DevTools on app.yeshid.com/organization/people
const payload = await fetch('/path/to/02-user-delete.payload.json').then(r => r.json());
chrome.runtime.sendMessage('EXT_ID', {
  type: 'skill_run',
  payload,
  params: { user_identifier: 'Deletable User' }
}, r => { window._runId = r.runId; console.log('started', r.runId); });
// Then poll: chrome.runtime.sendMessage('EXT_ID', {type:'get_status', runId: window._runId}, console.log)
```

## Architecture

```
content.js (ISOLATED world)
  └─ relays window.postMessage ↔ chrome.runtime

background.js (service worker)
  ├─ runs Map — holds RunState across navigations
  ├─ executeChain() — walks payload.chain[]
  ├─ executeStep() — dispatches: navigate/type/click/read/wait_for/assess_state/js/find_row/click_text
  ├─ trustedType() — chrome.debugger Input.insertText (Vue 3 trusted events)
  └─ Pre-bundled fns (PRE_RESOLVE_TARGET, PRE_GUARDED_CLICK, …) — run in MAIN world via executeScript
```
