# Yeshie — Action Items

Yeshie is already multi-site (`sites/<domain>/tasks/*.payload.json`, ~35 dirs / ~220 recipes). Do not add a "second browser stack" or treat google-admin/okta as empty. CIC is discovery-only.

Docs assume [#55](https://github.com/eldrgeek/Yeshie/pull/55) landed: `wait_for` (selector / text / `state.stable`) and `improve.js` auto-heal on `POST /run` + `/run/async`. Those are not pending.

## Pending

| Priority | Item | Area | Notes |
|----------|------|------|-------|
| High | Auth flow end-to-end | Auth | `waitForAuth` + `PRE_CLICK_GOOGLE_ACCOUNT` implemented but not E2E'd against a real expired session. Need full cycle: detect expiry → click SSO → select Google account → resume chain. |
| High | Listener `no_listener` | Chat | `GET /chat/status` `listenerConnected` is still false unless a listener is actively polling. Side panel then gets `{type: "no_listener"}`. |
| Medium | Extension flap | Relay | Partially addressed in #55: single-owner extension socket, reconnect backoff + `forceNew`, do not reclaim a server-kicked socket, `GET /status` now includes `lastDisconnectAt` + `buildVersion`. Not claimed fully done without live verification. |
| Medium | Validate `05-integration-setup` | Payloads | SCIM integration payload. Has `preRunChecklist` requiring SCIM docs research before running. |
| Low | Repository hygiene | Git | Artifact files are already tracked in git. Ignore rules added but historical debt requires an intentional `git rm` pass. |

## Landed in #55 (not pending)

| Item | Where | Notes |
|------|-------|-------|
| `wait_for` text / selector / `state.stable` | `src/wait-for.ts`, `src/step-executor.ts`, extension executor | Content fingerprint quiet for `quietMs` (default 800ms). `onTimeout: "continue"` honored. Prefer this over fixed `delay`. |
| `improve.js` auto-heal on `/run` | relay `POST /run` and `/run/async` | Runs only when `success && goalReached` and `_meta.selfImproving === true`. Skipped on failed runs. Hard-blocked for Rocket Money `01-list-all-recurring` and `02-list-inactive`. |
