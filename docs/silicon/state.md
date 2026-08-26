---
audience: silicon
document: state
sync_version: 3
last_updated: 2026-08-26
repo: yeshie
authorship_update: "Mike Wolf (human-gate doctrine), OpenAI Codex (2026-07-27 Pulse action bridge), 2026-08-26 runtime-docs alignment"
---

# State

Runtime: Chrome MV3 extension + local relay `http://127.0.0.1:3333` + `sites/<domain>/tasks/*.payload.json`. CIC is discovery-only. `PLAN.md` is historical/superseded.

Corpus: **35 site dirs / ~220 recipes**. `google-admin` and `okta` already have payloads — there is no "extend to a second site" gap.

## Unit Tests

status: 176/176 passing

| Suite | Tests | Status |
|-------|-------|--------|
| unit/schema | 7 | pass |
| unit/target-resolver | 27 | pass |
| unit/dry-run | 13 | pass |
| unit/step-executor | 39 | pass |
| unit/runtime-contract | 3 | pass |
| unit/improve-script | 2 | pass |
| unit/listener | 7 | pass |
| unit/yeshid-behavior | 13 | pass |
| unit/relay-chat | — | pass |
| unit/chain-overlay | — | pass |
| unit/progress-panel | — | pass |
| unit/teach-tooltip | — | pass |
| unit/extract-docs | — | pass |
| unit/sidepanel | — | pass |
| unit/login-flow | — | pass |

## Integration Tests (YeshID)

| Payload | Status | Notes |
|---------|--------|-------|
| 01-user-add | validated | "Workflow created." snackbar confirmed |
| 02-user-delete | validated | Full offboard flow |
| 03-user-modify | validated | First name, last name, email edit |
| 04-site-explore | validated | 19 pages, 149 buttons, 53 inputs, 27 tables |
| 05-integration-setup | not_run | Has `preRunChecklist` requiring SCIM docs research |

## Pending Work

| Item | Priority | Status |
|------|----------|--------|
| Auth flow end-to-end test | high | `waitForAuth` + `PRE_CLICK_GOOGLE_ACCOUNT` implemented, not E2E'd against a real expired session |
| Listener `no_listener` | high | `GET /chat/status` `listenerConnected` is still false unless a listener is actively polling; side panel gets `no_listener` |
| improve.js automation | medium | script ready; not wired into `POST /run`; still a manual post-run step |
| Engine-level `state.stable` wait | medium | needed for streaming UIs (DeepSeek etc.); no reliable DOM completion selector |
| Validate 05-integration-setup | medium | blocked: SCIM docs preRunChecklist not yet completed |
| Tracked-artifact cleanup | low | .gitignore updated; old tracked build/vendor files not removed |

## Proven Components

| Component | Status |
|-----------|--------|
| `src/target-resolver.ts` | production — 6-step resolution, vuetify_label_match |
| `src/step-executor.ts` | production — action types including `extract_text` |
| `src/dry-run.ts` | production — pre-flight resolution |
| `packages/relay/index.js` | production — `POST /run`, `POST /run/async`, `GET /run/result/:id` |
| `packages/extension/` background worker | production |
| Auth / login recovery (waitForAuth + PRE_CLICK_GOOGLE_ACCOUNT) | implemented, not E2E validated |
| Pulse `/teach/start` human gate | production; 6 focused tests + live relay/extension HTTPS-tab smoke |

## Architecture Issues Resolved

| Problem | Solution |
|---------|----------|
| Page navigation destroys window context | Background worker (not content script) holds chain state |
| YeshID CSP blocks `eval()` | `chrome.scripting.executeScript` with pre-bundled functions |
| Vue 3 `v-model` requires `isTrusted` events | `chrome.debugger Input.insertText` |
| Extension service worker sleep (MV3) | 24s keepalive alarm |

## Known Caveats

- Generated DOM IDs (`input-v-10`, `input-v-12`) change per page load — always use semantic resolution
- `chrome.sidePanel.close()` requires Chrome 141+ for programmatic close
- Auth flow unit-tested but not validated against a real expired session cycle
- `/teach/start` highlights and observes only; it never clicks an approval control
- `05-integration-setup` payload has `preRunChecklist` that must be satisfied before first run
- `improve.js` is not invoked automatically after `POST /run`
- Chat listener: `GET /chat/status` reports `listenerConnected: false` when no poller is active → `no_listener`
- Streaming-chat recipes degrade without an engine-level `state.stable` wait
