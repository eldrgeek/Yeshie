---
audience: carbon
document: state
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Current State

A snapshot of what's working, what's in progress, and what's next. Updated: April 4, 2026.

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

**The core architecture problems are solved.** Two issues that made earlier approaches fail are now fixed:
- Page navigation used to kill automation mid-task. The background worker approach means navigations are invisible to the chain executor.
- YeshID's Content Security Policy blocks JavaScript eval. Pre-bundled functions via `chrome.scripting.executeScript` bypass this entirely.

---

## What's Pending

**`05-integration-setup` hasn't been run yet.** This payload sets up a SCIM integration in YeshID. Before running it, there's a `preRunChecklist` that requires researching SCIM documentation specific to the integration target. Nobody has done that research yet.

**Auth flow recovery hasn't been tested against a real expired session.** The code exists — `waitForAuth`, `PRE_CHECK_AUTH`, mid-chain `auth_required` recovery, automatic Google account selection. Unit tests pass. But the full end-to-end scenario (chain starts, session expires mid-run, extension re-authenticates automatically, chain resumes) hasn't been run against a live expired session. It may work perfectly. It may have edge cases. We don't know yet.

**The self-improvement script hasn't been run post-validation.** `improve.js` is ready and working, but nobody has run it after the successful payload runs to merge the resolved selectors back in. Doing so would make subsequent runs faster (direct cached selectors instead of exploratory resolution) and push the payloads closer to "production" mode.

**Build artifact cleanup.** The `.gitignore` now correctly excludes generated files (built extension, node_modules, etc.), but the repo still has some of these files already tracked from before the ignore rules were added. Cleaning them out requires an intentional removal pass.

**Extension to other sites.** There are site directories for `google-admin` and `okta`, but no validated payloads. The architecture is ready — the three-layer knowledge model works for any site. It just needs someone to write and validate payloads.

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
curl -s http://localhost:3333/status

# Try a live task (quick smoke test)
# Run 03-user-modify via yeshie_run or curl (see quickstart.md)
```
