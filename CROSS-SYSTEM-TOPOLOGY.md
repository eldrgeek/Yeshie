# Cross-System Directory Topology
_Discovered: 2026-04-13 | Yeshie session exploration_

---

## Summary

Three identity/directory systems are in play for the `embeddedsystemsresearch.org` environment. They are NOT currently integrated with each other. Yeshie has been tested against all three.

```
Google Workspace (admin.google.com)
  ↓ OAuth sync (discovered 2026-04-13)
YeshID (app.yeshid.com)          ←→  Okta (trial-8689388-admin.okta.com)
                                       [NO integration found]
```

---

## Systems

### 1. Google Workspace
- **URL:** `https://admin.google.com/ac/`
- **Org:** embeddedsystemsresearch.org
- **Org ID:** 352555445522
- **Users:** ~30 active (visible in `/ac/users`, paginated 20/page)
- **Groups:** 2 default groups
- **OUs:** 5 organizational units
- **SSO config:** None — `/ac/security/sso` shows "ADD OIDC PROFILE" / "ADD SAML PROFILE" with no existing profiles
- **Role:** Source of truth directory. Google Workspace is the canonical user store.

### 2. YeshID
- **URL:** `https://app.yeshid.com/`
- **People table:** Has `Directory synced` column — confirms directory sync is a core feature
- **Integration with Google:** CONFIRMED. Navigating to `/organization/settings` triggered:
  ```
  GET https://accounts.google.com/v3/signin/accountchooser
    ?client_id=456377342688-5np5k4br79q1pa431gec8a9lmp74e3og.apps.googleusercontent.com
    &redirect_uri=https://app.yeshid.com/api/v1/integrations/google/authorize/response
    &scope=userinfo.email userinfo.profile openid
  ```
  → YeshID syncs users FROM Google Workspace via OAuth.
- **Integration with Okta:** NOT FOUND. No Okta connector visible in `/organization/settings` (page redirected to Google OAuth before loading).
- **Session TTL:** ~30-40 minutes before `/login` redirect. Extension becomes unresponsive on login page.
- **Role:** Directory sync hub — aggregates Google users, manages app access (the `# of applications` column in people table).

### 3. Okta (trial org)
- **URL:** `https://trial-8689388-admin.okta.com/`
- **Subdomain:** `trial-8689388-admin` (note: `-admin` suffix required for admin console)
- **Users:** 7 original + 1 test = 8 total (all AI agent accounts + Michael Wolf admin)
- **Groups:** 2 (Everyone, Okta Administrators)
- **Apps:** 5 built-in (Admin Console, Browser Plugin, Dashboard, Workflows, Workflows OAuth)
- **SSO:** No SSO profiles connecting to YeshID or Google configured
- **Role:** Standalone trial org. Not connected to Google Workspace or YeshID in current config.

---

## Integration Status Matrix

| From → To        | Status        | Evidence |
|------------------|---------------|----------|
| Google → YeshID  | ✅ CONFIGURED | OAuth flow: `/api/v1/integrations/google/authorize/response` |
| YeshID → Google  | ✅ SYNC       | `Directory synced` column in YeshID people table |
| Google → Okta    | ❌ NOT FOUND  | No Google as IdP in Okta, no SAML apps |
| Okta → YeshID    | ❌ NOT FOUND  | No Okta connector in YeshID settings (session expired before full check) |
| YeshID → Okta    | ❓ UNKNOWN    | YeshID settings redirected to Google OAuth before we could see Okta section |
| Google SSO → any | ❌ NOT FOUND  | `/ac/security/sso` has no configured profiles |

---

## Key API Endpoints Discovered

### Okta
- Users list: `GET /admin/users` (perceive → table)
- User profile: `GET /admin/user/profile/view/{userId}`
- Groups: `GET /admin/groups`
- Apps: `GET /admin/apps/active`
- System Log: `GET /report/system_log_2`
- Reports index: `GET /reports`
- CSV export: `GET /sage/api/v1/logs/csv?since=...&until=...&q=`

### Google Admin
- Users: `GET /ac/users`
- Groups: `GET /ac/groups`
- OUs: `GET /ac/orgunits`
- SSO settings: `GET /ac/security/sso`
- Security (org-specific): `GET /ac/managedsettings/352555445522`

### YeshID
- People: `GET /organization/people`
- Settings (triggers Google OAuth): `GET /organization/settings`
- Google OAuth callback: `POST /api/v1/integrations/google/authorize/response`

---

## Next Steps for Integration Mapping

1. **Re-auth YeshID** and navigate past the Google OAuth to `/organization/settings` to see if there's an Okta section
2. **Check `ssotax.yeshid.com`** — the second YeshID tab (`1637807225`) is at `ssotax.yeshid.com` which may be the tax/SSO integration hub
3. **Add Google SSO profile** to Google Admin pointing to YeshID (SAML/OIDC) if the goal is unified SSO
4. **Explore `/ac/apps/saml`** with a longer delay (6s+) to check for pre-configured SAML app integrations

---

_Yeshie payload coverage: Okta (8 payloads), Google Admin (3 payloads), YeshID (existing)_
_Session: 2026-04-13_
