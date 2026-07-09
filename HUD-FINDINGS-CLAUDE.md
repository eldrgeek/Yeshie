# HUD Blank — First-Principles Hypothesis Ranking

Investigator: Claude (Opus 4.7), 2026-04-30
Scope: analysis only, no experiments run. Sourced strictly from `HUD-INVESTIGATION.md`.

## Framing

The gap to explain: relay returns `{"jobs":[],"ts":...}` on `/jobs/status?filter=all`, the WKWebView reports `loaded:true` at the right URL, yet the panel shows "No active jobs" / blank.

Critical observation up front: the brief shows `curl -s 'http://localhost:3333/jobs/status?filter=all'` returning **`{"jobs":[]}`** (empty array). The premise "relay returns jobs correctly" is not actually demonstrated in the data collected — at the moment of the snapshot, the relay had zero jobs to return, and `jobs-state.json` is `{}`. So "No active jobs" may be the literally correct render. Several hypotheses below split on whether the symptom is "blank/empty when there ARE jobs" vs. "blank when there are no jobs (working as designed, but feels broken)."

---

## Hypotheses, ranked by likelihood

### 1. The HUD is rendering correctly — there genuinely are no active jobs (highest likelihood given the captured data)

**Mechanism.** `pollJobs()` fetches `/jobs/status?filter=all`, gets `{jobs: []}`, populates the client-side Map (still empty), `render()` runs the active-filter at line 844–847, finds nothing, sets `innerHTML = '<div class="empty">No active jobs</div>'`. That is exactly what Mike sees.

**Supporting evidence.**
- `curl -s 'http://localhost:3333/jobs/status?filter=all'` → `{"jobs":[],"ts":...}` (section 2).
- `jobs-state.json` content is literally `{}` (section 1, "61 bytes content: `{}`" — note: 61 bytes is suspicious for `{}`, see hypothesis 2).
- Recent commit `f665c115 relay: persist job state across restarts` — implies state file replaced live `jobs` Map on relay restart.
- The relay restarted at 10:26 AM (PID 68684 start time); if `jobs-state.json` was empty at that moment, the in-memory Map is empty and stays empty until something posts a job.

**Experiments to confirm/deny.**
1. `curl -s -X POST http://localhost:3333/jobs/update -H 'Content-Type: application/json' -d '{"id":"probe-1","title":"Probe","status":"running"}' && sleep 6 && curl -s 'http://localhost:3333/jobs/status?filter=all'` — if the GET now returns the probe AND the HUD updates within 5s, the system is healthy and the original "blank" was accurate.
2. `cat /Users/mikewolf/Projects/yeshie/packages/relay/jobs-state.json | wc -c` and `od -c` — confirm whether the file is `{}` (2 bytes) or has 61 bytes of something else (whitespace? BOM? stale data?). The brief claims "61 (content: `{}`)" which is internally inconsistent.
3. `tail -200 /tmp/relay.log | grep -iE 'persist|load|state|jobs.size'` — see what the relay logged when it loaded state on startup.

---

### 2. `jobs-state.json` deserialization mismatch / stale persisted state masks live jobs

**Mechanism.** The new persistence code (commit `f665c115`) writes/reads `jobs-state.json`. If on startup it deserializes into a Map but the shape doesn't match what `render()`/`/jobs/status` expects (e.g., array vs object, missing `status` field, status values not in the active list at line 845), the in-memory Map could contain entries that are filtered out as inactive AND prevent fresh jobs from being added/updated correctly. The "61 bytes / content `{}`" inconsistency in the brief hints at a malformed file.

**Supporting evidence.**
- 61 bytes ≠ 2 bytes for `{}`. Either the brief is wrong about the content, or there's hidden content (whitespace, an array `[]` with formatting, an old shape).
- Most recent commit explicitly added persistence — exactly the kind of code path that breaks this way.
- Empty `/jobs/status` response is consistent with both "Map literally empty" and "Map populated but JSON serialization drops entries".

**Experiments.**
1. `od -c /Users/mikewolf/Projects/yeshie/packages/relay/jobs-state.json | head` — see actual bytes.
2. `grep -nE 'jobs-state|writeFile|readFile|JSON.parse|persist' /Users/mikewolf/Projects/yeshie/packages/relay/index.js` — locate the persistence code and inspect its serializer (Map → JSON requires `[...jobs.entries()]` or `Object.fromEntries`; a naive `JSON.stringify(map)` produces `{}`).
3. Inject a test job via `/jobs/update`, then `cat jobs-state.json` — verify round-trip.

---

### 3. Two-system split: writers post to `jobMap` (System 1) but the HUD only listens for System 2 events

**Mechanism.** Section 3 of the brief documents this directly: `broadcastHud()` emits `hud_update` from `jobMap`; `/jobs/update` and friends emit `job_update` from a separate `jobs` Map; the HUD HTML listens **only** for `job_update` and `jobs_snapshot` (and `jobs_snapshot` is never emitted). If `cc-dispatch` or whatever is creating jobs uses `/job/start` (System 1), nothing the HUD subscribes to ever fires, and `/jobs/status?filter=all` (which reads the System 2 Map) returns empty.

