---
audience: silicon
document: state
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# State

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
| Validate 05-integration-setup | medium | blocked: SCIM docs preRunChecklist not yet completed |
| Auth flow end-to-end test | high | implemented, not tested against real expired session |
| Self-improvement merge (improve.js) | medium | script ready, not run post-validation |
| Tracked-artifact cleanup | low | .gitignore updated; old tracked build/vendor files not removed |
| Extend to second site | medium | architecture supports it; no payloads for google-admin or okta |

## Proven Components

| Component | Status |
|-----------|--------|
| `src/target-resolver.ts` | production — 6-step resolution, vuetify_label_match |
| `src/step-executor.ts` | production — all 13 action types |
| `src/dry-run.ts` | production — pre-flight resolution |
| `packages/relay/index.js` | production |
| `packages/extension/` background worker | production |
| Auth / login recovery (waitForAuth + PRE_CLICK_GOOGLE_ACCOUNT) | implemented, not E2E validated |

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
- `05-integration-setup` payload has `preRunChecklist` that must be satisfied before first run
