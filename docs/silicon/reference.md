---
audience: silicon
document: reference
sync_version: 5
last_updated: 2026-08-27
repo: yeshie
authorship_update: "Mike Wolf (system direction), OpenAI Codex (2026-07-27 Pulse human-gate contract pass), 2026-08-26 async run API, 2026-08-27 assume #55 landed"
---

# Reference

## MCP Tools (cc-bridge)

File: `~/Projects/cc-bridge-mcp/server.js`

| Tool | Parameters | Returns | Notes |
|------|-----------|---------|-------|
| `yeshie_run` | `payload_path` (str), `params` (obj), `tab_id` (int\|null), `timeout_seconds` (int, default 120) | ChainResult JSON | Preferred invocation method |
| `yeshie_status` | — | `{ok, extensionConnected, pending}` | Health check |
| `yeshie_listen` | `timeout_seconds` (int) | chat message or timeout | Waits for side panel message |
| `yeshie_respond` | `chat_id` (str), `response` (str) | — | Reply to side panel chat |
| `yeshie_chat_status` | — | listener status | Check chat listener |
| `shell_exec` | `command` (str), `workdir` (str), `timeout_seconds` (int, default 30) | stdout/stderr | Run shell command |
| `claude_code` | `task` (str), `workdir` (str), `timeout_seconds` (int, default 240) | output | Claude Code non-interactive |

## Relay HTTP API

Base URL: `http://127.0.0.1:3333`

