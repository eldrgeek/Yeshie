# HUD Investigation — Aggregated Results

Date: 2026-04-30
Inputs:
- `HUD-INVESTIGATION.md` — raw brief
- `HUD-FINDINGS-CLAUDE.md` — Claude (Opus 4.7), first-principles
- `HUD-FINDINGS-GPT4O.md` — OpenAI gpt-4o
- `HUD-FINDINGS-GEMINI.md` — **unavailable**, `GEMINI_API_KEY` rejected as `API_KEY_INVALID` (key needs rotation)

Aggregation is therefore Claude + GPT-4o.

---

## Where the two perspectives agree

Both rank the same five mechanisms in the top tier, just with different weights:

| Mechanism | Claude rank | GPT-4o rank |
|---|---|---|
| JS not actually executing in WKWebView (no proof it runs) | 4 | **1** |
| Socket.IO connection from WV failing silently | 4 | 2 |
| `pollJobs()` not running / not triggering `render()` | 6 | 3 |
| Stale cached page in WKWebView | 5 | 4 |
| CSP / transport blocking | 7 | 5 |

Both also independently identify the same single best next experiment, in essentially the same words:

> **Verify whether JavaScript is executing at all inside the WKWebView** — by making `/wv-status` actually call `evaluateJavaScript_completionHandler_` (or an equivalent log-and-read).

That is the unanimous next step.

## Where they diverge

- **Claude's #1 hypothesis ("there genuinely are no active jobs — the render is correct") is absent from GPT-4o's list.** Claude weights it heavily because the captured `curl /jobs/status?filter=all` in the brief literally returned `{"jobs":[]}` and `jobs-state.json` is `{}` — i.e. the brief never demonstrates that the relay was returning *non-empty* data when the HUD looked blank. GPT-4o accepts the brief's framing at face value.
- **Claude's #2 hypothesis (`jobs-state.json` deserialization mismatch from commit `f665c115`)** is unique to Claude, anchored on the brief's internal inconsistency that the file is "61 bytes, content `{}`" (which can't both be true).
- **Claude's #3 hypothesis (two-system split: `jobMap` vs `jobs`, `hud_update` vs `job_update`, dead `jobs_snapshot` listener)** is documented directly in the brief and absent from GPT-4o's analysis. This is a strong, brief-supported divergence.
- **Claude's #6 (silent `render()` exception swallowed by the silent `.catch`)** is unique to Claude.
- **GPT-4o weights "WKWebView didn't run any JS" as #1**; Claude treats that as a *diagnostic* deficiency rather than a likely root cause and uses it to motivate the proposed experiment.

In short: GPT-4o stays close to the symptom ("nothing on screen → JS probably didn't run"). Claude pulls in evidence specific to this codebase ("the relay actually returned no jobs; there's a documented two-system split; the persistence commit is suspicious").

## Top-3 most likely root causes (consensus + adjudication)

1. **The relay genuinely had no active jobs at the moment of observation, and the HUD was rendering correctly.** Highest-likelihood given the captured curl output. If true, the entire investigation is a non-bug — but it cannot be ruled out without re-running with a known-injected probe job.
2. **A two-system bookkeeping split between `jobMap`/`hud_update` (System 1) and `jobs`/`job_update` (System 2)** causes job creators (cc-dispatch, scripts) to write to one Map while the HUD subscribes to events from the other. The brief explicitly documents this divergence; the dead `jobs_snapshot` listener is a smoking gun.
3. **JavaScript is not actually executing in the WKWebView** — either because the inlined `<script>` is parse-broken, the page is a stale cached load from before recent commits, or the Socket.IO + fetch boot path crashes before declaring globals. Currently impossible to confirm or deny because `/wv-status` only inspects native AX state and never runs JS.

## Single best next experiment

**Patch `/wv-status` in `hud.py` (lines ~104–121) to call `webview.evaluateJavaScript_completionHandler_(js, handler)` with the existing-but-unused `js` string and include the JSON result in the HTTP response.** Then:

```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.hud
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"id":"probe-1","title":"Probe","status":"running"}' \
  http://localhost:3333/jobs/update
sleep 6
curl -s http://localhost:3334/wv-status | python3 -m json.tool
curl -s 'http://localhost:3333/jobs/status?filter=all' | python3 -m json.tool
curl -s http://localhost:3333/jobs | python3 -m json.tool
```

The combined output collapses the hypothesis space in one shot:

- `jobCount === undefined` or eval errors → script never ran → cache (#3 above), parse error, or boot crash.
- `jobCount: 0, conn: 'live'`, and `/jobs/status` shows the probe → DOM/render bug (filter or exception).
- `jobCount: 0, conn: 'offline'`, polling alive → Socket.IO down, polling fine.
- `/jobs/status?filter=all` returns `[]` but `/jobs` returns the probe → System 1/System 2 split confirmed (#2 above).
- Probe present in both endpoints AND `jobCount > 0` AND HUD still blank → render exception (Claude hypothesis #6) or visibility bug.

Both perspectives agree this is the right first move; Mike to execute (or not).
