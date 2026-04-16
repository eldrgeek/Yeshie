# Google Admin Console — Site Survey & Payload Plan

**Date:** 2026-04-12
**Domain:** admin.google.com (`/ac/` URL prefix)
**Account:** mw@mike-wolf.com (G Suite legacy free edition)
**Auth:** Google SSO — same as YeshID, reusable `waitForAuth` flow

---

## Survey Summary

### 1. Users (`/ac/users`)
- **26 active users** in directory
- **Actions available:** Add user, Delete user, Update name/email, Create alternate email, Bulk update (CSV), Download users list, Reset password, Rename user
- **UI pattern:** Table with columns (Name, Email, Status, Last sign-in, Storage used, Admin role, 2SV enrollment)
- **User detail pages:** Click a user row → full profile with sections for Account, Security, Groups, Apps, Organizational unit
- **Demo value:** HIGH — user lifecycle management is the bread and butter of IT admin

### 2. Groups (`/ac/groups`)
- **2 groups** currently
- **Actions available:** Create group, Add members, Manage members, Edit settings, Delete group
- **UI pattern:** Table with Name, Description, Email, Members columns
- **Demo value:** MEDIUM — useful for access policy demo

### 3. Organizational Units (`/ac/orgunits`)
- **6 org units** (mike-wolf.com root, Everyone, Just Mike, Test Department, + 2 more)
- **Actions available:** Create org unit, Edit, Delete, Search
- **UI pattern:** Table with Name, Description columns, Edit/Delete buttons per row
- **Demo value:** MEDIUM — shows hierarchical org management

### 4. Security (`/ac/security` → redirects to `/ac/managedsettings/352555445522`)
- **17 expandable settings sections** including:
  - Alert center
  - Password management
  - 2-Step Verification
  - Account Recovery
  - SSO with Google as SAML IdP
  - SSO with third-party IdP
  - Advanced Protection Program
  - Context-Aware Access
  - API controls
  - Client-side encryption
  - Less secure apps (deprecated)
  - Google session control
- **Demo value:** HIGH — security posture review is a killer demo scenario

### 5. Apps / Google Workspace Services (`/ac/appslist/core`)
- **11 services:** AppSheet, Calendar, Drive & Docs, Gmail, Google Chat, Google Meet, Google Voice, Groups for Business, Keep, Sites, + Generative AI add-on
- **Actions available:** Turn ON/OFF per service, Per-service settings, Access by organizational unit
- **Demo value:** HIGH — toggling services per org unit shows governance power

### 6. Reporting — User Accounts (`/ac/reporting/report/user/accounts`)
- **Rich 26-row user report** with 40+ columns including:
  - 2FA enrollment/enforcement status
  - Password strength and compliance
  - Storage usage breakdown (Drive, Gmail, Photos)
  - Last login date
  - Admin status
  - Suspension status
  - Apps usage (email, Drive activity)
- **Demo value:** VERY HIGH — security audit readout, compliance reporting

### 7. Billing / Subscriptions (`/ac/billing/subscriptions`)
- **3 subscriptions:** Chrome Enterprise Core (Free), Domain Registration (Annual), G Suite legacy (Free, 22 avail / 28 assigned)
- **Actions available:** Buy or upgrade, View invoices
- **Demo value:** LOW — read-only for demo, financial actions prohibited

### 8. Storage (`/ac/storage`)
- **207.45 GB of 584 GB used** — Drive 13.4 GB, Photos 180.7 GB, Gmail 10.05 GB, Other 3.31 GB
- **Top users by storage:** Mike Wolf (184 GB), Photo Backup (14.6 GB), Family Archives (8.7 GB)
- **Actions available:** Manage storage settings (per OU/group/user limits), View detailed reports
- **Demo value:** MEDIUM — shows storage governance

### 9. Account Settings (`/ac/accountsettings`)
- **Sections:** Profile (name, customer ID, primary admin), Preferences (rapid release, email opts), Personalization (logo), Legal/compliance (ToS), Custom URLs, Account management (delete account)
- **Demo value:** LOW — mostly read/configure, not action-heavy

### 10. Admin Roles (`/ac/list/roles`)
- **Actions available:** Create new role, assign to users/groups
- **Pre-built roles:** Super Admin, Groups Admin, Help Desk Admin, Services Admin, User Management Admin, etc.
- **Demo value:** MEDIUM — RBAC is relevant for access governance

### 11. Rules (`/ac/ax`)
- **50+ system-defined rules** across categories: Activity, Data Protection, Reporting, Trust rules
- **Key rules (active):** Suspicious login, Leaked password, Government-backed attacks, Phishing detected, Super admin password reset, SSO profile changes, Device compromised, User suspended for spam
- **Actions available:** Create rule, View/Reset rule, toggle Active/Inactive, configure notifications
- **Demo value:** HIGH — shows automated security monitoring

### 12. Chrome Browser (`/ac/chrome/...`)
- **1 enrolled browser**, 0 managed profiles
- **Actions available:** Enroll browser, Configure browser policies, Manage extensions, Detect sensitive data transfers
- **Demo value:** MEDIUM — Chrome enterprise management

