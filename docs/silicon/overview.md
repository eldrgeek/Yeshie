---
audience: silicon
document: overview
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Overview

Yeshie lets Claude execute multi-step web automation tasks against live browser tabs without writing brittle scripts. Claude sends a payload JSON → the Chrome extension executes it across page navigations → returns a ChainResult.

## Components

| Component | Location | Role |
|-----------|----------|------|
| relay | `packages/relay/index.js` | Socket.IO HTTP server (port 3333); bridges HTTP ↔ WebSocket |
| extension | `packages/extension/src/entrypoints/background.ts` | Chrome MV3 service worker; owns chain execution across page navs |
| cc-bridge MCP | `~/Projects/cc-bridge-mcp/server.js` | MCP server exposing yeshie_run, shell_exec, claude_code tools |
| target-resolver | `src/target-resolver.ts` | 7-step semantic element resolution |
| step-executor | `src/step-executor.ts` | All action type handlers |
| dry-run | `src/dry-run.ts` | Pre-flight resolution checker |
| watcher | `packages/watch-and-build.mjs` | Build server + hot-reload (port 27182) |

## Data Flow

```
Claude → cc-bridge MCP → HTTP POST /run → relay:3333 → Socket.IO → extension background.ts
→ chrome.scripting.executeScript / chrome.debugger.Input.insertText → live tab
→ ChainResult → Socket.IO → relay → HTTP response → cc-bridge → Claude
```

## Knowledge Model (three layers)

| Layer | File | Scope |
|-------|------|-------|
| L1 runtime | `models/runtime.model.json` | General web: action types, resolution strategies |
| L2 framework | `models/generic-vuetify.model.json` | Vuetify 3 DOM patterns |
| L3 site | `sites/{domain}/site.model.json` | Per-site state graph, cached selectors |

## Sites

| Domain | Tasks | Status |
|--------|-------|--------|
| yeshid | `sites/yeshid/tasks/` — 6 payloads (00–05) | 4 validated (01–04); 05 not run |
| google-admin | `sites/google-admin/` | Not validated |
| okta | `sites/okta/` | Not validated |

## Validated YeshID Payloads

| ID | File | Steps | Time | Status |
|----|------|-------|------|--------|
| 01-user-add | `sites/yeshid/tasks/01-user-add.payload.json` | 18 | ~8s | validated |
| 02-user-delete | `sites/yeshid/tasks/02-user-delete.payload.json` | 18 | ~7.7s | validated |
| 03-user-modify | `sites/yeshid/tasks/03-user-modify.payload.json` | 14 | ~8.4s | validated |
| 04-site-explore | `sites/yeshid/tasks/04-site-explore.payload.json` | — | ~30s | validated (19 pages, 149 buttons, 53 inputs, 27 tables) |
| 05-integration-setup | `sites/yeshid/tasks/05-integration-setup.payload.json` | — | — | not run |

## Process Management

| Service | launchd label | Log | Port |
|---------|--------------|-----|------|
| relay | `com.yeshie.relay` | `/tmp/relay.log` | 3333 |
| watcher+build | `com.yeshie.watcher` | `/tmp/wxt.log` | 27182 |

Restart: `launchctl kickstart -k gui/$(id -u)/{label}`

## Test Coverage

176/176 unit tests across 15 suites. Run: `npm test`
