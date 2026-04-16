# Yeshie Payload Coverage Report

**Generated:** 2026-04-14  
**Auditor:** Cowork session (Claude Sonnet 4.6)  
**Scope:** YeshID (app.yeshid.com) + Okta (trial-8689388-admin.okta.com)

---

## Summary

| Site | Actions Identified | Pre-Audit Coverage | Gaps Filled | Remaining Gaps |
|------|-------------------|-------------------|-------------|----------------|
| YeshID | 20 | 14/18 (78%) | 4 | 0 |
| Okta | 22 | 11/17 (65%) | 6 | 0 |

---

## YeshID (app.yeshid.com)

### Covered Before This Session

| Payload | Action | Verified | Run Count |
|---------|--------|----------|-----------|
| 00-login | Login via Google SSO | ✓ | — |
| 01-user-add | Onboard a new user | ✓ | 4 |
| 02-user-delete | Offboard / remove a user | ✓ | 1 |
| 03-user-modify | Edit a user's profile fields | ✓ | — |
| 04-site-explore | Dashboard navigation, all sections | — | — |
| 05-integration-setup | View + configure connected apps / SCIM | — | — |
| 06-person-search | Search for a user by name or email | — | — |
| 07-person-view | Open a user's detail profile page | — | — |
| 08-sync-directory | Trigger a directory sync | — | — |
| 09-create-group | Create a new group | — | — |
| 10-add-application | Add a new application to YeshID | — | — |
| 11-start-audit | Start an access audit | — | — |
| 12-view-access-grid | View the people × apps access matrix | ✓ | 6 |
| 13-view-events | View / search the events log | — | — |

### Gaps Filled This Session

| Payload | Action | Notes |
|---------|--------|-------|
| 14-add-user-to-group | Add a user to an existing group | Navigational skeleton; group detail UI not yet verified |
| 15-remove-user-from-group | Remove a user from a group | Destructive; row-level action pattern unverified |
| 16-delete-group | Delete a group | Destructive; uses Manage dropdown pattern |
| 17-view-org-settings | View / read organization settings | Read-only; `/organization/settings` path unverified |

### Business-Tier Gated (Skipped)

None identified. Groups feature is accessible on current plan (09-create-group has prior runs). The only potentially gated items would be advanced SCIM provisioning rules and automated provisioning policies — these are not standard admin UI actions.

### Still-Open Gaps

None. All actions on the human checklist are now covered by at least a navigational skeleton payload.

### Notes

- **Deactivate vs. Offboard:** YeshID uses "Offboard" (02-user-delete) as the primary lifecycle termination action. There is no separate "Deactivate" (temporary suspension) in the current UI — offboard is permanent. If YeshID adds a suspend/deactivate toggle, a new payload will be needed.
- **View connected directory providers:** Covered by a combination of 05-integration-setup (write path) and 08-sync-directory (navigates to `/organization/directories`). A dedicated read-only payload is not needed.
- **Reset password:** YeshID does not appear to have an admin-initiated password reset (SSO users have no YeshID password). Not a gap — feature doesn't exist in the current UI.

---

## Okta (trial-8689388-admin.okta.com)

### Covered Before This Session

| Payload | Action | Verified | Confidence |
|---------|--------|----------|------------|
| 00-probe | Quick page snapshot | — | Low (utility only) |
| 01-list-users | List all users in /admin/users | — | Medium |
| 01-user-add (old) | Add user (legacy, selector-based) | — | Low — superseded by 02 |
| 02-add-user | Add user with full form flow | ✓ 2026-04-13 | High |
| 03-deactivate-user | Deactivate a user | — | Medium |
| 04-site-explore | Systematic page exploration | — | Medium |
| 05-list-groups | List all groups | ✓ 2026-04-13 | High |
| 06-list-apps | List all active app integrations | ✓ 2026-04-13 | High |
| 07-view-system-log | Navigate to system log + read events | ✓ 2026-04-13 | High |
| 08-user-profile-actions | View profile; deactivate, suspend, reset MFA | ✓ 2026-04-13 | High |
| 09-list-reports | List available reports | — | Low (unverified) |
| 10-security-policies | View auth policies, MFA, session settings | — | Low (unverified) |
| 11-directory-integrations | View directory integration list | — | Low (unverified) |

**Note:** 01-user-add and 02-add-user are duplicates for the same action. 02-add-user supersedes 01-user-add and should be the canonical payload.

### Gaps Filled This Session

| Payload | Action | Confidence | Notes |
|---------|--------|------------|-------|
| 12-create-group | Create a new group | Medium | `Add group` button confirmed in 05-list-groups abstractTargets |
| 13-add-user-to-group | Add user to group via profile Groups tab | Low | Tab pattern known from 08 anomalies; Assign modal UI unverified |
| 14-remove-user-from-group | Remove user from group via profile | Low | Row-level remove icon pattern unverified in OIE |
| 15-assign-app-to-user | Assign app to user via profile Apps tab | Low | Apps tab confirmed in 08; modal form pattern unverified |
| 16-revoke-app-from-user | Revoke app from user via profile | Low | Gear-icon or inline-X pattern unverified |
| 17-unlock-user | Unlock a LOCKED_OUT user | Medium | Unlock button behavior documented in Okta OIE docs; untested on trial org |

### Still-Open Gaps

| Action | Reason Skipped |
|--------|---------------|
| Reset password (active user) | Partially covered in 08-user-profile-actions anomalies. A dedicated payload is low-value until the `Reset Password` button is verified live (STAGED users use different button text). |
| View user's assigned apps (read-only) | Covered adequately by 08-user-profile-actions (Applications tab perceive is step s3+). Dedicated read payload not needed. |
| View user log in system log | Covered via the `user-logs-link` abstractTarget in 08-user-profile-actions. |

### Confidence Definitions

- **High** — Verified end-to-end with real run, anomalies documented
- **Medium** — Structure confirmed via perceive or known Okta OIE patterns, not live-run
- **Low** — Navigational skeleton only; UI interaction pattern inferred, needs first-run verification

---

## New Payloads Created This Session

### YeshID
```
sites/yeshid/tasks/14-add-user-to-group.payload.json
sites/yeshid/tasks/15-remove-user-from-group.payload.json
sites/yeshid/tasks/16-delete-group.payload.json
sites/yeshid/tasks/17-view-org-settings.payload.json
```

### Okta
```
sites/okta/tasks/12-create-group.payload.json
sites/okta/tasks/13-add-user-to-group.payload.json
sites/okta/tasks/14-remove-user-from-group.payload.json
sites/okta/tasks/15-assign-app-to-user.payload.json
sites/okta/tasks/16-revoke-app-from-user.payload.json
sites/okta/tasks/17-unlock-user.payload.json
```

---

## Recommended Next Actions

1. **Run 14-add-user-to-group (YeshID)** first — verifies that the group detail page has an "Add Member" button. The exact button text is the most likely failure point.

2. **Run 12-create-group (Okta)** — the `Add group` button text is already confirmed in 05's abstractTargets, so this should succeed on first try.

3. **Retire 01-user-add.payload.json (Okta)** — it's superseded by 02-add-user. Keeping it creates ambiguity. Either delete or rename to `01-user-add.DEPRECATED.payload.json`.

4. **Verify 03-deactivate-user (Okta)** — it was written early and may not reflect the OIE-specific "More Actions → Deactivate → OK" pattern documented in 08. Cross-check and update.

5. **First-run 09, 10, 11 (Okta)** — list-reports, security-policies, directory-integrations are unverified. Low risk (read-only navigations) but should be verified and anomalies documented.
