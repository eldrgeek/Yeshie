---
audience: silicon
document: overview
sync_version: 3
last_updated: 2026-08-27
repo: yeshie
---

# Overview

Yeshie is the **only** web-automation path. Claude sends payload JSON → the Chrome MV3 extension executes it across page navigations via a local relay → returns a ChainResult.

**Live runtime:** Chrome MV3 extension + local relay `http://127.0.0.1:3333` + `sites/<domain>/tasks/*.payload.json`.

**Not the runtime:** `PLAN.md` (CDP/Puppeteer executor — historical/superseded). Playwright. A second browser stack. Computer Use. Claude-in-Chrome (CIC).

## Runtime policy (Yeshie-first)

CIC is discovery scaffolding only — never the runtime.

1. Look for a recipe at `sites/<domain>/tasks/*.payload.json`. If one exists, run it via MCP `yeshie_run` or `POST /run`.
2. If a step is stale (timeout / selector drift): fix the recipe, re-verify through the relay. Do not finish the flow in CIC.
3. If no recipe exists: use CIC only to discover flow/selectors, then capture a recipe so the next run is relay-native.

## How to invoke

| Need | How |
|------|-----|
| Health | `GET http://127.0.0.1:3333/status` → `{ok, extensionConnected, pending, asyncRuns, lastDisconnectAt, buildVersion}` |
| Sync run | `POST /run` or MCP `yeshie_run` |
| Long jobs (MCP ~60s cap) | `POST /run/async` → poll `GET /run/result/:id` (or `node scripts/run-async.mjs`) |

`extensionConnected: false` → reload the extension in `chrome://extensions`.

## Components

| Component | Location | Role |
|-----------|----------|------|
| relay | `packages/relay/index.js` | Socket.IO HTTP server (port 3333); bridges HTTP ↔ WebSocket |
| extension | `packages/extension/src/entrypoints/background.ts` | Chrome MV3 service worker; owns chain execution across page navs |
| cc-bridge MCP | `~/Projects/cc-bridge-mcp/server.js` | MCP server exposing yeshie_run, shell_exec, claude_code tools |
| target-resolver | `src/target-resolver.ts` | 7-step semantic element resolution |
| step-executor | `src/step-executor.ts` | All action type handlers (includes `extract_text`) |
| dry-run | `src/dry-run.ts` | Pre-flight resolution checker |
| watcher | `packages/watch-and-build.mjs` | Build server + hot-reload (port 27182) |

## Data Flow

```
Claude → cc-bridge MCP (yeshie_run) OR curl POST /run | /run/async → relay:3333 → Socket.IO → extension background.ts
→ chrome.scripting.executeScript / chrome.debugger.Input.insertText → live tab
→ ChainResult → Socket.IO → relay → HTTP response (sync) or stash for GET /run/result/:id (async)
```

## Knowledge Model (three layers)

| Layer | File | Scope |
|-------|------|-------|
| L1 runtime | `models/runtime.model.json` | General web: action types, resolution strategies |
| L2 framework | `models/generic-vuetify.model.json` | Vuetify 3 DOM patterns |
| L3 site | `sites/{domain}/site.model.json` | Per-site state graph, cached selectors |

## Sites / recipes

A recipe is a `sites/<domain>/tasks/*.payload.json` file.

| Fact | Value |
|------|-------|
| Corpus | **35 site dirs / ~220 recipes** |
| Largest set | `github.com` (100 recipes) |
| Layout | `sites/<domain>/tasks/*.payload.json` |

`google-admin` and `okta` already have payloads — do not treat them as empty or as "extend to a second site." This branch may lag the operator laptop (e.g. Rocket Money live-verified there, not landed here). Do not author or rewrite site recipes in a docs-only change.

## Validated YeshID Payloads

| ID | File | Steps | Time | Status |
|----|------|-------|------|--------|
| 01-user-add | `sites/yeshid/tasks/01-user-add.payload.json` | 18 | ~8s | validated |
| 02-user-delete | `sites/yeshid/tasks/02-user-delete.payload.json` | 18 | ~7.7s | validated |
| 03-user-modify | `sites/yeshid/tasks/03-user-modify.payload.json` | 14 | ~8.4s | validated |
| 04-site-explore | `sites/yeshid/tasks/04-site-explore.payload.json` | — | ~30s | validated (19 pages, 149 buttons, 53 inputs, 27 tables) |
| 05-integration-setup | `sites/yeshid/tasks/05-integration-setup.payload.json` | — | — | not run |

## Action types (note)

`extract_text` exists (`selector` + `store_as`). `wait_for` supports selector, text, and `state.stable` (content fingerprint quiet for `quietMs`; default 800ms) — landed in [#55](https://github.com/eldrgeek/Yeshie/pull/55). Prefer `wait_for` over `delay`. Auto-heal (`improve.js`) is wired into `POST /run` and `/run/async` when `success && goalReached` and `_meta.selfImproving === true`.

## Process Management

| Service | launchd label | Log | Port |
|---------|--------------|-----|------|
| relay | `com.yeshie.relay` | `/tmp/relay.log` | 3333 |
| watcher+build | `com.yeshie.watcher` | `/tmp/wxt.log` | 27182 |

Restart: `launchctl kickstart -k gui/$(id -u)/{label}`

## Test Coverage

176/176 unit tests across 15 suites. Run: `npm test`