### 13. Devices
- **ChromeOS device management** — requires 30-day trial activation
- **Advanced mobile management** — prompt to enable
- **Demo value:** LOW for now (not activated)

---

## UI Patterns Observed

| Pattern | Description |
|---------|-------------|
| **Material Design** | Google's own MDC components, NOT Vuetify |
| **Sidebar navigation** | Expandable tree — some items are links, some are section headers |
| **URL scheme** | `/ac/{section}` — some sections use numeric IDs (`/ac/managedsettings/352555445522`) |
| **Tables** | Standard Material data tables with sort, pagination (10/20/30/40/50 per page) |
| **Settings pages** | Expandable accordion sections with toggle switches |
| **Forms** | Standard Material inputs — no unified-selection-shell pattern |
| **Modals/Dialogs** | Used for user creation, group creation, role creation |
| **Alerts/Toasts** | Notification banners at top of page |

### Key differences from YeshID:
- No Vuetify — pure Google Material Design
- No `position: fixed` dropdown shells
- Simpler form inputs (standard HTML `<input>`, `<select>`)
- URL routing is more predictable (`/ac/` prefix)
- Session cookies are robust (Google SSO, long-lived)
- Some sections use numeric IDs that may change

---

## Proposed Payload Plan

### Phase 1 — High-Impact Demo Payloads (build first)

These directly show Dana/Alex "Yeshie can manage YOUR Google Workspace, not just YeshID":

| # | Payload | Description | Est. Steps | Priority |
|---|---------|-------------|-----------|----------|
| 00 | `login` | Google Admin auth detection + SSO flow | 5-8 | Required |
| 01 | `user-add` | Add a new user to Google Workspace | 12-15 | **P0** |
| 02 | `user-delete` | Suspend/delete a user | 10-12 | **P0** |
| 03 | `user-modify` | Update user name, email, org unit, or recovery info | 10-14 | **P0** |
| 04 | `site-explore` | Survey all admin pages, capture buttons/inputs/tables | 15-20 | **P0** |
| 05 | `security-audit` | Read 2FA enrollment, password compliance, suspicious login rules | 10-15 | **P1** |
| 06 | `reporting-snapshot` | Navigate to user accounts report, capture key metrics | 8-12 | **P1** |

### Phase 2 — Governance & Policy Payloads

| # | Payload | Description | Est. Steps | Priority |
|---|---------|-------------|-----------|----------|
| 07 | `group-create` | Create a group with members | 10-12 | **P2** |
| 08 | `group-manage` | Add/remove members from existing group | 8-10 | **P2** |
| 09 | `org-unit-create` | Create an organizational unit | 6-8 | **P2** |
| 10 | `toggle-service` | Enable/disable a Google Workspace service for an OU | 8-10 | **P2** |
| 11 | `rule-configure` | Enable/disable a security rule + set notification | 8-10 | **P2** |

### Phase 3 — Advanced (stretch goals)

| # | Payload | Description | Est. Steps | Priority |
|---|---------|-------------|-----------|----------|
| 12 | `reset-password` | Force password reset for a user | 8-10 | **P3** |
| 13 | `admin-role-assign` | Create or assign an admin role | 10-12 | **P3** |
| 14 | `storage-report` | Generate storage usage report | 6-8 | **P3** |
| 15 | `2fa-enforcement` | Configure 2-step verification policy | 10-12 | **P3** |

---

## Implementation Notes

### Auth Flow
- Google Admin uses the same Google SSO as YeshID → existing `waitForAuth` should work
- The `PRE_CLICK_GOOGLE_ACCOUNT` flow can reuse `mw@mike-wolf.com`
- Session is long-lived; unlikely to expire mid-chain

### Target Resolution
- Google Admin uses standard HTML inputs/buttons — simpler than Vuetify
- No `v-input` / `v-label` patterns to handle
- Standard `aria-label`, `placeholder`, and button text matching should work
- May need new patterns for Material Design accordion/expandable sections

### Layer 2 Model
- Need `models/generic-material-design.model.json` for Google's MD patterns
- OR — Google Admin's HTML is clean enough that the runtime model + standard resolution may suffice
- Recommend: start without a Layer 2 model, add one if target resolution fails

### Layer 3 Site Model
- `sites/google-admin/site.model.json` — capture page graph, auth requirements
- State graph: logged_in → navigate → {users, groups, orgunits, security, apps, reporting, billing, storage, rules, roles}

---

## Recommended Build Order

1. **`00-login`** — validate Google Admin auth detection works (may be trivial if YeshID login already authenticated)
2. **`04-site-explore`** — automated survey to capture current UI state
3. **`01-user-add`** — highest demo value, proves write capability
4. **`03-user-modify`** — edit user attributes
5. **`05-security-audit`** — read security posture (impressive for Dana)
6. **`06-reporting-snapshot`** — pull compliance data
7. **`02-user-delete`** — complete CRUD lifecycle
8. Phase 2 payloads as time permits

## Demo Script (for Dana/Alex)

> "Watch: I'll ask Yeshie to add a test user to your Google Workspace, set them up in the right org unit, then pull a security audit showing 2FA enrollment across all users. Same tool that already manages your YeshID — one platform for everything."

This positions Yeshie as the cross-platform IT automation layer, not just a YeshID-specific tool.
