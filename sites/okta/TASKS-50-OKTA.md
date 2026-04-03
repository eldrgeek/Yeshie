# Okta Admin Console — 50 Most Common Tasks

**Domain:** `trial-8689388-admin.okta.com`
**Framework:** Material-UI (MUI) — Okta Identity Engine 2026.03.3 E
**Base URL:** `https://trial-8689388-admin.okta.com`
**Last updated:** 2026-04-03

## Summary

| Status | Count |
|--------|-------|
| VALIDATED | 0 |
| LEARNED | 0 |
| EXPLORED | 35 |
| NOT STARTED | 15 |
| **Total** | **50** |

## Top 20 Learning Priority

1. #4 Search for a user
2. #5 View a user's profile
3. #1 Add a new person
4. #3 Modify a user's profile
5. #6 Activate/deactivate a user
6. #7 Reset a user's password
7. #8 Assign user to a group
8. #16 Create a new group
9. #20 Add an application from catalog
10. #21 Create a custom app integration
11. #23 Assign users to an application
12. #30 Create an API token
13. #26 Configure sign-on policy
14. #28 Add an authenticator (MFA)
15. #10 Bulk import users
16. #35 View system log
17. #37 Add an admin
18. #40 Configure network zones
19. #17 View group members
20. #33 Create an authorization server

---

## People Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 1 | Add a new person | EXPLORED | `01-user-add` | "Add person" link (href=#, JS dialog) on `/admin/users`. 7 users total, 30-day trial |
| 2 | Deactivate a person | EXPLORED | — | User profile "More Actions" menu: Reset Authenticators, Suspend, Deactivate. Also bulk "Deactivate" in people page "More actions" |
| 3 | Modify a user's profile | EXPLORED | — | User profile page has Profile tab. Tabs: Applications, Groups, Profile, Devices, Pre-enrolled authenticators |
| 4 | Search for a user | EXPLORED | — | Textarea: "Search for users by first name, primary email or username". 7 users visible. Status filters: All, Staged, Pending user action, Active, Password reset, Locked out, Suspended, Deactivated |
| 5 | View a user's profile | EXPLORED | — | Click row → `/admin/user/profile/view/{userId}`. Tested with Claude Anthropic (`00u11li1n9nsGaoiX698`). Shows status, tabs, actions |
| 6 | Activate/deactivate a user | EXPLORED | — | Profile shows "Set Password & Activate" and "Resend Activation Email" for pending users. "Deactivate" in More Actions dropdown |
| 7 | Reset a user's password | EXPLORED | — | "Reset passwords" link (`/admin/user/reset_pass`) on users page. Also "Reset Password" dialog on profile (7-day expiry link) |
| 8 | Assign user to a group | EXPLORED | — | User profile Groups tab shows current groups (e.g. "Everyone"). Group picker widget for adding to groups. Can also remove from group |
| 9 | Unlock a user's account | EXPLORED | — | "Unlock people" available in bulk "More actions" menu on people page. Per-user unlock via profile |
| 10 | Bulk import users | EXPLORED | — | "More actions" → "Import users from CSV". Also bulk: Activate, Deactivate, Expire passwords, Unlock people, Edit Deactivated User Profile Updates |

## Group Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 11 | View all groups | EXPLORED | — | `/admin/groups`. "All" and "Rules" tabs. Table: Group name, People, Applications. Filter: All, Okta groups, App groups |
| 12 | Search for a group | EXPLORED | — | Textarea: "Search by group name". "Advanced search" link available |
| 13 | Create a new group | EXPLORED | — | "Add group" button confirmed on groups page. Permission `createGroup` present |
| 14 | Edit a group | NOT STARTED | — | Click group row → group-detail |
| 15 | Delete a group | NOT STARTED | — | Likely in group detail actions |
| 16 | Add members to a group | EXPLORED | — | Group picker on user profile, or from group detail. User profile shows "Remove Person from Group" confirmation dialog |
| 17 | View group members | NOT STARTED | — | Click group → members tab |
| 18 | Create a group rule | EXPLORED | — | "Rules" tab on groups page. Permissions: viewGroupRules, createGroupRules, canAddGroupRule, canUpdateGroupRule, canRemoveGroupRule, canDeactivateGroupRule, canActivateGroupRule |
| 19 | Assign application to group | NOT STARTED | — | Group or app detail page |

