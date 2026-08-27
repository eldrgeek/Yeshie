# AGENTS.md

Instructions for AI agents working in the Yeshie repository.

---

## Documentation Map

This repo uses a dual-audience documentation structure under `docs/`:

- **`docs/silicon/`** — LLM-optimized docs. Dense, structured, machine-parseable. Optimized for token efficiency. Read these when you need facts fast.
- **`docs/carbon/`** — Human-optimized docs. Narrative, contextual, onboarding-friendly. Read these when you need to understand the "why."

Both folders contain the same document set:

| Document | What it covers |
|----------|---------------|
| `overview.md` | Project purpose, components, validated payloads, process management |
| `architecture.md` | Components, data flow, target resolution, auth recovery, key design decisions |
| `quickstart.md` | Prerequisites, setup steps, running payloads, troubleshooting |
| `reference.md` | MCP tools, relay API, payload schema, action types, ChainResult format |
| `state.md` | Unit test results, integration test status, pending work, known caveats |
| `decisions.md` | Architectural decision records (ADR-001 through ADR-007) |

**When starting a new task:** read `CLAUDE.md` first (working-memory front door), then `docs/silicon/overview.md` and `docs/silicon/state.md`. These give you current component layout and task status in minimal tokens. Check `docs/silicon/architecture.md` if you need to understand data flow. Use `docs/carbon/` for deeper explanations of anything that doesn't make sense.

**CLAUDE.md vs silicon:** `CLAUDE.md` is the working-memory front door. `docs/silicon/overview.md` last had a full refresh on 2026-04-04 and lagged CLAUDE.md on runtime facts until 2026-08-26. After that alignment, `docs/silicon/overview.md` and `docs/silicon/reference.md` must agree with `CLAUDE.md` on: Chrome MV3 extension + relay `http://127.0.0.1:3333`; 35 site dirs / ~220 `*.payload.json`; health `GET /status` → `extensionConnected`; run `POST /run` or MCP `yeshie_run`; long jobs `POST /run/async`; `extract_text` exists; CIC is discovery-only, never runtime. Do not treat silicon as fresher than CLAUDE.md by default.

**Live runtime (the only web-automation path):** Chrome MV3 extension + local relay `http://127.0.0.1:3333` + `sites/<domain>/tasks/*.payload.json`. `PLAN.md` (CDP/Puppeteer executor) is historical/superseded. Do not add Playwright, CDP, Computer Use, or a second browser stack. Claude-in-Chrome is discovery scaffolding only.

---

## Sync Invariant

**The silicon and carbon docs are mirrors in content, not format.**

Every fact that appears in one audience's document must appear in the other. Component names, file paths, feature status, action types, API signatures — all must agree across the two directories.

### The three-part invariant

1. **Coverage parity** — every `silicon/*.md` has a corresponding `carbon/*.md` with the same filename
2. **Factual agreement** — both files in each pair describe the same facts. If `silicon/state.md` says payload `05` has `status: not_run`, `carbon/state.md` must say the same.
3. **Simultaneous update** — when you change one, change the other in the same session. No split commits where silicon is updated but carbon is stale.

### Sync check — run before finishing any task that touches docs/

- [ ] Every `docs/silicon/*.md` has a corresponding `docs/carbon/*.md`
- [ ] Both files in each pair have the same `sync_version` value in their YAML frontmatter
- [ ] Both files agree on: payload status, component names, file paths, API names, port numbers
- [ ] Neither file has facts the other lacks

### How to update docs

