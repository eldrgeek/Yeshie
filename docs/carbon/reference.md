---
audience: carbon
document: reference
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Reference

A guide to the APIs, file formats, and action types you'll encounter when working with Yeshie. See [../silicon/reference.md](../silicon/reference.md) for a denser, tabular version.

---

## MCP Tools

The cc-bridge MCP server (`~/Projects/cc-bridge-mcp/server.js`) exposes these tools to Claude:

### yeshie_run
The main entry point. Runs a payload file against a browser tab.

```
yeshie_run(
  payload_path="~/Projects/yeshie/sites/yeshid/tasks/01-user-add.payload.json",
  params={"user_identifier": "Jane Smith", "base_url": "https://app.yeshid.com"},
  tab_id=null,          // null = active tab; or pass a specific Chrome tab ID
  timeout_seconds=120   // default 120s; complex tasks may need more
)
```

Returns: a `ChainResult` JSON describing what happened at each step.

### yeshie_status
Check whether the relay and extension are connected before running a task.

```
yeshie_status()
// Returns: {"ok": true, "extensionConnected": true, "pending": 0}
```

### shell_exec / claude_code
Utility tools for running shell commands or spawning Claude Code sessions.

```
shell_exec(command="npm test", workdir="~/Projects/yeshie", timeout_seconds=30)
claude_code(task="validate payload 05", workdir="~/Projects/yeshie", timeout_seconds=240)
```

### Side Panel Chat Tools
For interacting with Yeshie's browser side panel chat interface.

- `yeshie_listen(timeout_seconds)` — wait for the user to send a message
- `yeshie_respond(chat_id, response)` — send a reply
- `yeshie_chat_status()` — check whether the listener is active

---

## Payload Files

Payloads live in `sites/{domain}/tasks/`. Each one is a JSON file describing:

1. **Metadata** (`_meta`) — which site, which task, authentication config
2. **Expected parameters** (`params`) — the list of variable names the caller must supply
3. **The chain** — an ordered list of steps

Here's a minimal payload skeleton:

```json
{
  "_meta": {
    "site": "yeshid",
    "task": "user-add",
    "mode": "exploratory"
  },
  "params": ["user_first_name", "user_last_name", "user_email", "base_url"],
  "chain": [
    {
      "action": "navigate",
      "value": "{{params.base_url}}/organization/people"
    },
    {
      "action": "click",
      "target": {
        "name": "Onboard button",
        "cachedSelector": "button.v-btn[data-action='onboard']",
        "cachedConfidence": 0.91
      }
    }
  ]
}
```

The `cachedSelector` and `cachedConfidence` fields are filled in automatically after successful runs — you don't write them by hand. They're what makes subsequent runs faster.

---

## Action Types

Each step in the chain has an `action` field. Here's what each one does:

| Action | What it does |
|--------|-------------|
| `navigate` | Go to a URL. Supports `{{params.base_url}}` template substitution. |
| `type` | Type text into an input field. Uses chrome.debugger for trusted events. |
| `click` | Click an element. |
| `wait_for` | Wait until an element appears or becomes visible before continuing. |
| `read` | Read text or value from an element and store it in the chain result. |
| `assess_state` | Check whether a condition is true (e.g. "is this snackbar visible?"). |
| `js` | Run a pre-bundled DOM query function (routed by pattern matching, not eval). |
| `find_row` | Find a table row that matches an identifier and click it. |
| `click_text` | Click the first element whose visible text matches a string. |
| `hover` | Hover over an element (to reveal hover menus, tooltips, etc.). |
| `scroll` | Scroll an element into view. |
| `select` | Select an option from a dropdown. |
| `click_preset` | Click a chip or preset element in a picker. |
| `probe_affordances` | Discover and return all interactive elements on the current page. |
| `delay` | Wait a specified number of milliseconds. |

---

## Target Resolution

The `target` object in each step tells Yeshie how to find the element. The most important fields:

- **`name`** — a human-readable semantic label (e.g. "Onboard button", "Email field"). This is what the resolution cascade uses to search.
- **`cachedSelector`** — a CSS selector that worked in a previous run. Used directly if confidence is ≥ 0.85 and it's less than 30 days old.
- **`fallbackSelectors`** — a list of explicit CSS selectors to try if everything else fails.

You only need to fill in `name` when writing a new payload step. The system learns `cachedSelector` on its own.

---

## The ChainResult

When a chain finishes (successfully or not), the relay returns a ChainResult:

```json
{
  "success": true,
  "steps": [
    {
      "stepIndex": 0,
      "action": "navigate",
      "success": true
    },
    {
      "stepIndex": 1,
      "action": "click",
      "success": true,
      "resolvedVia": "cached_selector",
      "resolvedOn": "2026-04-01"
    }
  ],
  "resolvedSelectors": {
    "Onboard button": {
      "selector": "button.v-btn[data-action='onboard']",
      "confidence": 0.91,
      "resolvedVia": "cached_selector"
    }
  }
}
```

The `resolvedSelectors` section is the raw material for self-improvement. Run `node improve.js <payload_path> <chain_result_path>` to merge it back into the payload.

---

## YeshID-Specific Notes

YeshID has some quirks that are worth knowing if you're writing or debugging payloads for it:

- **"Delete" is called "Offboard"** — it's hidden in a "Manage" dropdown on the user detail page. The `find_row` step finds the user by name, clicking through to the detail page is a separate step.
- **"Save" is called "Confirm"** — all forms use "Confirm" not "Save".
- **Form labels use the sibling pattern** — labels live in `div.mb-2` elements above their inputs, not inside them. This is why Vuetify's standard `.v-label` detection doesn't work here.
- **Edit mode** — the user detail page starts read-only. You must click the "Edit" button before any input fields appear.
- **Generated IDs change per session** — `input-v-10`, `input-v-12` and similar IDs are generated fresh every page load. Never put these in a payload. Always use semantic names.

---

## Source File Map

If you need to look at code, here's where to find things:

| File | What's there |
|------|-------------|
| `src/target-resolver.ts` | The 7-step element resolution cascade |
| `src/step-executor.ts` | Handler for each action type |
| `src/dry-run.ts` | Pre-flight check that validates a payload can execute |
| `src/schema.ts` | Zod validation schema for payload files |
| `packages/relay/index.js` | The HTTP + WebSocket relay server |
| `packages/extension/src/entrypoints/background.ts` | The main extension brain |
| `improve.js` | Self-improvement merge script |
| `sites/yeshid/tasks/` | All validated YeshID payloads |
| `models/` | L1 and L2 knowledge model files |
