# Work Log

Append-only. Each session adds entries at the top.

---

## 2026-04-12

### Dispatch Session (Opus)
- **INTOO audit:** Completed LLM readiness audit of intoo.com + 4 competitors. Delivered report. Drafted email to Mira in Gmail.
- **Okta:** Diagnosed shadow DOM blocker. Launched fire-and-forget code task for shadow DOM support (querySelectorAllDeep, data-se targeting, target resolution updates).
- **Satire sites:** Built and deployed 5 satirical websites to Netlify (botanical indecency bureau, naked truth garden, pollen is not consent, flower rated, the honey truth).
- **Research:** Compiled "Next-Token Prediction, World Models, and Theory of Mind" research document with sources. Reviewed Nous Research hermes-agent-self-evolution and Trampoline AI predict-rlm repos.
- **Yeshie sidebar:** Changed chat input from single-line text to textarea, Enter sends / Shift+Enter for newlines.
- **YeshID auth:** Identified why Google account chooser fails (PRE_CLICK_GOOGLE_ACCOUNT selectors may be stale). All payloads already have mw@mike-wolf.com configured.
- **Infrastructure:** Created PROJECTS.md dashboard and WORK-LOG.md. Planning tab minder scheduled task.
- **Eric Kohner:** Saved context about leadership coach introduction from Mira.

## 2026-04-12 (Dispatch, continued)
- Diagnosed root cause of every auth flow failure: `chrome.scripting.executeScript` blocked on `accounts.google.com`
- Confirmed via conversation logs: auth has never succeeded through Yeshie alone (always manual or Chrome MCP)
- Added CDP fallback to `execInTab` via `chrome.debugger` + `Runtime.evaluate` (background.ts)
- Added `logToRelay()` with 7 instrumentation points in `waitForAuth` (background.ts)
- Added `/log` endpoint to relay for auth flow observability (relay/index.js)
- Added "Pre-Processing: Auth State Check" to base-listener.md (login-first before asking params)
- Added auth state indicators to app.yeshid.com.md site context
- Added API error exponential backoff to yeshie-listen.sh (2s→120s cap)
- Shadow DOM support landed (from earlier code task): `_shadowQSA`/`_shadowQS` in PRE_RESOLVE_TARGET + PRE_FIND_BY_LABEL, data-se support for Okta
- Discovered hot-reload gap: watcher increments build but extension service worker may not reload
- **Pending:** Need manual extension reload in chrome://extensions to test CDP fallback
- **Pending:** Stress test login flow once extension reloaded
