# Okta Admin Console - Site Survey

**Survey Date:** 2026-04-16  
**Base URL:** https://trial-8689388-admin.okta.com  
**Status:** Complete Phase 2 — Live Console Survey  
**Authentication:** User logged in as Michael Wolf (mike@embeddedsystemsresearch.org)

---

## Capabilities (from docs)

From live admin console observation:

- Add a person (user) to the organization
- List all people in the organization with search/filter by status
- View and edit user profile details
- Deactivate a user
- Reset password for one or multiple users
- View user group membership
- View and manage user application assignments
- Create a group
- Add members to a group
- View all groups (built-in: Everyone, Okta Administrators)
- View applications (SSO integrations)
- Create/add a new application integration
- Assign application to users
- Browse application catalog
- View system logs and audit events (Org changes, security events)
- View organization health and security monitoring
- Configure security settings (ThreatInsight, HealthInsight)
- Manage authentication protocols

---

## Pages

### Dashboard — /admin/dashboard

**Type:** dashboard

**What you can do here:**
- View overview of organization health (8 users, 7 SSO apps, 2 built-in groups)
- View user growth chart (14% increase in last 7 days)
- View application authentication protocol breakdown (6 OIDC apps)
- View security monitoring status (56% tasks completed via HealthInsight)
- View ThreatInsight status (0 threats detected, audit mode)
- Navigate to Users, Groups, SSO Apps, Reports
- View Tasks and To-do items
- View Org changes

**Targets found:**
- "Users" link → url="/admin/users"
- "Groups" link → url="/admin/groups"
- "SSO Apps" link → url="/admin/apps/active"
- "Import groups" link → url="/admin/groups"
- "View HealthInsight" link → url="/admin/access/healthinsight"
- "Enable it" (ThreatInsight) link → url="/admin/access/general"

**After action:**
- All links navigate to respective pages

---

### People (Users List) — /admin/users

**Type:** list

**What you can do here:**
- List all users (8 shown as of 2026-04-16)
- Search users by first name, primary email, or username
- Filter by status: All, Staged, Pending user action, Active, Password reset, Locked out, Suspended, Deactivated
- Add person (button present)
- Reset passwords (button present)
- More actions (dropdown menu)
- Click on a user name to view their profile
- View columns: Person & username, Primary email, Status

**Targets found:**
- "Add person" link → url="https://trial-8689388-admin.okta.com/admin/users#"
- "Reset passwords" link → url="https://trial-8689388-admin.okta.com/admin/user/reset_pass"
- "More actions ▾" link (dropdown)
- Search textbox: placeholder="Search for users by first name, primary email or username"
- Status filter: readonly textbox shows selected filter
- User links: a[href*='/admin/user/profile/view/']

**After action:**
- Add person: likely opens modal or nav to form
- Reset passwords: navigates to /admin/user/reset_pass page
- User click: navigates to /admin/user/profile/view/{user_id}

---

### Person (User Profile) — /admin/user/profile/view/{user_id}

**Type:** detail view with tabs

**What you can do here:**
- View user header with name, email, status (e.g., "Michael Wolf mike@embeddedsystemsresearch.org" — Active)
- Tabs: Applications, Groups, Profile, Devices, Admin roles, Pre-enrolled authenticators
- View Logs: link to view activity for this user
- View assigned applications
- Search within assigned applications
- Assign Applications button/option

**Targets found:**
- "View Logs" link → url="/report/system_log_2?search=actor.id+eq+%22{user_id}%22..."
- Tab links:
  - "Applications" → url="#tab-apps"
  - "Groups" → url="#tab-groups"
  - "Profile" → url="#tab-account"
  - "Devices" → url="#tab-user-devices"
  - "Admin roles" → url="#tab-admin-permissions"
  - "Pre-enrolled authenticators" → url="#tab-pre-enrolled-authenticators"
- "Assign Applications" button (in form or modal)
- User status badge showing current state

**After action:**
- Tab clicks navigate within same page (hash-based)
- No data-cy or data-testid attributes found

---

### Groups — /admin/groups

**Type:** list with tabs

**What you can do here:**
- List all groups (2 built-in groups shown: Everyone, Okta Administrators)
- Tabs: All, Rules
- Search groups by group name
- Filter by group source type: All, Okta groups, App groups
- Add group (button present)
- View group details (click group name)
- View columns: Group name, People (member count), Applications (assigned app count)

**Targets found:**
- "All" tab
- "Rules" tab
- Search textbox: placeholder="Search by group name"
- "Add group" link → url="#"
- Group links: a[href*='/admin/group/']
- "Advanced search ▾" dropdown
- Filter: "Group source type" dropdown

**After action:**
- Add group: likely opens modal or form
- Group click: navigates to group detail page
- Search: filters list in real-time

---

### Applications — /admin/apps/active

**Type:** list

**What you can do here:**
- List active SSO applications (6 shown)
- Search applications
- Filter by status: ACTIVE (0), INACTIVE (0)
- Create App Integration (button)
- Browse App Catalog (button)
- Assign Users to App (button)
- More (dropdown menu)
- View application details (click app name)
- View columns: App name, Status, Client ID

**Targets found:**
- "Create App Integration" link → url="#"
- "Browse App Catalog" link → url="/admin/apps/add-app"
- "Assign Users to App" link → url="/admin/app/bulk-assign"
- "More ▾" dropdown
- Search textbox: placeholder="Search"
- App links: a[href*='/admin/app/*/instance/']
- Status filter shows ACTIVE and INACTIVE counts

