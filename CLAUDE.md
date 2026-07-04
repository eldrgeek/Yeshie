# Yeshie — Working Memory

Chrome extension + local relay server: Claude sends payload JSON → extension executes autonomously across page navigations → returns ChainResult.

## References

| Resource | Path |
|----------|------|
| Action items | `~/Projects/yeshie/ACTION_ITEMS.md` |
| Auto-memory | `~/Projects/yeshie/memory/` (mike.md, patterns.md, projects.md) |
| Project skills | `~/Projects/yeshie/.claude/skills/` |
| Global skills | `~/.claude/skills/` |
| Docs (silicon) | `~/Projects/yeshie/docs/silicon/` — start here for orientation |
| Docs (carbon) | `~/Projects/yeshie/docs/carbon/` — narrative context |
| Site payloads | `~/Projects/yeshie/sites/` |
| Full spec | `~/Projects/yeshie/SPECIFICATION.md` |

## Recipe count (corrected 2026-07-04, WQ-122)

A "recipe" is a `sites/<domain>/tasks/*.payload.json` file (that's what the per-site
`README.md` files, e.g. `sites/github.com/README.md`, call them). The top-level
`recipes/` directory is a one-off (`auth-flow-handler` only, added whole 2026-05-05,
no history since) — not the repo's actual recipe home; don't count only that dir.

True count as of 2026-07-04: **188 git-tracked recipes** (209 on disk incl. in-progress
untracked work) across 27 site dirs. `github.com` is the largest set (100 recipes, of
which 38 are "live verified," per its own README — the rest need an authenticated
session to verify). Full per-site breakdown: `find sites -name "*.payload.json" | sed
's#/tasks/.*##' | sort | uniq -c | sort -rn`.

The prior "46+ recipes" figure (root `~/Projects/CLAUDE.md`) never matched any point in
git history — count went 6 (Mar 30) → 24 (Apr 10) → 28 (Apr 12) → 84 (Jun 12) → 184
(Jun 13) → 188 (Jun 19) → 209 (today, WIP). It was never 46 at any commit; likely an
early guess that got carried forward without re-measuring when the corpus grew. No
recipes were lost — only a handful of superseded `sites/okta/tasks/*` files were
deleted/renamed as that set matured; corpus size only ever grew.

## Key Patterns

| Pattern | Rule |
|---------|------|
| MCP timeout | ~60s hard cap — use `nohup bash runner.sh &` fire-and-forget for long tasks |
| Claude CLI flags | `--output-format stream-json` requires `--verbose` with `-p`; omit `--input-format` for plain prompt strings |
| Outer loop | Edits to `background.ts` / `target-resolver.ts`. Inner loop = model JSON only. |
| Health check | `curl -s http://localhost:3333/status` — expect `{"ok":true,"extensionConnected":true}` |
| Chrome debug | `chrome-debug` / `chrome-debug-restart` — both aliases launch the canonical `ChromeMain` user-data-dir on port 9222. No login needed because `ChromeMain` was copied from the old default Chrome dir. |

## Chrome DevTools (for site surveys)

The `chrome-devtools-mcp` connects to Chrome on **port 9222**. The canonical launch path is `ChromeMain`, not the macOS default Chrome user-data-dir.

**Preferred workflow:**
```bash
chrome-debug          # launches/consolidates ChromeMain on port 9222
chrome-debug-restart  # same launcher; kept for muscle memory
```

**Profile for both aliases:** `~/Library/Application Support/Google/ChromeMain` / `Default`.
Chrome 136+ silently drops `--remote-debugging-port` for the default user-data-dir
(`~/Library/Application Support/Google/Chrome`), so do not point launchers back there.
`ChromeDebug` is retired legacy state; do not recreate the old symlinked-profile trick.

**Session check:** `curl -s http://localhost:9222/json/version | python3 -m json.tool`

**Auth state check (app.yeshid.com):** Navigate to `https://app.yeshid.com/` — if redirected to `/login`, session expired. Use `chrome-debug-restart` to get a fresh session.

## Yeshie HUD — retired 2026-07-01 (Mike's call)

Mike: "it's just a box that pops up and shows no information." Confirmed and retired.

**What it was:** `com.yeshie.hud` launchd job running `scripts/hud.py` (native macOS panel app, `:3334` control port). It polls the relay for active jobs and force-shows a native panel (`orderFrontRegardless`) whenever it thinks a job is running; the panel content is a WKWebView pointed at `localhost:3333/hud`. At retirement time the WKWebView had never successfully loaded (`GET :3334/wv-status` → `{"loaded": false}`), so the panel popped with nothing rendered inside it — hence the empty box. Root cause was investigated 2026-04-30 (see `HUD-INVESTIGATION-RESULTS.md`, `HUD-FINDINGS-*.md`) — leading hypotheses were a WKWebView load/cache failure and a `jobMap`/`hud_update` vs `jobs`/`job_update` bookkeeping split between job writers and the HUD's event subscription — but it was never fixed. A prior note (in `mac-controller/KNOWLEDGE.md`) claimed this was already retired 2026-06-10; it wasn't — the plist was still `RunAtLoad`/`KeepAlive=true` and the process was live (PID 777) until this pass.

**What was disabled:**
```bash
launchctl bootout gui/$(id -u)/com.yeshie.hud
mv ~/Library/LaunchAgents/com.yeshie.hud.plist ~/Library/LaunchAgents/com.yeshie.hud.plist.disabled
# backup also kept at ~/Library/LaunchAgents/com.yeshie.hud.plist.bak
```

**To re-enable:**
```bash
mv ~/Library/LaunchAgents/com.yeshie.hud.plist.disabled ~/Library/LaunchAgents/com.yeshie.hud.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yeshie.hud.plist
```
Fix the WKWebView load failure (or the job-bookkeeping split) first, or it'll just be an empty box again.

**Confirmed unaffected by the retirement:** `com.yeshie.relay` (`:3333/status`), the Pulse asks path (`:3333/hud/asks`, `cc hud-ask`), `com.yeshie.listener`, `com.yeshie.watcher`, and the ⌃⌥R recording toggle (`do-it-once`, dio-phase-a) — none of these depend on the `com.yeshie.hud` process.
