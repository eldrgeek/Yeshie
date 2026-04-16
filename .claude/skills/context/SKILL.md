---
name: yeshie:context
description: >
  Entry-point meta-skill for the Yeshie project. Load this at the start of any
  Yeshie session to get repo orientation, key rules, and routing to sub-skills.
  Trigger on: starting a Yeshie work session, any first message involving Yeshie,
  orientation questions about the repo, or "load yeshie context".
---

# Yeshie — Session Context

**Project:** `~/Projects/yeshie`
**What it is:** Chrome MV3 extension + local relay server. Claude sends a payload JSON → relay bridges over Socket.IO → extension executes multi-step automation in a live browser tab → returns a ChainResult.

---

## Repo Structure

```
~/Projects/yeshie/
├── CLAUDE.md                        ← working memory (hot cache)
├── docs/silicon/                    ← LLM-optimized docs (start here for deep orientation)
├── docs/carbon/                     ← human-readable docs
├── src/
│   ├── target-resolver.ts           ← 7-step semantic element resolution
│   ├── step-executor.ts             ← action type handlers
│   └── dry-run.ts                   ← pre-flight resolution checker
├── tests/unit/                      ← 19 test files, 176+ tests (vitest)
│   └── fixtures/                    ← vuetify-onboard.html, yeshid-login.html
├── models/
│   ├── runtime.model.json           ← L1: ISA (action types, resolution strategies)
│   └── generic-vuetify.model.json   ← L2: Vuetify 3 DOM patterns
├── sites/
│   └── yeshid/
│       ├── site.model.json          ← L3: site state graph + cached selectors
│       └── tasks/                   ← payload JSONs (00–19, q01–q02)
├── packages/
│   ├── extension/src/entrypoints/
│   │   ├── background.ts            ← main: chain executor, relay client, auth flow
│   │   ├── content.ts               ← postMessage relay
│   │   ├── content-overlay.ts       ← progress overlay
│   │   └── sidepanel/               ← chat side panel (Haiku listener)
│   ├── relay/index.js               ← Socket.IO + HTTP server (port 3333)
│   └── watch-and-build.mjs          ← WXT dev watcher (port 27182)
└── improve.js                       ← self-improvement merge script
```

**Related:** `~/Projects/cc-bridge-mcp/server.js` — MCP server exposing `yeshie_run`, `shell_exec`, `claude_code`, `yeshie_listen`, `yeshie_respond` tools.

---

## Key Routing Rules

| Rule | Detail |
|------|--------|
| **shell vs bash** | Use `shell_exec` (cc-bridge) for host commands — it runs on Mike's Mac. Use the sandbox `Bash` tool only for sandbox-local work (writing files, running pip, etc.) |
| **Risky code changes** | Branch first: `git checkout -b wip/description` before editing background.ts, target-resolver.ts, or relay/index.js |
| **Long shell tasks** | MCP timeout is ~60s hard cap. Use `nohup bash runner.sh &` for anything longer |
| **Claude CLI flags** | `--output-format stream-json` REQUIRES `--verbose` with `-p`; `--input-format` only accepts `text` or `stream-json` — omit for plain strings |
| **React textarea injection** | `nativeInputValueSetter` + `_valueTracker.setValue(prev)` before Enter |
| **Self-improvement** | After 5 successful runs, `node improve.js <payload> <chain-result>` promotes payload to production mode |

---

## Services

| Service | Port | launchd label | Log |
|---------|------|--------------|-----|
| Relay | 3333 | `com.yeshie.relay` | `/tmp/relay.log` |
| Watcher + build | 27182 | `com.yeshie.watcher` | `/tmp/wxt.log` |

**Health check:** `curl -s http://localhost:3333/status`
→ expect `{"ok":true,"extensionConnected":true,"pending":0}`

**If `extensionConnected: false`:** reload the extension in `chrome://extensions`.

**Restart a service:**
```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay
launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher
```

---

## cc-bridge MCP Tools

| Tool | Purpose |
|------|---------|
| `shell_exec(command, workdir, timeout_seconds)` | Run shell commands on host (default 30s) |
| `claude_code(task, workdir, timeout_seconds)` | Claude Code non-interactive (3–4 min timeout) |
| `yeshie_run(payload_path, params, tab_id, timeout_seconds)` | Run a payload; returns ChainResult |
| `yeshie_status()` | Check relay + extension connection |
| `yeshie_listen(timeout_seconds)` | Wait for side panel chat message |
| `yeshie_respond(chat_id, response)` | Reply to side panel chat |
| `yeshie_chat_status()` | Check chat listener status |

---

## Running a Payload

```python
# Preferred
yeshie_run(
  payload_path="~/Projects/yeshie/sites/yeshid/tasks/03-user-modify.payload.json",
  params={"user_identifier": "Claude", "new_first_name": "Claude", "new_last_name": "AI",
          "base_url": "https://app.yeshid.com"},
  tab_id=None   # omit for active tab
)
```

---

## Sub-Skill Routing Table

Load these on demand — don't pre-load all of them.

| You need to… | Load skill |
|---|---|
| Build/rebuild the extension, deal with WXT, hot-reload | `yeshie:rebuild` |
| Run tests, understand test suites, write new tests | `yeshie:test` |
| Author or edit payload JSONs, add a new site | `yeshie:payload` |
| Debug relay, Socket.IO events, inject flow | `yeshie:relay` |
| Drive Haiku via side-panel chat | `yeshie:driver` (existing skill at `.claude/skills/yeshie-driver/`) |

---

## North Star

"Point at any website → exploration payload builds site model → natural language task → payload generated → executed → ChainResult returned. No human writes code."

**Current position:** 4 YeshID task payloads validated (01–04). Login/SSO flow implemented but not end-to-end verified on real expired session. Next: validate `05-integration-setup`, verify auth flow, generalize to second site.
