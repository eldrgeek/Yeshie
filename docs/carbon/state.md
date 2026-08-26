---
audience: carbon
document: state
sync_version: 3
last_updated: 2026-08-26
repo: yeshie
authorship_update: "Mike Wolf (human-gate doctrine), OpenAI Codex (2026-07-27 Pulse action bridge), 2026-08-26 runtime-docs alignment"
---

# Current State

A snapshot of what's working, what's in progress, and what's next. Updated: August 26, 2026.

The live runtime is the Chrome MV3 extension plus the local relay at `http://127.0.0.1:3333`, driven by recipes at `sites/<domain>/tasks/*.payload.json`. `PLAN.md` is historical. Claude-in-Chrome is discovery-only. There are **35 site directories and ~220 recipes**. `google-admin` and `okta` already have payloads — there is no "extend to a second site" gap.

---

## What's Working Well

**The test suite is solid.** 176 unit tests pass across 15 suites. The tests cover target resolution, step execution, the self-improvement script, the relay chat system, auth flow logic, the progress overlay, the side panel, and more. Running `npm test` should be green.

**Four YeshID tasks are validated end-to-end.** These have been run against a real YeshID instance and confirmed working:

| Task | What it does | Time |
|------|-------------|------|
| `01-user-add` | Creates a new person in YeshID (18 steps) | ~8 seconds |
| `02-user-delete` | Offboards (removes) a person (18 steps) | ~7.7 seconds |
| `03-user-modify` | Changes first name, last name, or email (14 steps) | ~8.4 seconds |
| `04-site-explore` | Maps all pages, buttons, and forms on the site | ~30 seconds |

**The recipe corpus is multi-site.** Recipes live at `sites/<domain>/tasks/*.payload.json`. `github.com` is the largest set. `extract_text` is a real action type. Long jobs go through `POST /run/async` and `GET /run/result/:id`.

**The core architecture problems are solved.** Two issues that made earlier approaches fail are now fixed:
- Page navigation used to kill automation mid-task. The background worker approach means navigations are invisible to the chain executor.
- YeshID's Content Security Policy blocks JavaScript eval. Pre-bundled functions via `chrome.scripting.executeScript` bypass this entirely.

**Pulse human approval is wired.** Trusted local workflows can call the
authenticated `/teach/start` endpoint to make Yeshie open its teaching overlay
on an exact HTTPS-tab control. Six focused tests pass, and the running relay
plus extension completed a live disposable-tab smoke test. This path
highlights and observes only; it never clicks an approval control.

---

## What's Pending

**Auth flow recovery hasn't been tested against a real expired session.** `waitForAuth` and `PRE_CLICK_GOOGLE_ACCOUNT` exist. Unit tests pass. The full end-to-end scenario (chain starts, session expires mid-run, extension re-authenticates automatically, chain resumes) has not been run against a live expired session.

**The side-panel listener reports offline.** `GET /chat/status` still shows `listenerConnected: false` unless a listener is actively polling. The side panel then gets `no_listener` ("Yeshie is offline").

**`improve.js` is not wired into `/run`.** The script works, but a successful `POST /run` does not invoke it. Someone still has to run `node improve.js <payload> <chain-result>` by hand after a green chain.

**Streaming UIs need an engine-level `state.stable` wait.** Chat recipes (DeepSeek and similar) have no reliable DOM completion selector. Detection degrades to "wait then read," which truncates long generations. The fix belongs in `step-executor.ts`, not in per-site selectors.

**`05-integration-setup` hasn't been run yet.** This payload sets up a SCIM integration in YeshID. Before running it, there's a `preRunChecklist` that requires researching SCIM documentation specific to the integration target. Nobody has done that research yet.

**Build artifact cleanup.** The `.gitignore` now correctly excludes generated files (built extension, node_modules, etc.), but the repo still has some of these files already tracked from before the ignore rules were added. Cleaning them out requires an intentional removal pass.

---

## Key Technical Lessons Learned

These are things that weren't obvious at the start and took time to discover:

- **YeshID's labels use sibling `div.mb-2` elements**, not the Vuetify-standard `.v-label` inside `.v-input`. Discovering this was the key to making form field resolution reliable.
- **The edit form uses a table-row pattern** (`<td>First name</td><td><input></td>`), different from the list form. Two different resolution patterns are needed for the same app.
- **Generated IDs change per session.** `input-v-10` is a different input every page load. Using `input-v-10` as a selector is a ticking time bomb. Always resolve by semantic label.
- **`wait_for` was broken** — it was polling `querySelector` directly without resolving abstract target names first. This meant `wait_for` steps on named targets would fail silently. Fixed.
- **The "Confirm" vs "Save" issue.** YeshID's save button says "Confirm." Took a failed run to discover. Now the payload uses `name_contains` patterns that include both.

---

## How to Check Project Health

```bash
# Unit tests — should be 176/176 green
npm test

# Relay health — should show extensionConnected: true
curl -s http://127.0.0.1:3333/status

# Try a live task (quick smoke test)
# Run 03-user-modify via yeshie_run or curl (see quickstart.md)
```
