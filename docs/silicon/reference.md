---
audience: silicon
document: reference
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
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

Base URL: `http://localhost:3333`

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/run` | `{payload, params, tabId, timeoutMs}` | ChainResult JSON |
| GET | `/status` | — | `{ok: bool, extensionConnected: bool, pending: int}` |

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

## Action Types

| Action | Description |
|--------|-------------|
| `navigate` | Navigate to URL (value = URL, supports `{{params.base_url}}`) |
| `type` | Type value into target input |
| `click` | Click target element |
| `wait_for` | Wait for target to become present/visible |
| `read` | Read text/value from target |
| `assess_state` | Evaluate condition, return boolean |
| `js` | Run pre-bundled DOM query (routed by PRE_RUN_DOMQUERY) |
| `find_row` | Find table row matching identifier, click it |
| `click_text` | Click first element matching text |
| `hover` | Hover over target |
| `scroll` | Scroll target into view |
| `select` | Select dropdown option |
| `click_preset` | Click a preset/chip element |
| `probe_affordances` | Discover interactive elements on page |
| `delay` | Wait N milliseconds |

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