**Supporting evidence.**
- Brief explicitly calls out: "The client does NOT listen for `hud_update`."
- `jobs_snapshot` listener is dead code — nothing emits it.
- Two parallel data structures (`jobMap` vs `jobs`) is exactly the architecture that produces "API X says no jobs, API Y has jobs".

**Experiments.**
1. `curl -s http://localhost:3333/jobs` — returns System 1 (`jobMap`); compare to `/jobs/status?filter=all` (System 2). If `/jobs` has entries and `/jobs/status` does not, this hypothesis is confirmed.
2. `grep -rn 'job/start\|jobs/update\|jobs/create' ~/Projects/yeshie/scripts ~/Projects/cc-dispatch ~/Projects/mac-controller` — see which endpoint real writers use.
3. POST to `/job/start` with a probe and watch — if System 1 receives it but `/jobs/status` stays empty AND the HUD stays blank, this is the bug.

---

### 4. Socket.IO connection from WKWebView is failing; only the 5s HTTP poll keeps it alive — and the poll race-loses to a stale empty render

**Mechanism.** The HUD HTML at line 894 connects via `io({ transports: ['websocket', 'polling'] })`. WKWebView has well-known WebSocket quirks (especially with localhost over IPv4 vs IPv6 — note the relay listens on IPv6 `*:dec-notes` per lsof). If the WS handshake fails silently and polling transport also fails (CSP, mixed-content, or NSAppTransportSecurity), `socket.on('connect')` never fires and the initial fetch inside `connect` (line 898) never runs. The 5s `setInterval(pollJobs, 5000)` should still work over plain `fetch`, but if WKWebView's HTTP context for the page is broken (cookie partition, ATS), even that fails.

**Supporting evidence.**
- Relay is bound to IPv6 (`TCP *:dec-notes`); macOS apps sometimes resolve `localhost` to IPv4 only.
- `/wv-status` uses only native `webview.URL()` — never executes JS — so we have **zero** evidence the page's JS is running. `loaded:true` only means the navigation didn't fail; it does not mean scripts executed.
- `connEl.textContent = 'live'` only fires on socket connect. We have no readout of `conn` state.

**Experiments.**
1. Make `hud.py` actually call `evaluateJavaScript_completionHandler_` with the existing `js` string (lines 104–109) — confirm `jobs.size`, `conn` text, `location.href`. This is the single highest-leverage fix to the diagnostic surface.
2. `tail -f /tmp/relay.log` while restarting the HUD — count Socket.IO `connection` events. If only the Chrome extension and cc-bridge connect (i.e., 2 sockets, never a third from the WKWebView), the WV is not establishing a Socket.IO session.
3. `curl -sv 'http://[::1]:3333/hud' -o /dev/null` and `curl -sv 'http://127.0.0.1:3333/hud' -o /dev/null` — verify both stacks resolve.

---

### 5. WKWebView is showing a stale cached page from before the latest relay deploy

**Mechanism.** WKWebView with default `WKWebViewConfiguration` uses a default `WKWebsiteDataStore` that caches HTTP responses. If the HUD page was loaded before the recent commits (`f665c115`, `bd7b14a0`, `7ec07f97`, `db9bc042`) added the persistence + Copy Digest button + auto-show, an older HTML payload could be in cache, with older JS that, e.g., listens for events that no longer fire or hits routes that 404. `webview.URL()` would still report the same URL, `loaded:true` still holds.

**Supporting evidence.**
- HUD process started "Tue08PM" (PID 39216), relay restarted "10:26 AM". HUD never reloaded across the relay restart unless `/reload` was hit.
- `_reload()` calls `loadRequest_` but doesn't pass any cache policy override (no `NSURLRequestReloadIgnoringLocalCacheData`).
- The recently shipped feature set (Copy Digest, step display, persist) all live in the inlined HTML — if the WV is showing yesterday's HTML, none of that is there.

**Experiments.**
1. `curl -s -X POST http://localhost:3334/reload && sleep 1 && curl -s http://localhost:3334/wv-status` — then visually check the panel. Does the Copy Digest button (commit `7ec07f97`) appear in the header?
2. Add cache-busting to `_reload`: change `HUD_URL` to `http://localhost:3333/hud?v=<timestamp>` for one test load.
3. Patch `/wv-status` to evaluate `document.body.innerHTML.length` and `document.querySelector('.btn-copy')!=null` — if the button is missing, cache is stale.

---

### 6. `render()` is throwing on a malformed job, leaving `jobsEl.innerHTML` in its previous state (or empty)