1. Make your content changes in the silicon version (it's the factual source of truth)
2. Mirror those changes (same facts, adapted format) in the carbon version
3. Increment `sync_version` by 1 in both files
4. Update `last_updated` in both files

**If you only have time to update one:** update silicon and leave a comment at the top of the carbon file:
```
<!-- SYNC_NEEDED: <brief description of what changed in silicon> -->
```
A future agent will pick it up.

### When to add new documents

Add a new document pair (silicon + carbon) when:
- A significant new subsystem is introduced that doesn't fit existing docs
- A question from contributors keeps coming up that no existing doc answers
- A cluster of reference material has grown too large for its current home

When adding a new document, add a row to the Documentation Map table above.

---

## Repository-Specific Notes for Agents

### Services (via HTTP)
Both services must be running for any payload execution:
- **Health check:** `curl -s http://127.0.0.1:3333/status` — expect `{"ok":true,"extensionConnected":true,"pending":0}`
- If `extensionConnected: false`: reload extension in `chrome://extensions`
- Restart services: `launchctl kickstart -k gui/$(id -u)/com.yeshie.relay`

#### Relay HTTP API
The relay server on `http://127.0.0.1:3333` exposes these endpoints directly. Use `curl` to interact:

- **`GET /status`** — health check, returns `{"ok":true,"extensionConnected":<bool>,"pending":<int>,"asyncRuns":<int>,"lastDisconnectAt":<iso\|null>,"buildVersion":<str\|null>}`
- **`POST /run`** — execute a payload against a browser tab (sync; MCP `yeshie_run` wraps this)
  ```bash
  curl -s -X POST http://127.0.0.1:3333/run \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\": $(cat sites/yeshid/tasks/03-user-modify.payload.json),
      \"params\": {\"user_identifier\": \"Claude\", \"base_url\": \"https://app.yeshid.com\"},
      \"tabId\": null,
      \"timeoutMs\": 120000
    }"
  ```
- **`POST /run/async`** — fire-and-forget run for jobs that outlast the ~60s MCP cap. Body `{payload, params?, tabId?, timeoutMs?}` (default `timeoutMs` 300000). Returns `202 {ok:true, id, status:"running"}` immediately. Internally a normal `skill_run` whose ChainResult is stashed.
- **`GET /run/result/:id`** — poll an async run. Returns `{id, status: running|done|error, result, error, progress}`. `result` is the full ChainResult once `done`. Settled runs expire after the 30-min job TTL. Wrapper: `node scripts/run-async.mjs <recipe-path>`.
- **`POST /chat`** — send a chat message to the side panel
- **`GET /chat/listen`** — long-poll for incoming chat messages from the side panel

> **Note:** Claude Code users have these capabilities via MCP tools (`yeshie_run`, `yeshie_status`, etc. in `.mcp.json`). Agents without MCP support (e.g., Codex) should use the HTTP API directly via curl.

### Tests
`npm test` — should always be 176/176. Run tests before and after any changes to `src/` or `packages/`.

### Payload execution
Prefer `yeshie_run()` via MCP over curl. If running curl, always include `"timeoutMs": 120000`.

### Self-improvement
`improve.js` auto-heal is wired into `POST /run` and `POST /run/async` ([#55](https://github.com/eldrgeek/Yeshie/pull/55)). It runs only when `success && goalReached` and `_meta.selfImproving === true`, then writes `cachedSelector` through the existing merge path. Skipped on failed runs. Hard-blocked for `sites/app.rocketmoney.com/tasks/01-list-all-recurring` and `02-list-inactive`. Manual still works: `node improve.js <payload_path> /tmp/chain-result.json`.

### YeshID quirks
- Labels use `div.mb-2` siblings, NOT `.v-label` inside `.v-input`
- "Delete" = "Offboard" in a "Manage" dropdown
- "Save" = "Confirm" on all forms
- Edit form fields only appear after clicking the "Edit" button
- Never hardcode generated IDs (`input-v-10` etc.) — they change per session

### Extension rebuild
After changes to `packages/extension/src/`:
1. `cd packages/extension && npm run build`
2. Reload extension in `chrome://extensions`
3. Wait for `extensionConnected: true` in relay status

### Hot-reload
The watcher service (port 27182) triggers automatic extension reloads on source changes. After reload, navigate to the target site to reinject the content script.