Live runtime is this relay + the Chrome MV3 extension. CIC is discovery-only. `extract_text` is a first-class action type (see below). `wait_for` includes `state.stable`. Auto-heal is wired into `/run` ([#55](https://github.com/eldrgeek/Yeshie/pull/55)).

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/run` | `{payload, params, tabId, timeoutMs}` | ChainResult JSON (sync; MCP `yeshie_run` wraps this; ~60s MCP cap). Auto-heal runs after `success && goalReached` when `_meta.selfImproving === true` (#55). |
| POST | `/run/async` | `{payload, params?, tabId?, timeoutMs?}` (default `timeoutMs` 300000) | `202 {ok: true, id, status: "running"}` immediately. Same auto-heal as `/run` when the stashed result settles green. |
| GET | `/run/result/:id` | — | `{id, status: running\|done\|error, result, error, progress}`. `result` is the full ChainResult once `done`. Settled runs expire after 30-min job TTL. |
| GET | `/status` | — | `{ok, extensionConnected, pending, asyncRuns, lastDisconnectAt, buildVersion}` |
| POST | `/teach/start` | `{steps: TeachStep[], tabId?: int}` + `X-Dispatch-Token` | `{ok: true, tabId: int}` |
| POST | `/pulse/voice/turn` | `{text, mode?, recipient?, dispatch_target?, client_id?}` | Routed voice-turn envelope |
| GET | `/dispatch/conversation` | query `since`, `limit` | Merged Mike + named AI-team messages |

`POST /run/async` registers a normal `skill_run` whose settled ChainResult is stashed instead of HTTP-replied — existing hooks (`chain_result`, `chain_error`, `status_update` progress, disconnect-rejection) still apply. Wrapper: `node scripts/run-async.mjs <recipe-path>`. Use this for recipes that outlast the ~60s synchronous MCP cap (e.g. DeepSeek + DeepThink).

Auto-heal (`improve.js` `maybeAutoHeal`): after `/run` or `/run/async` settles, merge `cachedSelector` only when `success && goalReached` and `_meta.selfImproving === true`. Skipped on failed runs. Hard-blocked for Rocket Money `01-list-all-recurring` and `02-list-inactive`. Manual `node improve.js <payload> <chain-result>` still works.

`/pulse/voice/turn` accepts `auto|conversation|dispatch|strategy`. It writes conversational turns to `~/.dispatch/inbox.jsonl`; dispatch turns are submitted to the Pulse dispatcher on port 3340 and receive an immediate spoken acknowledgement. Named replies in `dee_replies.jsonl` use `source`, `speaker`, and `in_reply_to`.

`/teach/start` is the Pulse human-gate surface. It is restricted to allowed
network sources and requires the token from `~/.dispatch/relay.secret`.
Top-level input is exactly `steps` plus optional `tabId`; unknown fields are
rejected. Each TeachStep supplies `stepIndex`, `totalSteps`, plain-text
`instruction`, `targetSelector`, `highlightTarget`, `waitForAction`, and
`position`. The extension highlights and observes the target. This endpoint
never clicks it.

## ChainResult Schema

```typescript
{
  success: boolean,
  steps: StepResult[],
  error?: string,
  resolvedSelectors?: Record<string, {selector: string, confidence: number, resolvedVia: string}>
}

StepResult {
  stepIndex: number,
  action: string,
  success: boolean,
  value?: string,
  error?: string,
  resolvedOn?: string,
  resolvedVia?: string,
  signaturesObserved?: string[]
}
```

## Payload Schema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_meta.site` | string | yes | e.g. `"yeshid"` |
| `_meta.task` | string | yes | e.g. `"user-add"` |
| `_meta.mode` | `"exploratory" \| "production"` | no | defaults exploratory |
| `_meta.auth.googleAccountEmail` | string | no | enables auto account selection |
| `params` | string[] | yes | list of expected param keys |
| `chain` | Step[] | yes | ordered action list |

## Step Schema

| Field | Type | Notes |
|-------|------|-------|
| `action` | string | see Action Types below |
| `target.name` | string | semantic label for resolution |
| `target.cachedSelector` | string | winning CSS selector from prior run |
| `target.cachedConfidence` | float | 0–1; resolution uses if ≥ 0.85 |
| `target.resolvedOn` | ISO date | age check for cache invalidation |
| `target.fallbackSelectors` | string[] | explicit CSS fallbacks |
| `value` | string | input value or navigation URL |
| `expected` | string | expected read/assess result |
| `within_row` | string \| string[] \| `{ "cells": string[] }` | `click` only. Clicks the selector's match that sits in the one table row (closest `tr` or `[role="row"]`) this names. **Text form** (a string or a list): every string appears somewhere in the row's text. **Cells form** (`{ "cells": [...] }`, added 2026-09-15): every string is the whole text of one of the row's cells (`td`/`th`, or role `cell`/`gridcell`/`rowheader`), in the order listed, after trimming and collapsing whitespace; case matters. Use the cells form when one value can start another: GoDaddy's `sala` and `sala65` share an address, so the text form matches both rows. Exactly one row must match. Zero or several rows fail the step and nothing is clicked, and so does an entry that is empty once params are filled in. Rule: `src/row-scope.ts`. A recipe must put an `assert` with `requires: ["within_row"]` (text form) or `["within_row.cells"]` (cells form) before the click; `tests/unit/runtime-features.test.ts` checks this. |
| `requires` | string \| string[] | `assert` only, and the only check in that assert. The step fails unless the runtime lists every named feature in `src/runtime-features.ts` (today `select`, `within_row`, `within_row.cells`). A build that predates `requires` ignores the field; alone, the step then declares nothing that build can check, so every build since 2026-09-13 fails it and stops. Added 2026-09-15. |
| `optional` | boolean | When the step fails (an error, or an action with no handler), record the failure and let the chain go on. See Unsupported actions, optional steps, and comments. |
| `disabled` | boolean | `true` switches the step off: it does not run, and its result has status `skipped` and `disabled: true`. The runtime ignored this flag until 2026-09-16, so a step an author had switched off still ran. |

## Action Types

| Action | Description |
|--------|-------------|
| `navigate` | Navigate to URL (value = URL, supports `{{params.base_url}}`) |
| `activate_tab` | Bring the run's tab to the front and focus its window, then wait until the page reports `document.visibilityState === "visible"` (`timeout`, default 5000 ms). The step fails if the tab is still hidden. Chrome does not render a hidden tab, so a lazily rendered list (for example Suno's clip list) stays empty in a background tab. The step raises Chrome over other apps. Added 2026-09-15. |
| `type` | Type value into target input. It replaces the field's whole value. |
| `clear` | Empty a text `<input>` or `<textarea>` (`selector` or `target`). The value is cleared the React-safe way (prototype setter, then input and change events), and the step fails if the field does not read empty afterwards. A checkbox, a radio button, or any other element fails the step. `type` already replaces a field's whole value, so a recipe needs `clear` only to leave a field empty. Added 2026-09-15. |
| `click` | Click target element. With `within_row`, click it only inside the one table row that `within_row` names, by text or by exact cells (see Step Schema). |
| `assert` | Guard step: the chain stops unless every check the step declares holds. The checks are `condition` (falsy values fail), `url_pattern` (a regex on the page URL), `selector` (the element exists; with `value` or `text`, its text contains that string) and `requires` (runtime features; see Step Schema). An assert that declares no check fails. The recipe's `message` leads the error. Rule: `src/assert-step.ts`. |
| `wait_for` | Wait on selector, text, and/or `state.stable` (content fingerprint quiet for `quietMs`; default 800ms). `onTimeout: "continue"` honored. Prefer over `delay`. Landed in #55. With a named `state` and a state graph, it waits until that node's own signals hold, whichever node is judged first (since 2026-09-16). |
| `read` | Read one element's text into the buffer (`store_as`). `selector` names the element, or `candidates` lists selectors and the first that matches wins. With neither, it stores a snapshot of the whole page. |
| `perceive` | Store a summary of the page's structure (`store_as`): navigation links, visible buttons, input fields and tables. It ignores `selector`, `target`, `extract` and `columns`, so it cannot read one element or a table's rows; use `read` for that. |
| `respond` | Build a query recipe's answer from the buffer and store it as `buffer.response`, which the ChainResult returns. `data` (or `extract_from`) maps each answer field to a rule: a string with `{{param}}`s, `{ source }` (a buffer value as it is), `{ source, extract: "count" }` (a list's length), or `{ source, pattern, capture }` (a regex match; an all-digit match becomes a number). A field the buffer cannot fill fails the step, unless the rule says `optional: true`. `empty_message` is added as `message` when every count is 0 and every list is empty. Rule: `src/respond-step.ts`. Added 2026-09-15. |
| `assess_state` | Judge the page against a state graph (the step's `stateGraph`, else the payload's). Signals: `url_matches`, `url_not_matches`, `element_visible`, `element_absent`, `element_text` (the selector's text contains `text`), `attribute_change`. A node holds when all of its signals do. The result's `state` is the first node that holds and `states` lists every node that holds. **`expect.state` matches when that node's own signals hold**, and `expect.state_any` matches when any listed node holds; node order does not matter (since 2026-09-16). Nodes are judged in the order written, so `state` is the first node written that holds and `states` lists every node that holds in that order. Until 2026-09-16 they were judged alphabetically: `chrome.scripting.executeScript` passes an object argument through Chromium's `base::Value`, whose dictionaries sort their keys, so the page received the nodes sorted. The runtime now passes the written order as an array, which keeps its order. Routing: `onMismatch` applies when the expected state does not hold; `onMatch` applies when it does, or, with no `expect`, when the page is in any state of the graph. `onMatch` may also map state names to outcomes, e.g. `{"auth_required": "exit_fail"}`. Outcomes: `"branch:<name>"` (run that branch of the payload's `branches`), `"exit_with_error:<reason>"`, `"report_failure"` and `"exit_fail"` (the step fails and the chain halts, unless the step is optional), `"exit_success"` (the chain ends successfully), `"continue"`. Any other value fails the step (`unsupported routing`). A `branch:` name that `branches` does not define continues, as before. Until 2026-09-16 only `onMatch: "exit_success"` and `onMismatch: "branch:<name>"` worked; every other value was ignored, so guards written with them never fired. Rule: `routeAssessState` in `background.ts`. |
| `js` | Run pre-bundled DOM query (routed by PRE_RUN_DOMQUERY). Not arbitrary code: the string is matched against keywords, and code containing `find(r =>` or `button` is routed to a row-click or button-click helper. |
| `find_row` | Find table row matching identifier, click it |
| `click_text` | Click first element matching text |
| `hover` | Not in the live runtime; only the `src/step-executor.ts` mirror has it. A recipe step that uses it halts the chain as `unsupported`. |
| `scroll` | With `target` or `selector`, scroll that element into view. With neither, scroll the page `amount` pixels (default 600) in `direction` (`down` by default; also `up`, `left`, `right`). Added to the live runtime 2026-09-15; before that the step returned `unsupported` and the chain ran on. |
| `select` | Choose an option in a native `<select>` (`selector` or `target`, plus `value`). `value` matches an option's value or visible label, exact first, then ignoring case (`src/select-option.ts`). The value is set the React-safe way (prototype setter, then input and change events). The element is then re-read, and the step fails if the page did not keep the value. In the live runtime since 2026-09-14; before that the step returned `unsupported` and the chain ran on. |
| `paste_html` | Paste rich text into an editor (`selector` or `target`, plus `html`). The element receives a paste event whose clipboardData carries `text/html` and `text/plain`, so ProseMirror/TipTap editors (Substack's post, About-page and welcome-email editors) keep headings, bold, italics, links, quotes and lists. `type` cannot do this, because `Input.insertText` delivers plain text. `html` takes `{{param}}` interpolation. `text` sets the plain flavor (default: `html` with tags stripped). `replace` (default `true`) selects the whole content first, so a re-run replaces the body instead of adding a second copy. It selects with Cmd-A (Ctrl-A off the Mac), which a ProseMirror editor answers with an AllSelection, and marks the HTML as a closed slice (`data-pm-slice="0 0 []"`), so the pasted blocks go in whole. When no editor answers the key, it selects the contents through the DOM. A DOM selection alone let the first pasted paragraph merge into the old first block: on 2026-09-15 a credit line became a heading. The step fails unless the page handles the paste, since a plain contenteditable ignores a synthetic paste and keeps nothing; set `requireHandled: false` to allow that. Added 2026-09-15. |
| `click_preset` | Click a preset/chip element |
| `probe_affordances` | Not in the live runtime; only the `src/step-executor.ts` mirror has it. A recipe step that uses it halts the chain as `unsupported`. Use `perceive` to survey a page's buttons. |
| `delay` | Wait N milliseconds. **Discouraged in recipes** — fixed delays are fragile and slow; prefer `wait_for` (guard the next action on the element it needs; for whole-page reads, `wait_for` `.application-main`). Enforced by `tests/unit/no-fixed-delay.test.ts`. |
| `key` | Send keyboard input — single key ("t", "/"), named key ("Enter", "Escape", "Tab", "ArrowDown"), modifier chord ("ctrl+a", "meta+a", "shift+tab"), or sequence ("g c" or keys:[]) |
| `wait` | Duration wait (ms param) OR wait-for-selector (selector + optional timeout) |
| `extract_text` | Read text from selector into buffer (selector + store_as) |

## Unsupported actions, optional steps, and comments

The live runtime is `packages/extension/src/entrypoints/background.ts`. A step whose `action` has no handler there gets status `unsupported`, and the chain halts with the error `Unsupported action [<stepId>]: "<action>" has no handler in the extension runtime`. Before 2026-09-15 only `error` halted a chain, so an unsupported step was skipped silently and the recipe ran on as if the step had worked.

A step marked `optional: true` does not halt the chain when it fails, whether it errored or its action is unsupported. Its result gets status `skipped_error`, `optionalFailure: true`, and `failedStatus` set to the original status. Steps inside an `assess_state` branch follow the same rule.

A chain item with no `action`, whose keys all start with `_`, is a section comment, for example `{"_": "PHASE 2 — OAuth Consent Screen"}`. The runtime skips it (status `skipped`, `comment: true`).

`tests/unit/background-actions.test.ts` reads the handlers out of `background.ts` and walks every recipe's chain and branch steps. It fails when a step uses an action that has no handler, unless its `KNOWN_GAPS` table names that action and recipe. The table must match the recipes exactly, so the test also fails when a listed action gets a handler or a recipe stops using it.

## `key` Action Schema

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `key` | string | `"t"`, `"Enter"`, `"ctrl+a"`, `"g c"` | Single key, named key, modifier chord, or space-separated sequence |
| `keys` | string[] | `["g", "c"]` | Explicit sequence (alternative to space-separated in `key`) |

**Named keys:** Enter, Escape (or esc), Tab, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Backspace, Delete, Home, End, PageUp, PageDown, Space (or " ")

**Modifier prefixes:** `ctrl`, `meta` (or cmd), `shift`, `alt` — combine with `+`: `ctrl+shift+k`

**Sequences:** Two forms: `key: "g c"` (space-separated) or `keys: ["g", "c"]` (array). A small delay (60ms) is inserted between keys in the real extension to allow GitHub's keyboard shortcut handler to settle.

## `wait` Action Schema

| Field | Type | Notes |
|-------|------|-------|
| `ms` | number | Duration to wait in milliseconds |
| `selector` | string | CSS selector to wait to become present |
| `timeout` | number | Max wait time in ms for selector (default 5000) |

`wait` with only `ms` is equivalent to `delay`. `wait` with a `selector` polls until the element appears or timeout elapses.

## `wait_for` Action Schema

Landed in [#55](https://github.com/eldrgeek/Yeshie/pull/55). Implementation: `src/wait-for.ts`.

| Field | Type | Notes |
|-------|------|-------|
| `selector` / `target` | string | CSS selector or abstract target to wait for |
| `text` | string | Wait until this text is present (also `state.text`) |
| `state.stable` | `true` or number | Content-stability wait. `true` uses default `quietMs` 800; a number is quiet-ms. Fingerprint is `length:tail(280)` of visible text. |
| `quietMs` | number | Alternate quiet window when `state.stable` is boolean |
| `onTimeout` | `"continue"` \| (default fail) | `"continue"` returns `ok` with `timedOut: true` instead of throwing |

`selector`, `text` and `state.text` take `{{param}}` interpolation. Until 2026-09-15 the live runtime passed them to the page raw, so they worked only when the caller had substituted params first: `scripts/run-async.mjs` does, and `yeshie_run` and `POST /run` do not.

Recipes should `wait_for` a condition rather than a fixed `delay`.

## `extract_text` Action Schema

| Field | Type | Notes |
|-------|------|-------|
| `selector` | string | CSS selector for the element to read |
| `store_as` | string | Buffer key to store the extracted text |

Returns `text` in the step result. For `<input>` and `<textarea>`, reads `.value`; for all other elements, reads `.textContent`.

## js Action Routing (PRE_RUN_DOMQUERY)

Pattern-matches code strings to pre-bundled fns (no eval):

| Code pattern | Routed to |
|-------------|-----------|
| `find(r =>` or `rows.find` | `PRE_FIND_ROW_AND_CLICK(identifier)` |
| `btns` or `button` | keyword button search |
| `checkbox` | checkbox click pattern |
| `clearAndType` / `findVuetifyInput` / `nativeInputValueSetter` | field modification pattern |

## Model Files

| File | Layer | Content |
|------|-------|---------|
| `models/runtime.model.json` | L1 | Action ISA, resolution strategy ordering |
| `models/generic-vuetify.model.json` | L2 | Vuetify 3 DOM patterns |
| `sites/yeshid/site.model.json` | L3 | YeshID state graph, abstract target registry |

## Source Files

| File | Purpose |
|------|---------|
| `src/target-resolver.ts` | Semantic element resolution (7-step cascade) |
| `src/wait-for.ts` | `wait_for` matcher: selector, text, `state.stable` (#55) |
| `src/step-executor.ts` | All 13 action type handlers |
| `src/dry-run.ts` | Pre-flight resolution checker |
| `src/schema.ts` | Zod schema for payload validation |
| `src/runtime-contract.ts` | Runtime type contracts |
| `src/types.ts` | Shared TypeScript types |
| `src/executor-inject.js` | Injection helpers |
| `src/vue3-input.js` | Vue 3 trusted input simulation |
| `packages/relay/index.js` | HTTP + Socket.IO relay server |
| `packages/extension/src/entrypoints/background.ts` | Extension background worker |
| `packages/extension/src/entrypoints/content.ts` | postMessage ↔ runtime relay |
| `packages/extension/src/entrypoints/content-overlay.ts` | Progress overlay UI |
| `improve.js` | Self-improvement merge script |

## YeshID-Specific Patterns

| Pattern | Detail |
|---------|--------|
| Label style | `div.mb-2` sibling above `.v-input` (NOT `.v-label` inside `.v-input`) |
| Edit form labels | `<td>First name</td><td><input></td>` — resolved via Step 3b |
| View vs Edit | Detail page is read-only; must click "Edit" button first |
| Save button | Labeled "Confirm" (not "Save") |
| Delete = "Offboard" | Hidden in "Manage" dropdown |
| Generated IDs | `input-v-10`, `input-v-12` change per page load — never hardcode |
| People list path | `Organization > People` in sidebar |
| User UUID in URL | `/organization/people/{uuid}/details` — read from list table |
