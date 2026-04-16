# Yeshie — Action Items

| Priority | Item | Area | Notes |
|----------|------|------|-------|
| High | Test login flow end-to-end | Auth | `waitForAuth` + `PRE_CLICK_GOOGLE_ACCOUNT` implemented but not tested against a real expired session. Need full cycle: detect expiry → click SSO → select Google account → resume chain. |
| High | Validate `05-integration-setup` | Payloads | SCIM integration payload. Has `preRunChecklist` requiring SCIM docs research before running. |
| Medium | Self-improvement merge | HEAL | After successful runs, run `node ~/Projects/yeshie/improve.js sites/yeshid/tasks/<payload>.json /tmp/chain-result.json` to back-fill `cachedSelectors`. Promotes `learning` → `production` after 5 runs. |
| Medium | Expand config externalization | Config | Google account selection and relay/watcher endpoints now configurable. Remaining local assumptions should move behind env vars or extension settings as they surface. |
| Low | Repository hygiene | Git | Artifact files are already tracked in git. Ignore rules added but historical debt requires an intentional `git rm` pass. |
| Low | Extend to other sites | Architecture | 3-layer architecture works for any site: create `sites/{domain}/site.model.json`, add task payloads, optionally add `models/generic-{framework}.model.json` for non-Vuetify L2. |