**Mechanism.** The `render()` function does `j.status.replace(...)` (line 851) and `j.status.toUpperCase()` (line 877). If a job object is missing `status` (or `status` is null), `render()` throws synchronously inside the `.map(...)`, propagating out of `pollJobs()`'s `.then` and into the silent `.catch` (line 933) — which only updates `last-poll` to "poll ERR". No console output bubbles to Python stdout. The Map keeps growing with bad entries; every subsequent render also throws; the DOM never updates past the initial `<div class="empty">`.

**Supporting evidence.**
- The catch handler is silent except for the small `last-poll` text.
- Persistence code (commit `f665c115`) is a fresh source of possibly-malformed deserialized objects.
- `/wv-status` cannot see `last-poll` text because it doesn't run JS.

**Experiments.**
1. Add JS eval to `/wv-status` returning `document.getElementById('last-poll').textContent` — if it says "poll ERR", a render exception is happening.
2. Wrap the `.map` body in try/catch and log the offending job to a `window.__lastErr` global, then read it via JS eval.
3. POST a job with `status: null` and see if the HUD wedges.

---

### 7. CSP / mixed-content / WKWebView App Transport Security blocking Socket.IO or fetch

**Mechanism.** The relay's `/hud` response sets `Content-Type: text/html; charset=utf-8` only — no CSP header is shown in the brief, so unlikely to be CSP-imposed. But WKWebView under macOS enforces ATS by default for HTTPS-only; `http://localhost` is on the ATS exception list, so this is unlikely. However, if the panel was previously loaded with a different scheme or the socket.io client tries to upgrade to `ws://`, ATS could block the WS upgrade silently.

**Supporting evidence.** Weak — no direct evidence in the brief. Listed for completeness.

**Experiments.**
1. Add JS eval to check `navigator.onLine`, `typeof io`, `socket.connected`.
2. Inspect the Info.plist of the running Python process for `NSAppTransportSecurity` exceptions — `defaults read /opt/homebrew/Cellar/python@3.14/3.14.3_1/.../Info.plist`.

---

### 8. `jobs` Map collision with the inlined `<script>` — variable shadowing or scope bug

**Mechanism.** Brief notes: "the client-side `jobs` Map declared at line 748 inside the HTML `<script>` block — this is the client-side in-browser Map, not the server-side `jobs` variable at line 181". If the inlined template literal accidentally evaluates a server-side `${jobs}` somewhere, it could inject `[object Map]` text into the page or crash the script parse. Less likely given the page is 13442 bytes (consistent with template generating successfully).

**Experiments.**
1. `curl -s http://localhost:3333/hud > /tmp/hud.html && grep -n 'jobs' /tmp/hud.html | head -40` — look for any server-side leakage into the served HTML.
2. Open `/tmp/hud.html` in real Chrome; if it works there but not in WKWebView, the bug is WV-specific (rules out hypothesis 8, points to 4 or 5).

---

### 9. Panel is hidden / off-screen / behind something — "blank" is a visibility issue, not a render issue

**Mechanism.** `_show_panel()` sets `NSWindowCollectionBehaviorCanJoinAllSpaces | Stationary` and `NSStatusWindowLevel`. If the panel's frame is set to a zero-height rect or off-screen coordinates after a display change, "blank" could be Mike-can't-see-it rather than DOM-empty.

**Experiments.**
1. `screencapture -x /tmp/screen.png` and look for the HUD region.
2. Add JS eval returning `[innerWidth, innerHeight, document.body.scrollHeight]`.

---

## Single best next experiment

**Make `/wv-status` actually run JavaScript.** The diagnostic ceiling is set by hud.py line 110–121 not calling `evaluateJavaScript_completionHandler_`. The `js` string at line 104–109 already exists and returns exactly the fields needed to disambiguate hypotheses 1, 3, 4, 5, and 6 in one shot: `jobs.size`, `conn` text, `location.href`. Without this, every other experiment is indirect.

Concretely: edit `do_eval` in `hud.py` so that after capturing `URL()`/`isLoading()` it calls `webview.evaluateJavaScript_completionHandler_(js, handler)` and includes the returned JSON in the response body. Then:

```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.hud
curl -s http://localhost:3334/wv-status | python3 -m json.tool
```

The output immediately collapses the hypothesis space:

- `jobCount: -1` → `jobs` is `undefined` → script never ran (hypothesis 5 cache, or 4 socket setup blew up before declaring globals, or 8 parse error).
- `jobCount: 0, conn: 'live'` → page is healthy, jobs really are zero (hypothesis 1).
- `jobCount: 0, conn: 'offline'` → Socket.IO dead, polling ran but found nothing (hypothesis 1 + 4).
- `jobCount: >0` but panel shows "No active jobs" → render filter (line 844) is excluding them (hypothesis 6 or stale statuses from hypothesis 2).
- `location.href` mismatch → cache or wrong URL (hypothesis 5).

One ten-line patch, one curl, and the actual root cause becomes visible. Every other experiment proposed above should be gated behind this one.
