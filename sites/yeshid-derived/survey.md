# YeshID Site Survey
**Derived:** 2026-04-15 via pageScan (Yeshie relay, build 329)  
**Method:** Navigate + pageScan() per page — no Claude in Chrome, no manual inspection  
**Base URL:** https://app.yeshid.com  
**Framework:** Vue 3 + Vuetify 3  

---

## Navigation Structure

All pages share a left sidebar with these links (confirmed from every page scan):

| Nav Label | href | Notes |
|-----------|------|-------|
| Home | /overview | Dashboard |
| Workflows | /workflows | Active workflow queue |
| My Apps | /my-applications | User's own apps |
| Requested Apps | /requested-applications | Pending app requests |
| People | /organization/people | People roster |
| Directories | /organization/directories | Directory sources (Google Workspace etc) |
| Groups | /organization/groups | Group management |
| Applications | /access/applications | All managed SaaS apps |
| Access Grid | /access/grid | People × apps matrix |
| RBAC | /access/rbac | Role-based access control (BETA) |
| Access Requests | /access/requests | Incoming access requests queue |
| Audit Campaigns | /access/audits-v2 | Access audit campaigns |
| Shadow applications | /security/shadow | Unmanaged apps from SSO logs |
| Identities | /security/identities/applications | App-linked identities |
| Access Drift | /security/access-drift | Unauthorized access changes |
| Non-human IDs | /security/identities/nhi | Service accounts, bots (BETA) |
| Risk Assessment | /security/risk-assessment | Risk posture scores |
| Triggers | /manage/triggers | Event-driven automation |
| Workflow Templates | /workflow-templates | Onboarding/offboarding templates |
| Policies | /policies | Compliance rules (BETA) |
| Events | /events | Full activity event log |
| Settings | /manage/settings | Org settings (→ /manage/settings/general) |

---

## Pages

### /overview — Dashboard
**pageType:** dashboard  
**title:** Overview | YeshID  

**Buttons:** View all, Staged, In Progress, Pending  
**data-cy elements:**
- `[data-cy="username"]` — logged-in user display name (Mike Wolf)

**Key stat:** "Active people in YeshID" — readable via `statByLabel('Active people in YeshID')` (text-anchored, walks next sibling for integer)

**Notes:** Shows workflow status counts (Staged / In Progress / Pending) and active people count. Home bookend target: navigate here first and last to capture stat delta.

---

### /organization/people — People List
**pageType:** list  
**title:** People | YeshID  

**Buttons:** Onboard person, People, Settings, Clear all  
**data-cy elements:**
- `[data-cy="add-user-btn"]` button → "Onboard person" — primary CTA to start onboard flow
- `[data-cy="user-table"]` div (contains input for search/filter) — the people table wrapper
- `[data-cy="username"]` div — one per person row (name display)
- `[data-cy="user-menu-btn-{slug}"]` button — per-row kebab menu (e.g. `user-menu-btn-another.test`)

**Notes:** Table shows paginated list. Search input is inside `[data-cy="user-table"]` — it's an autocomplete/dropdown, NOT a table filter. Use `find_row` only on rendered rows. Clicking "Onboard person" button navigates to `/organization/people/onboard`.

**Selector for Onboard button:** `[data-cy="add-user-btn"]`

---

### /organization/people/onboard — Onboard Form (DEEP SCAN)
**pageType:** form  
**title:** YeshID | YeshID  
**URL after nav:** /organization/people/onboard  

**Buttons:** Select start date, Select end date, Save Changes, Initial directory, Domain: mike-wolf.com, Day(s) before start date, Start date, Add task, Create and onboard person

**data-cy form fields (all confirmed):**

| data-cy value | field label | input type | selector |
|---------------|-------------|------------|----------|
| first-name-input | First name | text | `[data-cy="first-name-input"] input` |
| last-name-input | Last name | text | `[data-cy="last-name-input"] input` |
| company-email-input | Company email address | text | `[data-cy="company-email-input"] input` |
| recovery-email-input | Personal / recovery email address | text | `[data-cy="recovery-email-input"] input` |
| schedule-user-activator | — | button | `[data-cy="schedule-user-activator"]` (TWO: start date + end date) |
| Onboarding-template-select | Select template | text (autocomplete) | `[data-cy="Onboarding-template-select"] input` |

