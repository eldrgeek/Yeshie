# Yeshie Extension

Chrome MV3 extension that executes Yeshie payloads across page navigations.

Solves two problems that block `ClaudeInChrome`-only execution:
1. **Page navigation** destroys window context → background worker holds state
2. **YeshID CSP** blocks `eval()` → `chrome.scripting.executeScript` with pre-bundled functions bypasses page CSP

## Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `packages/extension/.output/chrome-mv3` (after `npm run build`)
4. Note the **Extension ID** shown on the card (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`)

## Trigger a payload run

Payloads arrive from the relay (`packages/relay`, `http://localhost:3333`): `POST /run` or MCP `yeshie_run`. Web pages cannot reach the extension. Until 1.0.0 (2026-11-17) a `window.postMessage({__yeshieExt})` bridge let any page start runs and read results; it was removed (`store/REVIEW-2026-11-17.md`).

## Builds

- Personal: `npm run build` (the watcher does this), loaded unpacked from `.output/chrome-mv3`.
- Chrome Web Store: `npm run zip:store`. See `store/README.md` and `CHANGELOG.md`.

## Architecture

```
background.js (service worker)
  ├─ Socket.IO client to the relay (localhost:3333)
  ├─ runs Map — holds RunState across navigations
  ├─ executeChain() — walks payload.chain[]
  ├─ executeStep() — dispatches: navigate/type/click/read/wait_for/assess_state/js/find_row/click_text
  ├─ trustedType() — chrome.debugger Input.insertText (Vue 3 trusted events)
  └─ Pre-bundled fns (PRE_RESOLVE_TARGET, PRE_GUARDED_CLICK, …) — run in MAIN world via executeScript
```
