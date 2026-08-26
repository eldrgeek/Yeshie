# Yeshie — Working Memory

Chrome MV3 extension + local relay `http://127.0.0.1:3333`: Claude sends payload JSON (`sites/<domain>/tasks/*.payload.json`) → extension executes autonomously across page navigations → returns ChainResult. This is the **only** web-automation path. CIC is discovery-only. `PLAN.md` (CDP/Puppeteer) is historical/superseded.

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

## Recipe count (2026-08-26; prior sweep 2026-07-04 WQ-122/WQ-124)

A "recipe" is a `sites/<domain>/tasks/*.payload.json` file (that's what the per-site
`README.md` files, e.g. `sites/github.com/README.md`, call them). The top-level
`recipes/` directory is a one-off (`auth-flow-handler` only, added whole 2026-05-05,
no history since) — not the repo's actual recipe home; don't count only that dir.

Current corpus: **35 site dirs / ~220 recipes**. `github.com` is the largest set
(100 recipes, of which 38 public ones were "live verified," per its own README —
the rest need an authenticated session to verify). `google-admin` and `okta`
already have payloads. This git branch may lag the operator laptop (e.g. Rocket
Money live-verified there, not landed here). Full per-site breakdown:
`find sites -name "*.payload.json" | sed 's#/tasks/.*##' | sort | uniq -c | sort -rn`.

2026-07-04 WQ-124 snapshot (historical): 188 git-tracked / 208 on disk across 30
site dirs. Count went 6 (Mar 30) → 24 (Apr 10) → 28 (Apr 12) → 84 (Jun 12) → 184
(Jun 13) → 188 (Jun 19) → 208 (Jul 4) → ~220 (Aug 26). It was never 46 at any
commit. No recipes were lost — only a handful of superseded `sites/okta/tasks/*`
files were deleted/renamed as that set matured; corpus size only ever grew.

## Runtime policy — Yeshie-first (Mike, 2026-07-08)

Browser automation runs on **Yeshie recipes via the relay**, not Claude-in-Chrome
(CIC/computer-use). CIC burns inference budget; the Yeshie relay does not. Standing
order for any browser task:

1. **Look for a Yeshie recipe first** (`sites/<domain>/tasks/*.payload.json`). If one
   exists, run it via `yeshie_run`.
2. **If the recipe is stale** (a step times out on a `wait_for`, selector drift): fix
   the recipe — inspect the live DOM for the new stable hook (prefer `data-testid`,
   then `aria-label`, then a scoped wrapper), update the payload, re-verify through the
   relay. Don't abandon the recipe and finish the flow by hand in CIC.
3. **If no recipe is defined:** either have Yeshie build it, or use CIC only to *figure
   out* the flow/selectors — then **capture that as a new recipe** so the next run is
   relay-native. CIC is discovery scaffolding, not the runtime.

Case study: `sites/suno.com/tasks/03-create-song.payload.json` — Suno's 2026-07
redesign swapped the lyrics `<textarea>` for a contenteditable `<div>` and reshuffled
the form; the recipe was healed and re-verified live (all 7 fill steps `ok`) rather
than completed in CIC.

## Key Patterns

| Pattern | Rule |
|---------|------|
| MCP timeout | `yeshie_run` MCP tool ~60s hard cap. For long recipes (e.g. DeepSeek+DeepThink) submit async: `POST /run/async` → id, poll `GET /run/result/:id`, or use `node scripts/run-async.mjs <recipe>` (see Async runner below) |
| Health check | `curl -s http://127.0.0.1:3333/status` — expect `{"ok":true,"extensionConnected":true}` |
| extract_text | First-class action: `selector` + `store_as`. Exists in `step-executor.ts` / `background.ts`. |
| Claude CLI flags | `--output-format stream-json` requires `--verbose` with `-p`; omit `--input-format` for plain prompt strings |
| Outer loop | Edits to `background.ts` / `target-resolver.ts`. Inner loop = model JSON only. |
| Chrome debug | `chrome-debug` / `chrome-debug-restart` — both aliases launch the canonical `ChromeMain` user-data-dir on port 9222. No login needed because `ChromeMain` was copied from the old default Chrome dir. |

## Async recipe runner — beat the ~60s MCP cap (added 2026-07-10)

The synchronous `POST /run` (what `yeshie_run` wraps) blocks the caller and the MCP
tool tops out at ~60s. Recipes whose page runs longer — e.g.
`chat.deepseek.com/tasks/01-submit-prompt` with **DeepThink** reasoning on
(30–60s of chain-of-thought) — can't be verified through it. Use the async path:

- **`POST /run/async`** — body `{payload, params?, tabId?, timeoutMs?}` (default
  `timeoutMs` 300000). Returns `202 {ok:true, id, status:"running"}` **immediately**;
  the caller is never blocked. Internally it's a normal `skill_run` whose settled
  ChainResult is stashed instead of HTTP-replied — so every existing hook
  (`chain_result`, `chain_error`, `status_update` progress, disconnect-rejection)
  still applies.
- **`GET /run/result/:id`** — poll. Returns `{id, status: running|done|error,
  result, error, progress}`. `result` is the full ChainResult once `done`. Settled
  runs expire after the 30-min job TTL. `GET /status` now also reports `asyncRuns`.
- **`node scripts/run-async.mjs <recipe-path> [--param k=v] [--submit-only]
  [--poll <id>] [--json]`** — ergonomic wrapper: resolves `{{params}}` client-side
  (payload's own `params` block supplies defaults, `--param` overrides), submits,
  and polls to completion (or `--submit-only` for true fire-and-forget + later
  `--poll <id>`). Path is relative to `sites/` or absolute. Exit 0 = green
  (`goalReached && success`).

Verified green 2026-07-10: DeepSeek submit-prompt, DeepThink ON, all 9 steps `ok`,
correct answer, through `run-async.mjs`.

**Known limit (separate from the transport):** the DeepSeek recipe's completion
detection (button `.ds-loading` spinner, `s5a`/`s5b`) is empirically unreliable —
in real runs `s5a` times out the full 15s without catching the spinner, so
detection degrades to "wait ~15s then read." Fine for normal-length answers; a
pathologically long generation (e.g. a 3500-word essay) gets read before it
finishes → truncated/empty. The robust fix is an **engine-level content-stability
wait** (`state.stable`) in `step-executor.ts` — no reliable DOM completion selector
survives scrutiny (the post-message action toolbar `.ds-button--borderlessNeutral`
is hover/length-dependent). Filed as follow-up; benefits every streaming-chat recipe.

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
(Verified 2026-07-04, WQ-124 sweep: `~/Library/Application Support/Google/ChromeDebug`
still exists on disk — retired from use, not deleted; safe to remove but not required.)

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
