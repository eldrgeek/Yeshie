# Yeshie Project State
Updated: 2026-04-02T00:00:00Z
Phase: Re-baseline and contract cleanup
Last major change: runtime/auth/config/improve paths reconciled with tests and incremental docs cleanup

## Passing Tests
- unit/schema: 7/7
- unit/target-resolver: 27/27
- unit/dry-run: 13/13
- unit/step-executor: 39/39
- unit/runtime-contract: 3/3
- unit/improve-script: 2/2
- unit/listener: 7/7
- unit/yeshid-behavior: 13/13
- unit/relay-chat: PASS
- unit/chain-overlay: PASS
- unit/progress-panel: PASS
- unit/teach-tooltip: PASS
- unit/extract-docs: PASS
- unit/sidepanel: PASS
- unit/login-flow: PASS
- TOTAL: 176/176

## Integration Tests
- 01-user-add: PASS (user created, "Workflow created." snackbar)
- 02-user-delete: PASS
- 03-user-modify: PASS
- 04-site-explore: PASS (19 pages, 149 buttons, 53 inputs, 27 tables)
- 05-integration-setup: NOT RUN

## Extension Files (packages/extension/)
- manifest.json — MV3, permissions: activeTab scripting debugger tabs storage
- background.js (450 lines) — service worker, holds chain state across navigations
  - Pre-bundled fns: PRE_RESOLVE_TARGET, PRE_GUARDED_CLICK, PRE_GUARDED_READ, PRE_ASSESS_STATE, PRE_FIND_ROW_AND_CLICK, PRE_FIND_AND_CLICK_TEXT
  - trustedType() via chrome.debugger Input.insertText (Vue 3 trusted events)
  - Actions: navigate, type, click, read, wait_for, assess_state, js, find_row, click_text
  - wait_for: fixed to resolve abstract targets before polling (patch applied)
- content.js — window.postMessage ↔ chrome.runtime relay + readiness signal
- README.md — install + usage instructions

## Architecture Truth
- ClaudeInChrome: works for single-page intra-page ops only
- Page navigation destroys window context → SOLVED by background worker
- YeshID CSP blocks eval() → SOLVED by chrome.scripting.executeScript (pre-bundled)
- BOTH problems solved: extension ready to test 02-delete and 03-modify end-to-end

## Proven Components (ready to wire into extension)
- src/target-resolver.ts — 6-step resolution, vuetify_label_match
- src/step-executor.ts — all 13 action types
- src/dry-run.ts — pre-flight resolution
- packages/debugger-bridge/ — chrome.debugger Input.insertText
- sites/yeshid/tasks/ — 6 payloads with cached selectors
- packages/extension/ — NEW: Chrome MV3 background worker

## Next

1. Validate `05-integration-setup` against a real target and document the required pre-run checklist inputs.
2. Run the full expired-session login recovery loop end to end, not just unit coverage.
3. Continue moving stale docs toward the current extension + relay architecture so README/CLAUDE/PROJECT-STATE remain the current source of truth.
4. Plan a deliberate tracked-artifact cleanup pass. Ignore rules are now in place, but the repo still contains already-tracked build/vendor noise.

## Key Learnings
- vuetify_label_match uses div.mb-2 siblings (not .v-label in YeshID)
- start-date-picker is required field, preset picker pattern
- Debugger bridge works: Input.insertText → trusted Vue 3 events
- Generated IDs (input-v-10) change per session → always use semantic resolution
- eval() blocked by YeshID CSP → must use pre-bundled functions via executeScript
- wait_for must resolve abstract targets before polling querySelector (bug fixed)