**Non-data-cy fields (no stable selector):**
- "Schedule this person to be onboarded" — checkbox (no data-cy)
- "Start date and time (America/Denver)" — label only, no input data-cy
- "End date reminder (America/Denver)(Optional)" — label only

**Submit button:** "Create and onboard person" — `[data-cy="add-user-btn"]` OR button text match

**Success signal:** Redirects to `/workflows/{UUID}` (NOT `/organization/people`). Watch for URL containing `/workflows/` after submit.

**Domain hint:** Company email field shows "@mike-wolf.com" suffix hint inline.

---

### /workflows — Workflow Queue
**pageType:** list  
**title:** Workflows | YeshID  
**URL (with filters):** /workflows/?filters=(workflow-status += "STAGED" OR ...)  

**Buttons:** View: Workflows, Start a Workflow, Clear all, Select workflows  
**data-cy:** `[data-cy="username"]` appears 3× (workflow assignees in rows)

**Notes:** Default view filters to active statuses (STAGED, PENDING, IN_PROGRESS). "Start a Workflow" button manually triggers a workflow. Each row links to `/workflows/{UUID}`.

---

### /organization/directories — Directory Sources
**pageType:** list  
**title:** Directory | YeshID  
**URL after nav:** /organization/directories/{uuid}  

**Buttons:** Sync directory, Add Directory, Identities (34), Groups (2), Organizational units (6), Settings, Clear all  
**data-cy:** `[data-cy="username"]` per identity row (10 visible per page)

**Notes:** Redirects to a specific directory UUID. Shows Google Workspace directory. Tabs: Identities (34), Groups (2), Org units (6). "Sync directory" button triggers manual sync.

---

### /organization/groups — Groups
**pageType:** list  
**title:** Groups | YeshID  

**Buttons:** New Group, Clear all  
**Notes:** Group list with "New Group" CTA. 10 per page.

---

### /access/applications — Applications List
**pageType:** list  
**title:** Access Accounts | YeshID  

**Buttons:** Import application list, Add application, Clear all  
**Notes:** Shows all managed SaaS applications. "Add application" for new apps. "Import application list" for bulk import.

---

### /access/requests — Access Requests Queue
**pageType:** list  
**title:** Access | YeshID  

**data-cy:**
- `[data-cy="access-requests"]` div (contains input) — table wrapper with columns: Type, Request Date, Requester, Requester Note, Status
**Buttons:** Clear all  

**Notes:** Incoming access requests. Table has filter/search inside `[data-cy="access-requests"]`.

---

### /access/audits-v2 — Audit Campaigns
**pageType:** detail  
**title:** YeshID | YeshID  

**Buttons:** Campaigns, Templates  
**Notes:** Two tabs: Campaigns (active audits) and Templates. No data-cy on main content elements. Empty state when no campaigns running.

---

### /security/shadow — Shadow Applications
**pageType:** list  
**title:** Security | YeshID  
**URL after nav:** /security/shadow/applications  

**Buttons:** All, Neutral, Sensitive, Restricted, Clear all, Add as managed application, Revoke access, Users, Scopes  
**Notes:** Shows OAuth-connected apps from SSO logs that aren't managed. Risk classification: Neutral / Sensitive / Restricted. Actions per app: "Add as managed application" or "Revoke access". Sub-tabs: Users, Scopes.

---

### /manage/triggers — Triggers
**pageType:** list  
**title:** YeshID | YeshID  

**Buttons:** Clear all, New Trigger  
**Notes:** Event-driven automation rules. "New Trigger" to create. 10 per page.

---

### /workflow-templates — Workflow Templates
**pageType:** list  
**title:** Workflow Templates - YeshID | YeshID  

**Buttons:** New Template, All templates, Onboarding, Offboarding, New Application Request  
**Notes:** Template library filtered by type. 25 per page. "New Template" to create custom templates.

---

### /events — Event Log
**pageType:** list  
**title:** Events | YeshID  

**data-cy:**
- `[data-cy="event-table"]` div (contains input) — table wrapper with columns: Event Time, Actor, Event Type, Target, Severity (4 visible filter chips)
**Buttons:** Clear all  

