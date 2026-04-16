# Yeshie Agent Retrospective — 2026-04-14

**Sessions analyzed:** 9 (7 Cowork dispatch + 2 Claude Code worktree)  
**Period covered:** 2026-04-12 through 2026-04-14  
**Analyst:** Claude (Cowork mode), cross-referencing audit.jsonl transcripts, patterns.md, MEMORY.md, SESSION-REPORT-20260414.md

---

## 1. Failure Taxonomy

### 1.1 Stale Build / Extension State Confusion

The most consistently disruptive failure class. After any source code change, the extension in Chrome may still be running the old build — but no error is raised. The failure mode is silent: the executor falls through to `'unsupported'` for every action type and returns an "unsupported action" result as if it succeeded.

**Evidence — local_b335cdfe (Okta + YeshID hardening):**  
Agent injected payloads to YeshID tab after a code change. Every step returned `'unsupported'`. Agent spent multiple turns reading relay source code before diagnosing: "Root cause is clear: `executeStep` falls through to `'unsupported'` for all action types — classic sign that the built `background.js` in Chrome is stale." The fix was a manual extension reload.

**Evidence — local_8008755c (stress test):**  
Build completed fine (322ms), then relay showed no `extension registered` event. Agent had to fall back to computer-use to click the reload button in chrome://extensions — but the access dialog timed out, requiring Mike to reload manually.

**Pattern:** Build ≠ reload. The WXT watcher increments build number but `chrome.alarms` polling takes up to 3 seconds; after a fresh install of alarm code, one manual reload is required. No relay log entry = no reload = old code still running.

---

### 1.2 Tab Targeting and Queue Drift

**Evidence — local_9b832117 (Autonomous hardening):**  
When Okta admin session was lost, tab 1637807369 navigated away to `app.yeshid.com/overview`. Three queued Okta payloads (`list-groups`, `list-reports`, `list-security`) were still in the queue and fired against the now-YeshID tab. No error was raised — they just executed against the wrong site context. The session report notes: "Mike should be aware these may generate unexpected YeshID actions."

**Evidence — same session:**  
A new tab (1637807420) opened at `www.okta.com/` through an unclear mechanism mid-session, further muddying the tab inventory.

**Pattern:** tabIds are brittle cross-session references. Once a tab navigates away, any queued work targeting that ID will silently execute against the new context. There is no pre-flight check that validates tab URL against expected site before injection.

---

### 1.3 Relay API Discovery Overhead

Every Cowork dispatch session spent 10–20 tool calls rediscovering the relay's API surface. The relay has no `/routes` or `/help` endpoint. Agents tried: `/run` (returned 404 initially), `/status`, `/routes`, `/tabs`, `/tabs/list`, and read the full relay source to find valid endpoints.

**Evidence — local_8008755c:** Agent hit `GET /run` → 404 Not Found. Then read relay source (~100 lines) to find `POST /chat/inject`. Then discovered `/chat/logs` is the polling endpoint.

**Evidence — local_b335cdfe:** `curl -s -X POST http://localhost:3333/chat/inject -d '{"message":"..."}'` → `{"error":"tabId and message are required"}` — no default tab routing.

**Evidence — local_9b832117:** `curl -s -X POST http://localhost:3333/run -d '{"test":true}'` → `{"error":"Cannot read properties of undefined (reading 'chain')"}` — wrong payload structure for `/run` endpoint.

**Pattern:** Every session re-learns the API from scratch. AGENTS.md has a relay reference section, but it's not consistently read at session start.

---

### 1.4 Selector and Payload Bugs

**`:has-text()` crash — zealous-nightingale CC session:**  
Teach mode selectors like `button:has-text('Add new user'), button:has-text('Add person')` are Playwright/Cypress syntax. `document.querySelector()` throws `SyntaxError: not a valid selector`. This crashed the overlay silently whenever the step system tried to highlight the element. Fixed by adding a `resolveSelector()` helper that strips `:has-text()` and falls back to text-based element search.

**Vue reactivity — local_8008755c:**  
`06-person-search.payload.json` originally typed into the search input and expected Vue to filter reactively. The `_valueTracker` bypass was missing, so Vue saw no state change and the table didn't filter. Fixed by reading all rows and filtering client-side instead.