## Application Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 20 | Add an application from catalog | EXPLORED | — | `/admin/apps/add-app`. 8219+ integrations. Categories: SSO (7693), Directory/HR Sync (127), Lifecycle Management, Zero Trust (104), MFA (132). Featured: Salesforce, Zendesk, Google Workspace, Box, Dropbox, Zoom. Search + filter by Use Case, Functionality, Industry |
| 21 | Create a custom app integration | EXPLORED | — | "Create App Integration" link (href=#, JS dialog). Also "Create New App" button on catalog page |
| 22 | View all applications | EXPLORED | — | `/admin/apps/active`. Active/Inactive tabs. Search input. 5 known apps (Admin Console, Browser Plugin, Dashboard, Workflows, Workflows OAuth) |
| 23 | Assign users to an application | EXPLORED | — | `/admin/app/bulk-assign`. 2-step wizard: (1) select apps + people, (2) confirm. Search by person/application/group. Shows 7 users, 3 assignable apps. Pagination (10/25/50/100 per page) |
| 24 | Remove user from application | NOT STARTED | — | App detail → assignments |
| 25 | Configure SSO for an application | NOT STARTED | — | App detail → Sign On tab |

## Policies & Authentication

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 26 | Configure sign-on policy | EXPLORED | — | `/admin/access/new-policies`. "Global Session Policy" with "Add policy" and "Add rule". Default: 1-day max session, 2h lifetime, MFA not required, Location: Anywhere. Rule fields: Access, Status, Excludes Users, Location, Login Type, MFA, Session Lifetime, Behaviors, Risk |
| 27 | Create authentication policy | EXPLORED | — | "Add policy" button on policies page. Policy has description, assigned groups, rules with priority ordering |
| 28 | Add an authenticator (MFA) | EXPLORED | — | `/admin/access/multifactor`. Setup/Enrollment tabs. "Add authenticator" button. Current: Email (Possession, Active), Okta Verify (Possession+Knowledge/Biometric, phishing-resistant FastPass, Active), Password (Knowledge, Active). Each has Edit/Delete actions |
| 29 | Configure password policy | EXPLORED | — | Password authenticator has "Info" and "Edit" actions on MFA page. Breached credential providers: OKTA, ACTIVE_DIRECTORY |

## API & Tokens

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 30 | Create an API token | EXPLORED | — | "Create token" link on `/admin/access/api/tokens`. Table: Name, Role, Status, Actions |
| 31 | Revoke an API token | NOT STARTED | — | Actions column in tokens table |
| 32 | Configure trusted origins | EXPLORED | — | "Trusted Origins" tab on `/admin/oauth2/as` page (shared with Auth Servers and Tokens tabs) |
| 33 | Create an authorization server | EXPLORED | — | "Add Authorization Server" button on `/admin/oauth2/as`. Table: Name, Audience, Issuer URI. Currently empty |
| 34 | View authorization server scopes | NOT STARTED | — | Auth server detail page |

## System Log & Reporting

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 35 | View system log | EXPLORED | — | `/report/system_log_2`. Has `#system-log-container`, date picker calendar, MapBox geo visualization, "Add to zone" button |
| 36 | Search system log events | EXPLORED | — | Date picker (calendar), "Manage Client" controls. Retention settings configurable |

## Administrators

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 37 | Add an admin | EXPLORED | — | `/admin/access/admins`. Tabs: Overview, Roles, Resources, Admins, Settings. "Add administrator" button, search by user/group/app. 1 admin (Michael Wolf, Super Org Admin). "Create Report" button. Admin changes audit log |
| 38 | Change admin role | EXPLORED | — | "Roles" tab on admins page. Custom roles supported (resource sets + roles). Standard + custom admin roles |
| 39 | Remove an admin | NOT STARTED | — | Admin list actions |

## Security & Network

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 40 | Configure network zones | EXPLORED | — | `/admin/access/networks`. "Add zone" button with 3 types: IP Zone, Dynamic Zone, Enhanced dynamic zone. Filter: All, Admin created, Okta defaults. Default zones: IP block list, Enhanced dynamic zone blocklist (ALL_ANONYMIZERS), IP exempt list. Client IP: 174.16.57.226 |
| 41 | View threat insights | NOT STARTED | — | Security → Threat Insight (if available on trial) |
| 42 | Configure session lifetime | EXPLORED | — | Part of Global Session Policy on `/admin/access/new-policies`. Default: 1-day max, 2h session lifetime, cookies don't persist across browser sessions |

## Directory & Provisioning

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 43 | Add a directory integration | NOT STARTED | — | Directory → Directory Integrations |
| 44 | Configure provisioning for an app | NOT STARTED | — | App detail → Provisioning tab |
| 45 | Import users from directory | NOT STARTED | — | Directory → Import |

## Customization & Branding

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 46 | Customize sign-in page | EXPLORED | — | `/admin/customizations/branding`. "Create brand" button. Current brand: embeddedsystemsresearch-trial-8689388, subdomain trial-8689388.okta.com. Theme builder v0.1.0. Widget generation toggle. 30+ supported locales |
| 47 | Configure custom domain | EXPLORED | — | Custom Domain column in Brands table on branding page. Currently using Okta subdomain |
| 48 | Edit email templates | EXPLORED | — | Email Address column in Brands table. Default from: noreply@okta.com. Custom email domains supported (active/pending states) |

## Workflows & Automation

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 49 | View Okta Workflows | NOT STARTED | — | Apps list shows "Okta Workflows" and "Okta Workflows OAuth" |
| 50 | Configure lifecycle hooks | NOT STARTED | — | Workflow → Inline Hooks |
