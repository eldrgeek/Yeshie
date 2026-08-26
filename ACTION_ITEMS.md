# Yeshie — Action Items

Yeshie is already multi-site (`sites/<domain>/tasks/*.payload.json`, ~35 dirs / ~220 recipes). Do not add a "second browser stack" or treat google-admin/okta as empty. CIC is discovery-only.

| Priority | Item | Area | Notes |
|----------|------|------|-------|
| High | Auth flow end-to-end | Auth | `waitForAuth` + `PRE_CLICK_GOOGLE_ACCOUNT` implemented but not E2E'd against a real expired session. Need full cycle: detect expiry → click SSO → select Google account → resume chain. |
| High | Listener `no_listener` | Chat | `GET /chat/status` `listenerConnected` is still false unless a listener is actively polling. Side panel then gets `{type: "no_listener"}`. |
| Medium | Wire `improve.js` into `/run` | HEAL | Script exists and works. A successful `POST /run` does **not** invoke it. Still a manual `node improve.js <payload> /tmp/chain-result.json` after a green chain. |
| Medium | Engine-level `state.stable` wait | Engine | Streaming UIs (DeepSeek etc.) have no reliable DOM completion selector. Detection degrades to wait-then-read and truncates long generations. Belongs in `step-executor.ts`, not per-site recipes. |
| Medium | Validate `05-integration-setup` | Payloads | SCIM integration payload. Has `preRunChecklist` requiring SCIM docs research before running. |
| Low | Repository hygiene | Git | Artifact files are already tracked in git. Ignore rules added but historical debt requires an intentional `git rm` pass. |