**SSO click — romantic-brahmagupta CC session:**  
`element.click()` via `chrome.scripting.executeScript` does not produce `isTrusted: true` events. Google OAuth handlers require trusted events, so the click appeared to succeed (`{clicked: true}` in logs) but the redirect never happened. Fixed with `trustedClick()` via `chrome.debugger Input.dispatchMouseEvent`.

**`assess_state` exit_with_error — wonderful-mccarthy CC session:**  
When `onMismatch: "exit_with_error:not-authenticated"` fired, the mismatch handler only recognized `branch:` prefixes. The `exit_with_error:` prefix was silently ignored — the handler found no matching branch, ran 0 steps, and let the chain continue as if it succeeded. This was a silent chain continuation on auth failure, the worst possible behavior.

---

### 1.5 SPA Navigation Failures

**Teach mode dropoff — local_4e346cb0 + zealous-nightingale:**  
Two separate bugs conspired to silence teach mode after step 1:

1. `chrome.tabs.onUpdated` fired when the user clicked a Vue router link. The handler read the step index from session storage before `teach_step_complete` had landed, got `0` (stale), and sent `teach_start` from step 0 — resetting the tooltip invisibly back to step 1.

2. The Next button in the tooltip was not calling `stepCompleteCallback`, so the background's step counter never advanced regardless of what the user clicked.

**YeshID Settings route — local_9b832117:**  
`/organization/settings` silently failed (SPA route not recognized). Correct path is `/manage/settings`. Both click-through on the sidebar tab and direct navigation failed — the page stayed on `/organization/people`. No 404 was returned, just no navigation.

---

### 1.6 Authentication Session Failures

**Google Admin session expired — local_9b832117:**  
Mid-session, Google Admin redirected to a security challenge (`accounts.google.com/v3/signin/challenge/pwd`). Yeshie reported "Too many failed attempts." All Google Admin work halted. No Hermes channel was configured, so there was no way to notify Mike in real-time.

**Okta admin subdomain confusion — local_b335cdfe + local_9b832117:**  
`trial-8689388.okta.com` (user app) and `trial-8689388-admin.okta.com` (admin console) require completely separate authentication. Navigating from the user app to the admin console triggered a new OAuth flow. Sessions that started on the user-app domain were blocked from admin operations. This was rediscovered twice across sessions.

**Okta session lost silently — local_9b832117:**  
Tab 1637807369 navigated from Okta admin to `app.yeshid.com/overview` for unknown reasons. A new tab opened at `www.okta.com/`. This was only discovered during tab inventory — no error was raised by any monitoring.

---

### 1.7 Fire-and-Forget / CC Delegation Flag Errors

**Evidence — local_4e346cb0:**  
Three successive CC delegation failures due to wrong CLI flags:

- `--input-format json` → "argument 'json' is invalid. Allowed choices are text, stream-json"
- `--output-format stream-json` (without `--verbose`) → "Error: When using --print, --output-format=stream-json requires --verbose"

Each failure required re-reading CLAUDE.md to check the flag syntax, rewriting the shell script, and relaunching. The correct invocation (`--output-format stream-json --verbose -p`) was only reached on the third attempt.

---

### 1.8 Cross-Session Path Errors

**Evidence — local_560a67bd (Morning session summary):**  
The task specified writing to `/sessions/gallant-intelligent-ramanujan/mnt/outputs/morning_session_2026-04-13.md`. The agent correctly identified this was inaccessible from its session and wrote to its own outputs folder instead — but only after attempting the path. The saved file ended up in an unexpected location that required user lookup.

---

## 2. Near-Misses & Silent Failures

These are the highest-risk cases: the agent believed it succeeded but hadn't.

### 2.1 `assess_state` Silent No-Op on Auth Failure

**Session:** wonderful-mccarthy CC  
**What happened:** When a payload chain detected an unauthenticated state and set `onMismatch: "exit_with_error:not-authenticated"`, the mismatch handler didn't recognize the `exit_with_error:` prefix. It searched for a branch named `exit_with_error:not-authenticated`, found none, ran 0 branch steps, and returned `{success: true}`. The chain continued executing subsequent steps against a logged-out page.  
**Why dangerous:** Any payload relying on auth-state gating could run against unauthenticated UI, produce garbage results reported as successes, and make destructive writes to wrong accounts if the form happened to be partially pre-filled.

