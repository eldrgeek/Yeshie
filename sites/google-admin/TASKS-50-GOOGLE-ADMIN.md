# Google Admin Console — 50 Most Common Tasks

**Site:** admin.google.com
**Framework:** Google Material Design (Polymer/Lit-based)
**Auth:** manual_required (Google Account login with password + optional 2FA)
**Edition:** G Suite legacy free edition (mike-wolf.com), 23 active users
**Explored:** 2026-04-03

---

## Category 1: User Management (10 tasks)

### 1. Add a new user
**Status:** EXPLORED
**Path:** /ac/users → Add new user button
**Findings:** Users page at `/ac/users` shows 20+ users in table with columns: Name, Email, Last sign in, Email usage, Photos usage. "Add new user" button available in bulk actions bar. OUs available: mike-wolf.com, Everyone, Just Mike, Test Department.

### 2. Delete a user
**Status:** EXPLORED
**Path:** /ac/users → select user → Delete user
**Findings:** Per-user action "Delete user" available from user row actions. Also available as bulk action "Delete" when selecting multiple users.

### 3. Suspend a user
**Status:** EXPLORED
**Path:** /ac/users → select user → Suspend user
**Findings:** Per-user action "Suspend user" visible in user row actions menu.

### 4. Reset a user's password
**Status:** EXPLORED
**Path:** /ac/users → select user → Reset password
**Findings:** Per-user action "Reset password" available. Also bulk "Reset passwords" not visible but expected in user detail view.

### 5. Rename a user (change name/email)
**Status:** EXPLORED
**Path:** /ac/users → select user → Rename user
**Findings:** Per-user action "Rename user" available from user row. "Update a user's name or email" listed as dashboard quick action.

### 6. Create an alternate email address (alias)
**Status:** EXPLORED
**Path:** /ac/users → select user → settings
**Findings:** "Create an alternate email address" listed as a dashboard quick action under Users card.

### 7. Bulk update users (CSV upload)
**Status:** EXPLORED
**Path:** /ac/users → Bulk update users button
**Findings:** "Bulk update users" button available in the users list bulk actions bar.

### 8. Download users list
**Status:** EXPLORED
**Path:** /ac/users → Download users button
**Findings:** "Download users" button available in users list bulk actions bar.

### 9. Change a user's organizational unit
**Status:** EXPLORED
**Path:** /ac/users → select user → Change organizational unit
**Findings:** Per-user action "Change organizational unit" available. Also bulk action "Change OU" for multiple users. 4 OUs discovered: mike-wolf.com, Everyone, Just Mike, Test Department.

### 10. Restore user data
**Status:** EXPLORED
**Path:** /ac/users → select user → Restore data
**Findings:** Per-user action "Restore data" available from user row actions.

---

## Category 2: Groups Management (5 tasks)

### 11. Create a group
**Status:** EXPLORED
**Path:** /ac/groups → Create group button
**Findings:** Groups page at `/ac/groups` shows 2 groups (Engineering, Test Group), both Public access. "Create group" button available.

### 12. Delete a group
**Status:** EXPLORED
**Path:** /ac/groups → select group → DELETE GROUP
**Findings:** Per-group action "DELETE GROUP" available. Also bulk "Delete groups" button.

### 13. Add members to a group
**Status:** EXPLORED
**Path:** /ac/groups → select group → Add members
**Findings:** Per-group action "Add members" visible. Also "Manage members" for editing existing membership.

### 14. Edit group settings (access type, permissions)
**Status:** EXPLORED
**Path:** /ac/groups → select group → Edit settings
**Findings:** Per-group action "Edit settings" available. Groups show access type (Public).

### 15. Inspect groups (audit membership)
**Status:** EXPLORED
**Path:** /ac/groups → Inspect groups button
**Findings:** "Inspect groups" button available in groups list header.

---

## Category 3: Organizational Units (4 tasks)

### 16. Create an organizational unit
**Status:** EXPLORED
**Path:** /ac/orgunits → Create organizational unit button
**Findings:** OUs page at `/ac/orgunits` shows 6 units: mike-wolf.com (root), Everyone, Just Mike, Test Department, plus 2 unnamed child OUs. "Create organizational unit" button and search available.