**After action:**
- Create App Integration: opens modal or navigates to form
- Browse Catalog: navigates to /admin/apps/add-app
- Assign Users: navigates to /admin/app/bulk-assign

---

### Devices — /admin/devices-inventory

**URL pattern:** /admin/devices-inventory

**Note:** From navigation snapshot only — not fully surveyed yet

---

### Profile Editor — /admin/universaldirectory

**URL pattern:** /admin/universaldirectory

**Note:** From navigation snapshot only — manages custom profile attributes

---

### Directory Integrations — /admin/people/directories

**URL pattern:** /admin/people/directories

**Note:** From navigation snapshot only — manages AD, LDAP, or other directory connectors

---

### Profile Sources — /admin/profile-masters

**URL pattern:** /admin/profile-masters

**Note:** From navigation snapshot only — manages profile mastering/authoritative sources

---

### System Log — /report/system_log_2

**URL pattern:** /report/system_log_2 (with extensive URL parameters)

**Type:** report/audit log

**What you can do here:**
- View system audit events
- Search events by actor, target, event type
- Filter by date range
- View geographic map of events
- View specific event log entries

**Targets found:**
- Search parameters: extensive URL parameters for filtering

---

## Capability Map

| What you can do | URL | Path | Inputs | Success signal |
|---|---|---|---|---|
| List all users | /admin/users | Dashboard → Users OR Direct nav | None | Users table populated; count displayed |
| Add user | /admin/users (modal/form) | Dashboard → Users → Add person | first_name, last_name, email, login | Modal closes, user appears in list OR redirect to /admin/user/profile/view/{id} |
| Reset password (single) | /admin/user/profile/view/{id} | User profile page → More actions | user_id | Success message OR password reset email sent |
| Reset passwords (bulk) | /admin/user/reset_pass | Users list → Reset passwords | user_ids (multiple) | Success page OR email notifications sent |
| Deactivate user | /admin/user/profile/view/{id} | User profile → More actions | user_id | User status changes to "Deactivated" OR redirect to users list |
| View user profile | /admin/user/profile/view/{id} | Users list → User name | user_id | Profile page loads with user details |
| View user logs | /report/system_log_2 | User profile → View Logs | user_id | System log filtered to that user |
| Assign app to user | /admin/user/profile/view/{id} | User profile → Applications tab → Assign Applications | user_id, app_id | App appears in user's assigned applications |
| List groups | /admin/groups | Directory → Groups OR Dashboard → Groups | None | Groups table populated |
| Add group | /admin/groups (modal/form) | Groups list → Add group | group_name | Group appears in list OR redirect to group detail |
| View group details | /admin/group/{id} | Groups list → Group name | group_id | Group profile page loads |
| List applications | /admin/apps/active | Applications → Applications OR Dashboard → SSO Apps | None | Apps table populated; count displayed |
| Create app integration | /admin/apps/active (modal/form) | Apps → Create App Integration | app_config | App appears in list |
| Browse app catalog | /admin/apps/add-app | Apps → Browse App Catalog | None | App catalog page loads with searchable apps |
| Assign users to app (bulk) | /admin/app/bulk-assign | Apps → Assign Users to App | app_id, user_ids | Success page OR users appear in app assignments |
| View system log | /report/system_log_2 | Dashboard → View all (org changes) OR Reports | None | Log events appear |

---

## Gaps

### In the app, not in the docs
- User deactivation may have sub-actions (suspend, re-activate)
- Group membership management (add/remove members from group detail page)
- Application provisioning/deprovisioning
- Custom attributes in user profile (Profile Editor integration)
- Device management details
- Workflow automation features (Workflow nav section)
- Settings page (Settings nav section)

### In the docs, not in the app
- None identified yet (docs access blocked in workspace)

---

## Technical Notes

### Framework
- **Framework:** MUI (Material-UI) — standard HTML/CSS
- **Auth:** OAuth2 PKCE redirect (cannot be automated; user must log in)
- **Selectors:** NO data-cy or data-testid attributes found on admin console
- **Form fields:** Use button text, link text, and placeholder text for selectors
- **Navigation:** Hash-based for modals; direct URLs for pages

### Known User Data
- 8 users total (1 Active, 7 Pending user action)
- Admin user: Michael Wolf (mike@embeddedsystemsresearch.org)
- Test users: Hermes AI, Perplexity AI, ChatGPT OpenAI, Grok xAI, Gemini Google, Claude Anthropic, Yeshie Test
- 2 built-in groups: Everyone (8 members), Okta Administrators
- 6 SSO applications: Okta Admin Console, Okta Browser Plugin, Okta Dashboard, Okta Workflows, Okta Workflows OAuth, + 1 more (appears to be custom)

### Navigation Structure
- Main sections: Dashboard, Directory (People, Groups, Devices, Profile Editor, Directory Integrations, Profile Sources), Customizations, Applications (Applications, Self Service, API Service Integrations), Security, Workflow, Reports, Settings
- Directory is the main section for user and group management
- Applications section handles SSO integrations and assignments

---

## Next Steps

Phase 3: Build detailed payload files for high-value capabilities:
1. 04-reset-password.payload.json — Reset password for single user
2. 05-reset-passwords-bulk.payload.json — Bulk password reset
3. 06-create-group.payload.json — Create a new group
4. 07-assign-app-to-user.payload.json — Assign application to user
5. 08-list-groups.payload.json — List groups (already have list-users)
6. 09-view-system-log.payload.json — View system audit log with filters

Update existing payloads:
- 01-list-users.payload.json — Verify selectors still valid
- 02-add-user.payload.json — Verify form fields and selectors
- 03-deactivate-user.payload.json — Verify deactivation path and success signal