### 2.2 Stale Extension Executing Old Code

**Session:** local_b335cdfe  
**What happened:** A code change was built, the watcher confirmed the build number incremented, and the agent proceeded to test. But the extension hadn't reloaded. Every action returned `'unsupported'`. The agent spent ~15 minutes diagnosing before recognizing the pattern.  
**Why dangerous:** Any payload "run" against stale extension silently no-ops every step. If the last step happens to read (and the DOM hasn't changed), the result looks valid.

### 2.3 Empty Read Reported as Chain Completion

**Session:** local_b335cdfe  
**What happened:** Okta `01-list-users` ran successfully. The read step returned empty (MUI rendering timing). Agent noted: "the `read` returned empty (MUI rendering timing), but the navigate and chain completed." Session scored as "PASS."  
**Why dangerous:** An empty read is not a pass. Data-dependent operations (coverage audits, user lookups, state checks) can silently return no data while the chain reports success.

### 2.4 Queued Messages Firing Against Wrong Tab

**Session:** local_9b832117  
**What happened:** Three Okta payloads were queued and dispatched while the Okta tab was valid. When the session was lost, the tab navigated to YeshID. All three payloads executed against the YeshID context with no error. The session report flagged it, but no runtime check caught it.  
**Why dangerous:** These payloads could have triggered unexpected writes to YeshID (e.g., if a navigate or click action matched a YeshID element by accident).

### 2.5 Teach Mode Step 1 Working → False Confidence

**Session:** local_6f88bce0 + local_4e346cb0  
**What happened:** Teach mode showed the first tooltip correctly. Mike reported it "worked for step 1." The system reported `teach_steps` successfully returned 7 structured steps. But steps 2–7 never rendered due to the two bugs described in 1.5. The demo was declared a qualified success before the step-progression path was exercised.  
**Why dangerous:** Single-step validation of a multi-step flow masks all subsequent failure modes.

### 2.6 Second `yeshie_respond` Getting 404

**Session:** local_8008755c  
**What happened:** The listener calls `yeshie_respond` twice per task — once with an interim "working on it" and once with the final result. The relay's `pendingResponders` map was consumed by the first call. The second call got 404 and was dropped. The agent received no error — the task just never delivered its final result.  
**Why dangerous:** The session appeared to complete (the listener exited normally), but the orchestrator never received the actual outcome. Downstream decisions based on that task's result would have used no data.

---

## 3. What Worked Well

### 3.1 chatId-Based Log Polling

Once established, the pattern of injecting a message → getting `chatId` from `/chat/logs` → polling for `yeshie_response` with that chatId was reliable and gave clear pass/fail signals. The ms timestamp `since=` parameter worked correctly throughout.

### 3.2 Client-Side Filtering Workaround

The decision to read all table rows and filter in the listener (vs. relying on Vue reactive filtering) was correct and durable. It removed a dependency on framework internals and made `06-person-search` reliable.

### 3.3 Payload Skeleton Generation at Scale

The coverage audit session (local_478a4a3a) was efficient: 10 new payload skeletons created in a single session, organized across YeshID and Okta, with correct `_meta` fields and gap analysis documentation. No regressions.

### 3.4 SESSION-REPORT Format

The `SESSION-REPORT-20260414.md` format (tab triage table, per-system status sections, blocked items, payload file delta) gave a clean handoff record that captures what an autonomous session accomplished and what it left incomplete. This is the right pattern for long autonomous runs.

### 3.5 memory/patterns.md Accumulation

Hard-won discoveries (DeepSeek DOM structure, MCP timeout workarounds, React `_valueTracker` hack, notification architecture) are captured in `memory/patterns.md` and survived across sessions. This is the most valuable knowledge store in the project.

### 3.6 CROSS-SYSTEM-TOPOLOGY.md

The topology discovery (YeshID uses Google as IdP; Okta admin is a separate subdomain; YeshID groups route to Okta) was correctly documented in a dedicated file rather than left in a session report. This prevented re-discovery in subsequent sessions.

### 3.7 Fire-and-Forget + Notification Pattern

Once the CC flag syntax was corrected, the fire-and-forget pattern (nohup + osascript notification or relay `/notify`) was sound. Two CC tasks ran in parallel without blocking the Cowork session. The relay's `notifyHost()` function correctly sent macOS notifications on completion.

---

## 4. Root Cause Patterns

### RCP-1: Assume Success Without Verification

The most pervasive root cause. Manifests as: click executed = action taken, chain completed = task done, build number changed = extension running new code, empty read = inconclusive silence rather than a failure signal. Present in sessions local_8008755c, local_b335cdfe, local_9b832117, wonderful-mccarthy.

### RCP-2: No Pre-Flight Tab Validation

Payloads are dispatched to a tabId without verifying the tab's current URL matches the expected site. When a tab navigates (session loss, user action, SPA router), subsequent injections silently hit the wrong context. The relay has no mechanism to reject a payload dispatched to a tab at the wrong URL.

### RCP-3: Fire-and-Forget With No Feedback Loop

Tasks dispatched via queue or fire-and-forget have no guaranteed return path. If the listener drops the response, if the tab navigates mid-chain, or if the second `yeshie_respond` gets a 404, the orchestrator receives nothing — not an error, just silence. The orchestrator has no way to distinguish "task completed silently" from "task never delivered."

### RCP-4: Session Knowledge Not Persisted Between Sessions

The relay API surface, Okta subdomain distinction, YeshID settings route, and CC flag syntax were all re-learned multiple times. The MEMORY.md captures broad patterns but not the specific operational facts needed at session start (e.g., "Okta admin is always `trial-8689388-admin.okta.com`, not the main domain").

### RCP-5: Stale Build Is Indistinguishable from Working Build

When extension runs old code, `executeStep` silently returns `'unsupported'` rather than a diagnostic error. There is no "build fingerprint" check in the chain executor that would say "running build 270, expected 276."

### RCP-6: SPA Navigation Race Conditions

`chrome.tabs.onUpdated` fires before in-flight async state mutations complete. Any handler that reads state synchronously from session storage immediately after a navigation event will read stale data. This pattern was the root cause of both teach mode bugs and likely affects other event-driven state reads.

### RCP-7: Notification Path Gaps in Autonomous Sessions

Long autonomous sessions (Mike exercising for 45 min) have no real-time escalation path when blocked conditions arise. The session report captures what happened but cannot interrupt the session in real time. Hermes channels were empty in both autonomous sessions reviewed.

---

## 5. Process Hardening Recommendations

### Relay and Extension

**R-01.** Before any payload run, call `curl -s http://localhost:3333/status` and assert `extensionConnected: true` and `pending: 0`. Never proceed if `extensionConnected: false`.

**R-02.** After any code change + build, verify that a new `extension registered` event appears in relay logs (grep for `extension registered` in the relay log output) before running any test. Build number increment alone does not guarantee reload.

**R-03.** Read `docs/silicon/reference.md` (relay API section) at the start of any session that uses `/chat/inject` or `/run`. Do not re-derive endpoint signatures from relay source code.

### Tab Management

**R-04.** Before dispatching any payload to a tabId, fetch the tab's current URL via `curl -s http://localhost:3333/tabs` (or equivalent) and assert it matches the expected site domain. Never assume a tabId from a previous session is still pointing at the right page.

**R-05.** Before allowing a tab to navigate to a new context (session loss, user action), drain or cancel all pending queue messages targeting that tabId. Log a warning for each message killed.

**R-06.** Treat any tabId from a previous Cowork session as unverified until confirmed in the current session. Rediscover live tabIds at session start.

### Verification

**R-07.** After any form submission, always wait for and check a confirmation signal (snackbar `.v-snackbar`, URL change, success banner) OR an error signal (error text, validation message) before reporting success. An empty DOM mutation window is not a pass — it's inconclusive.

**R-08.** After any read action, treat an empty result as inconclusive (not a pass) unless the payload explicitly expects zero results. Retry with a wait if needed.

**R-09.** When running a multi-step teach or walkthrough flow, validate step 2 transitions before declaring step 1 a success.

### Autonomous Sessions

**R-10.** Before any autonomous session where Mike will be away, verify `hermes channels_list` has at least one active channel. If no channel is configured, note "NO NOTIFICATION PATH" prominently at the top of the session plan, and add a rule: stop all work on any blocked system immediately, do not attempt self-recovery on auth failures.

**R-11.** When an auth session expires (any system), immediately clear all queued messages targeting that system's tabId. Do not let queued work fire against the post-expiry tab state.

**R-12.** Okta requires navigating directly to `trial-8689388-admin.okta.com` at session start — never navigate there from the user-app domain (`trial-8689388.okta.com`). Record this as a site-specific rule in the Okta `site.model.json`.

### Claude Code Delegation

**R-13.** When launching CC via fire-and-forget shell script, use exactly: `claude --output-format stream-json --verbose -p "$(cat task.md)"`. Never use `--input-format` (not a valid flag). Never use `--output-format stream-json` without `--verbose`.

**R-14.** After spawning a fire-and-forget CC job, wait at least 5 seconds before checking the log file. The process needs time to start and write its first line.

### Selectors and Payloads

**R-15.** Never use `:has-text()`, `:contains()`, or other Playwright/Cypress pseudo-selectors in `targetSelector` fields. These are not valid CSS and will crash `document.querySelector`. Use the `resolveSelector()` helper or native attribute selectors.

**R-16.** When `onMismatch: "exit_with_error:..."` is specified in an `assess_state` step, the mismatch handler must explicitly halt the chain and return a failed ChainResult. Never let an unrecognized `onMismatch` prefix silently continue.

### Cross-Session Operations

**R-17.** Never hardcode a session-specific path (e.g., `/sessions/gallant-intelligent-ramanujan/mnt/...`) in a task description for a different session. Use the outputs directory of the current session, or use a stable shared path like `~/Projects/yeshie/` for persistent artifacts.

---

## 6. Memory Candidates

Checking against existing MEMORY.md entries (`agent/memory/MEMORY.md`). The following rules from Section 5 are not yet covered by existing memory:

| Rule | Proposed memory entry | Current coverage |
|------|----------------------|-----------------|
| R-01 | `relay_preflight_check.md` — always assert `extensionConnected: true` before payload run | Not covered (hot-reload entry covers reload, not pre-flight) |
| R-02 | `build_verify_before_test.md` — grep relay logs for 'extension registered' after any build | `feedback_hotreload_gap.md` covers reload mechanism but not this verification step |
| R-04 | `tab_url_validation.md` — always validate tab URL matches expected site before injection | Not covered |
| R-05 | `queue_drain_on_tab_nav.md` — drain pending queue messages before tab navigates | Not covered |
| R-07 | Already partially in `feedback_verify_outcomes.md` | **Already covered** — update with empty-read guidance |
| R-10 | `autonomous_session_prereq.md` — verify Hermes channel before unattended session | Not covered |
| R-11 | Combine with Okta session rules in `project_okta_rules.md` | Not covered (Okta subdomain noted in roadmap but not as a hard operational rule) |
| R-12 | `project_okta_rules.md` — always start at admin subdomain, not user-app domain | Not covered as explicit rule |
| R-13 | `cc_fire_and_forget_flags.md` — correct CC CLI invocation with stream-json + verbose | Not covered (patterns.md has the notification architecture but not flag syntax) |
| R-15 | Add to `patterns.md` → Selector syntax section — no `:has-text()` in targetSelector | Not covered |
| R-16 | `assess_state_exit_contract.md` — exit_with_error must halt chain; unknown prefix = error | Not covered |
| R-17 | `cross_session_paths.md` — never hardcode session paths from other sessions | Not covered |

### Priority additions (do these first):

1. **`relay_preflight_check.md`** — This is the highest-ROI memory entry. Catches the stale extension class of failure at session start.

2. **`cc_fire_and_forget_flags.md`** — The `--input-format json` / `--verbose` failures cost real debugging time in two sessions. One memory entry eliminates all future occurrences.

3. **`tab_url_validation.md`** — Pre-flight tab URL check prevents the most dangerous silent failures (queue firing against wrong tab).

4. **`assess_state_exit_contract.md`** — The silent chain continuation on auth failure is a correctness bug, not just a process gap. This needs to be in code *and* in memory.

5. **`autonomous_session_prereq.md`** — Required before any future autonomous run.

---

*Report generated 2026-04-14 from audit.jsonl transcripts of 9 agent sessions.*  
*Cross-referenced: `memory/patterns.md`, `MEMORY.md` (agent/memory), `SESSION-REPORT-20260414.md`, CC worktree sessions (jolly-panini, zealous-nightingale, wonderful-mccarthy, romantic-brahmagupta).*