### 17. Edit an organizational unit
**Status:** EXPLORED
**Path:** /ac/orgunits → select OU → Edit
**Findings:** Per-OU "Edit" action available in each row.

### 18. Delete an organizational unit
**Status:** EXPLORED
**Path:** /ac/orgunits → select OU → Delete
**Findings:** Per-OU "Delete" action available in each row.

### 19. Move users between organizational units
**Status:** EXPLORED
**Path:** /ac/users → select user(s) → Change OU
**Findings:** Available as per-user action "Change organizational unit" and bulk action "Change OU" from users list.

---

## Category 4: Apps & Services Management (6 tasks)

### 20. View Google Workspace service status
**Status:** EXPLORED
**Path:** /ac/appslist/core
**Findings:** 11 Workspace services listed, all "On for everyone": AppSheet, Calendar, Drive and Docs, Gmail, Google Chat, Google Meet, Google Voice, Groups for Business, Keep, Sites, Tasks. Can turn OFF/ON per service. Services filterable by OU.

### 21. Configure Gmail settings
**Status:** NOT STARTED
**Path:** /ac/appslist/core → Gmail → settings
**Notes:** Gmail routing/settings page returned 400 at `/ac/apps/gmail/defaultrouting`. Needs sidebar click navigation to reach sub-settings.

### 22. Configure Google Drive sharing settings
**Status:** NOT STARTED
**Path:** /ac/appslist/core → Drive and Docs → Sharing settings
**Notes:** Drive sharing controls (external sharing, link sharing defaults) accessible via service detail page.

### 23. Configure Google Meet settings
**Status:** NOT STARTED
**Path:** /ac/appslist/core → Google Meet → settings
**Notes:** Meeting recording, streaming, and attendance tracking settings.

### 24. Manage additional Google services (63 services)
**Status:** EXPLORED
**Path:** /ac/apps → Additional Google services
**Findings:** Apps overview shows "63 Services" under Additional Google services (Blogging, photos, video, social tools and more).

### 25. Manage web and mobile apps (SAML/Android/iOS)
**Status:** EXPLORED
**Path:** /ac/apps → Web and mobile apps
**Findings:** "Manage SAML, Android and iOS apps" link visible. No apps currently configured.

---

## Category 5: Security (8 tasks)

### 26. Configure 2-Step Verification
**Status:** EXPLORED
**Path:** /ac/security → 2-Step Verification
**Findings:** Security page at `/ac/security` shows "2-Step Verification: Configure 2-Step Verification policies" as a configurable item.

### 27. Manage password policies
**Status:** EXPLORED
**Path:** /ac/security → Password management
**Findings:** "Password management: Configure password policies" visible on security overview.

### 28. Configure passwordless authentication (passkeys)
**Status:** EXPLORED
**Path:** /ac/security → Passwordless
**Findings:** "Skip passwords: Turned off: 'Allow users to skip their password and authenticate with a passkey'". Passkeys Restriction: "Allow passkeys on any device or platform". Applied at mike-wolf.com.

### 29. Set up SSO with third-party IdP
**Status:** EXPLORED
**Path:** /ac/security → Set up single sign-on (SSO) with a third party IdP
**Findings:** Both SAML SSO (Google as IdP) and third-party IdP SSO configuration sections visible. SSO profile activity noted in alerts (added/updated/deleted 3/1/24).

### 30. Configure Advanced Protection Program
**Status:** EXPLORED
**Path:** /ac/security → Advanced Protection Program
**Findings:** "Enrollment: Allow users to enroll in the Advanced Protection Program: Enable user enrollment, Security codes: Allow security codes without remote access". Applied at mike-wolf.com.

### 31. Manage API controls (OAuth, domain-wide delegation)
**Status:** EXPLORED
**Path:** /ac/security → API controls
**Findings:** "Manage OAuth access to third party apps, and manage Domain wide delegation" visible on security page.