**Notes:** Full audit log. Searchable/filterable. 10 per page.

---

### /manage/settings/general — Settings
**pageType:** form  
**title:** YeshID | YeshID  
**URL after nav:** /manage/settings/general  

**Buttons:** Delete account  
**Fields (no data-cy — use label text):**

| label | type | placeholder |
|-------|------|-------------|
| Company Name | text | — |
| Support Contact | text | "Search by name or email..." |
| Organization default timezone | text | — |
| Integration and directory sync preferred time (Optional) | text | "No preference (default)" |

**data-cy:** `[data-cy="-label"]` span — logged-in user name label (appears to be a nav item)

**Notes:** Settings has sub-sections (general, notifications, customize, billing, admins) accessed via sub-nav. No data-cy on form fields — target by adjacent label text.

---

## data-cy Catalog (All Confirmed)

| data-cy value | element | page | meaning |
|---------------|---------|------|---------|
| add-user-btn | button | /organization/people | "Onboard person" primary CTA |
| user-table | div+input | /organization/people | People table wrapper |
| username | div | every page | Logged-in user display / row names |
| user-menu-btn-{slug} | button | /organization/people | Per-row kebab menu (slug = email prefix) |
| first-name-input | div+input | /onboard | First name field |
| last-name-input | div+input | /onboard | Last name field |
| company-email-input | div+input | /onboard | Company email field |
| recovery-email-input | div+input | /onboard | Personal/recovery email field |
| schedule-user-activator | button | /onboard | Start date picker (×2: start + end) |
| Onboarding-template-select | div+input | /onboard | Template selector (autocomplete) |
| access-requests | div+input | /access/requests | Access requests table |
| event-table | div+input | /events | Events table |

**Selector pattern for field inputs:** `[data-cy="X"] input`  
**Selector pattern for buttons:** `[data-cy="X"]` (already a button element)

---

## Payload Coverage Analysis

| Action | URL | Payload exists? | Status |
|--------|-----|-----------------|--------|
| Onboard person | /organization/people/onboard | 01-user-add.payload.json | ✅ All data-cy confirmed |
| Offboard/deactivate | /organization/people (row kebab) | 02-user-delete.payload.json | ⚠️ user-menu-btn-{slug} pattern confirmed |
| Sync directory | /organization/directories | 08-sync-directory.payload.json | ✅ "Sync directory" button confirmed |
| Create group | /organization/groups | 09-create-group.payload.json | ⚠️ No data-cy on form — needs deep scan |
| Add application | /access/applications | 10-add-application.payload.json | ⚠️ No data-cy on add form — needs deep scan |
| Start audit | /access/audits-v2 | 11-start-audit.payload.json | ⚠️ No data-cy, Campaigns/Templates tabs only |
| View access grid | /access/grid | 12-view-access-grid.payload.json | ⚠️ Not scanned (heavy viz page) |
| View events | /events | 13-view-events.payload.json | ✅ event-table data-cy confirmed |
| View workflows | /workflows | — | ✅ Redirect to /workflows/{UUID} on onboard success |

---

## Key Findings

1. **Onboard form fully instrumented** — all 4 text inputs have data-cy. Submit button is "Create and onboard person". Success redirects to `/workflows/{UUID}`, not `/organization/people`.

2. **Per-row kebab pattern** — `[data-cy="user-menu-btn-{email-slug}"]` where slug is the email prefix (e.g. `user-menu-btn-another.test`). Useful for offboard/modify payloads.

3. **Directory redirects to UUID** — `/organization/directories` immediately redirects to `/organization/directories/{uuid}`. Payloads should navigate there directly or follow redirect.

4. **Shadow apps at sub-path** — `/security/shadow` redirects to `/security/shadow/applications`.

5. **Settings at sub-path** — `/manage/settings` redirects to `/manage/settings/general`.

6. **Workflow Templates filters** — template types: Onboarding, Offboarding, New Application Request.

7. **No data-cy on Settings fields** — target by label text only. Same for Groups create form and Add Application form (need deep scans).

8. **statByLabel confirmed working** — use `statByLabel('Active people in YeshID')` on /overview to get numeric count for bookend verification.
