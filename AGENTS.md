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

**When starting a new task:** read `docs/silicon/overview.md` and `docs/silicon/state.md` first. These give you current component layout and task status in minimal tokens. Check `docs/silicon/architecture.md` if you need to understand data flow. Use `docs/carbon/` for deeper explanations of anything that doesn't make sense.

**Don't rely only on CLAUDE.md** — it's a good entry point but may lag behind the docs/ directory, which is updated more granularly.

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

### Services
Both services must be running for any payload execution:
- Relay: `curl -s http://localhost:3333/status` — expect `{"ok":true,"extensionConnected":true,"pending":0}`
- If `extensionConnected: false`: reload extension in `chrome://extensions`
- Restart services: `launchctl kickstart -k gui/$(id -u)/com.yeshie.relay`

### Tests
`npm test` — should always be 176/176. Run tests before and after any changes to `src/` or `packages/`.

### Payload execution
Prefer `yeshie_run()` via MCP over curl. If running curl, always include `"timeoutMs": 120000`.

### Self-improvement
After any successful chain run, run: `node improve.js <payload_path> /tmp/chain-result.json`
This merges resolved selectors back into the payload and moves it toward production mode.

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