### 32. Configure Google session control
**Status:** EXPLORED
**Path:** /ac/security → Google session control
**Findings:** "Set session duration for Google core and additional services, such as Gmail and Docs." Also Device Bound Session Credentials (DBSC) Beta: Turned off.

### 33. View and manage Alert Center
**Status:** EXPLORED
**Path:** /ac/security → Alert center
**Findings:** "View important and actionable notifications about potential security issues within your domain." Alert center is a sub-section of Security. 4 alerts visible on home dashboard (Google Operations notifications from 2024).

---

## Category 6: Device Management (5 tasks)

### 34. View all managed devices
**Status:** EXPLORED
**Path:** /ac/devices/list
**Findings:** 40+ devices listed with columns: Device Name, Name (user), Email, OS, Ownership, First Sync, Last Sync, Status. Mix of macOS, Android, iOS, Linux, ChromeOS devices. All "User owned", all "Approved".

### 35. Approve/block a device
**Status:** EXPLORED
**Path:** /ac/devices/list → Approve Devices / Block Devices buttons
**Findings:** Bulk actions: Approve Devices, Stop, Unenroll Devices, Delete Devices, Lock Devices, Sign Out User, Reset Device Passwords, Wipe Devices, Unblock Devices. Filter support with keyword/serial search.

### 36. Wipe a device (account or full)
**Status:** EXPLORED
**Path:** /ac/devices/list → select device → Wipe Account / Wipe Device
**Findings:** Per-device actions vary by OS: "Wipe Account" for mobile, "Sign Out User" for macOS/desktop. "Delete Device" available for all.

### 37. View device audit info
**Status:** EXPLORED
**Path:** /ac/devices/list → select device → View Audit Info
**Findings:** "View Audit Info" action available on every device row.

### 38. Manage Chrome Enterprise browsers
**Status:** EXPLORED
**Path:** Home dashboard → Chrome Enterprise card
**Findings:** Chrome Enterprise section shows: 1 enrolled browser, 0 managed profiles. Actions: Enroll a browser, Configure browser policies, Manage extensions, Detect sensitive data transfers.

---

## Category 7: Billing & Subscriptions (4 tasks)

### 39. View subscriptions
**Status:** EXPLORED
**Path:** /ac/billing/subscriptions
**Findings:** 3 subscriptions: Chrome Enterprise Core (Active, Free), Domain Registration (Active, Annual Plan), G Suite legacy (Active, Free, 25 licenses available/assigned). Upgrade to Google Workspace Business Starter offered.

### 40. Manage payment accounts
**Status:** EXPLORED
**Path:** /ac/billing/subscriptions → Payment accounts (sidebar)
**Findings:** "Payment accounts" link visible in billing sidebar navigation along with "Buy or upgrade" and "License settings".

### 41. Assign or remove licenses
**Status:** EXPLORED
**Path:** /ac/users → select users → Assign licenses / Remove Licenses
**Findings:** Bulk actions "Assign licenses" and "Remove Licenses" available from users list. G Suite legacy has 25 licenses.

### 42. Upgrade subscription plan
**Status:** EXPLORED
**Path:** /ac/billing/subscriptions → Upgrade button
**Findings:** "You are on the G Suite legacy free edition. Consider upgrading to Google Workspace Business Starter." Upgrade button visible.

---

## Category 8: Domain Management (3 tasks)

### 43. Add a secondary domain
**Status:** EXPLORED
**Path:** /ac/domains/manage → Add a domain button
**Findings:** Domains page shows primary domain mike-wolf.com (Verified, Gmail activated with MX records) and test alias mike-wolf.com.test-google-a.com (Inactive). "Add a domain" and "Change primary domain" buttons available.

### 44. Verify domain ownership
**Status:** EXPLORED
**Path:** /ac/domains/manage → domain row → View Details
**Findings:** Primary domain mike-wolf.com shows "Verified" status. Per-domain actions: View Details, Change redirect, Add Users.

