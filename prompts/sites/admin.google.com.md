<site-context domain="admin.google.com">

## Google Admin Console — Site Context

**Base URL:** https://admin.google.com
**Framework:** Google Material Design (Polymer/Lit-based). Heavy JS rendering.
**Workspace:** G Suite legacy free edition — mike-wolf.com, 23 active users, 25 licenses

### Authentication

**Auth type: manual_required** — Google Account login with password + optional 2FA. The extension CANNOT automate Google Admin login.

- If the session has expired, the user will be redirected to Google's login page
- Tell the user: "Your Google Admin session has expired. Please log in and I'll continue when you're back."
- Do NOT attempt to automate login — it requires password entry and may require 2FA
- Authenticated state: URL starts with `admin.google.com` and the sidebar navigation is visible

### Known Payloads

No validated payloads yet for Google Admin. Use DO mode inference for all requests.

### Page Context Map

Read selector: `[role='main'], [role='navigation']` — works reliably for most pages.

| URL Pattern | What the user can do here |
|-------------|--------------------------|
| `/` or `/ac/dashboard` | Dashboard — insights, alerts |
| `/ac/users` | Users list — add, delete, suspend, rename, reset password, assign licenses |
| `/ac/groups` | Groups list — create, delete, manage members |
| `/ac/orgunits` | Organizational units — create, edit, delete, move users |
| `/ac/apps` | Apps overview — Google Workspace, additional services, SAML/mobile apps |
| `/ac/appslist/core` | Google Workspace services — turn on/off per OU |
| `/ac/security` | Security — 2FA, passwords, SSO, passkeys, session control, API controls |
| `/ac/devices/list` | Devices — 40+ devices, approve/wipe/block (use `/list` suffix, not `/devices` alone) |
| `/ac/billing/subscriptions` | Billing — subscriptions, licenses (use full path, not `/ac/billing` alone) |
| `/ac/accountsettings` | Account settings — profile, preferences, legal |
| `/ac/roles` | Admin roles — 11 system roles, create custom roles |
| `/ac/storage` | Storage — 206.68 GB used of 539 GB |
| `/ac/domains/manage` | Domains — primary domain, aliases |

**Important URL quirks:** Many sidebar items use JS-driven navigation and return 404 on direct navigation. These work: `/ac/users`, `/ac/groups`, `/ac/orgunits`, `/ac/apps`, `/ac/appslist/core`, `/ac/security`, `/ac/devices/list`, `/ac/billing/subscriptions`, `/ac/accountsettings`, `/ac/roles`, `/ac/storage`, `/ac/domains/manage`. These do NOT work directly: `/ac/reporting`, `/ac/generativeai`, `/ac/data`, `/ac/rules`, `/ac/chrome`.

### DOM Patterns

Google Admin uses custom Google components. Key patterns:
- Read with `[role='main'], [role='navigation']` — captures sidebar and content area
- Navigation uses custom elements, not standard `<a>` tags — clicking sidebar items requires finding them by text
- Table rows are standard `<tr>` / `<td>` in most list views
- Search inputs: `[role='searchbox']` or `input[type='text']` in filter bars
- Action buttons in list views: text-based, look for button text (e.g., "Add new user", "Create group")
- Bulk selection: checkboxes before rows; bulk action buttons appear in a toolbar after selection

### Known Data

- Primary domain: mike-wolf.com (Verified, Gmail activated)
- Users: 23 active
- Groups: Engineering, Test Group (both Public)
- OUs: mike-wolf.com (root), Everyone, Just Mike, Test Department
- Services: AppSheet, Calendar, Drive and Docs, Gmail, Google Chat, Meet, Voice, Groups, Keep, Sites, Tasks — all ON
- Devices: 40+ (macOS, Android, iOS, Linux)
- Storage: Google Drive 13.4 GB, Google Photos 179.93 GB, Gmail 10.05 GB
- Admin roles: Super Admin, Groups Admin, User Management Admin, Help Desk Admin, Services Admin, and 7 more

</site-context>