### 45. Manage domain aliases and allowlisted domains
**Status:** EXPLORED
**Path:** /ac/domains/manage → Allowlisted domains tab
**Findings:** Sidebar shows "Allowlisted domains" as a sub-section under Domains. Test domain alias exists but inactive.

---

## Category 9: Admin Roles & Delegation (3 tasks)

### 46. View and assign admin roles
**Status:** EXPLORED
**Path:** /ac/roles
**Findings:** 11 system roles: Super Admin, Groups Admin, User Management Admin, Help Desk Admin, Services Admin, Groups Reader, Groups Editor, Inventory Reporting Admin, Google Workspace Migrate, Drive Admin, Storage Admin, Mobile Admin. Per-role actions: Assign Admin, View Privileges, View Admins.

### 47. Create a custom admin role
**Status:** EXPLORED
**Path:** /ac/roles → Create new role button
**Findings:** "Create new role" button visible. Note: "You can now assign admin roles to security groups as well as users."

### 48. View role privileges
**Status:** EXPLORED
**Path:** /ac/roles → select role → View Privileges
**Findings:** "View Privileges" action available on each role row to inspect what permissions it grants.

---

## Category 10: Storage & Reporting (2 tasks)

### 49. View and manage storage usage
**Status:** EXPLORED
**Path:** /ac/storage
**Findings:** 206.68 GB of 539 GB shared used. Breakdown: Google Drive 13.4 GB, Google Photos 179.93 GB, Gmail 10.05 GB, Other 3.3 GB, Available 332.33 GB. Top users: Mike Wolf 183.25 GB, Photo Backup 14.63 GB, Family Archives 8.72 GB. Storage settings link for managing limits by OU/group/user.

### 50. View account dashboard and alerts
**Status:** EXPLORED
**Path:** /ac/dashboard
**Findings:** Dashboard shows 1 insight/alert about secondary email address (mw.personalmail@gmail.com) for account notifications. "Review address" action with Update/Cancel/Confirm options.

---

## Summary

| Status | Count |
|--------|-------|
| VALIDATED | 0 |
| EXPLORED | 47 |
| NOT STARTED | 3 |
| **Total** | **50** |

### Pages Successfully Explored
| Page | URL | Key Findings |
|------|-----|-------------|
| Home | / | 23 active users, dashboard cards, tools section |
| Users | /ac/users | 20+ users, per-user actions, bulk actions, OU filter |
| Groups | /ac/groups | 2 groups, create/delete/manage members |
| Org Units | /ac/orgunits | 6 OUs, create/edit/delete |
| Apps Overview | /ac/apps | 11 Workspace services, 63 additional, SAML/mobile apps |
| Apps Core | /ac/appslist/core | All 11 services ON, per-OU control |
| Security | /ac/security | Password, 2FA, SSO, passkeys, API controls, sessions, encryption |
| Devices | /ac/devices/list | 40+ devices, approve/wipe/block, multi-OS |
| Billing | /ac/billing/subscriptions | 3 subscriptions, G Suite legacy free, 25 licenses |
| Account | /ac/accountsettings | Profile (Mike Wolf, C01uog30p), preferences, legal |
| Admin Roles | /ac/roles | 11 system roles, create custom |
| Storage | /ac/storage | 206.68/539 GB used, per-service breakdown |
| Domains | /ac/domains/manage | mike-wolf.com primary, test alias |
| Dashboard | /ac/dashboard | Insights, alert about secondary email |

### Pages That 404'd (need sidebar click navigation)
- /ac/devices (works at /ac/devices/list)
- /ac/reporting
- /ac/billing (works at /ac/billing/subscriptions)
- /ac/generativeai
- /ac/data
- /ac/rules
- /ac/chrome (redirects to home)

### Framework Notes
- Google Material Design (Polymer/Lit-based) — heavy JS rendering
- Sidebar navigation uses custom Google components, not standard `<a>` tags
- Many pages require specific sub-paths (e.g., `/ac/devices/list` not `/ac/devices`)
- `[role='main']` and `[role='navigation']` selectors work well for content extraction
- Some pages (Gmail settings) return 400 — need click-through navigation from parent
