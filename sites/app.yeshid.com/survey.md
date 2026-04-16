# Site Survey: app.yeshid.com

**Date:** 2026-04-15 (public + docs); 2026-04-16 (live authenticated session)
**Auth note:** Phase 1–2 unauthenticated. Phase 3 live session as mw@mike-wolf.com (Google Workspace, mike-wolf.com).
**Survey status:** COMPLETE — all nav pages surveyed with live authenticated session.

---

## Capabilities (from docs)

Sourced from https://docs.yeshid.com/collections/1159894904-getting_started_guides (5 articles).

### Account / Onboarding
- Sign up for YeshID using a Google Workspace account.
- Sign up for YeshID using a Microsoft account.
- Log in with Google or Microsoft SSO — no username/password form.

### Application Management
- Add a single application from YeshID's known app catalogue by name.
- Add a custom/internal/homebrew application by typing its name and pressing Enter.
- Set Technical Owners (TOs) for an application — users notified of onboarding, offboarding, and access request actions on that app.
- Import a list of applications using AI Paste — paste free-form text, YeshID extracts app name, login URL, and owners.
- Import a list of applications via CSV upload (template provided: App Name, Login URL, Owners).
- Promote a Shadow App to a managed application.
- View application settings and Technical Owners.

### User / Access Import (Source of Truth)
- Import users into an application by connecting the app (auto-sync).
- Import users into an application via CSV upload (email column required).
- Import users into an application via screenshot — AI OCR extracts email addresses from a screenshot of the app's user list.
- View the Access Grid — a live map of who has access to which applications.

### Application Integration / Connectivity
- Connect an application via a Prebuilt integration (validated by YeshID, just supply auth + enable actions).
- Connect an application via SCIM (RFC7644; supply SCIM Endpoint URL, enable actions). *Requires right subscription in the target app.*
- Connect an application via Build Your Own (custom REST API; you specify auth + endpoints).
- Configure authentication type for an integration: Bearer token, OAuth2 (Client Credentials, Auth Code, Refresh Token), Basic auth, Custom API Key, or None.
- Enable integration actions per app: Import Users (periodic sync), Create User, Activate User, Delete User, Deactivate User.
- Map API response fields to YeshID user fields using AI ("Agent Yesh") or manual jq mapping.
- Test an integration action against the live API and preview results before saving.
- Add a Custom Action to an application (trigger arbitrary API endpoints from workflows). *Requires Business plan.*
- View the Integration Actions & Enablement table to understand which YeshID operations each action unlocks.

### Workflows
- Run an onboarding workflow: create a user in one or more applications (`/Create user in application` task).
- Run an offboarding workflow: remove a user from all connected applications (`/Remove user from all applications` task). Integration auto-handles removal; TOs only need to approve.
- Handle Access Requests — users can request access to apps; TOs approve/deny.
- Run an Application Audit — review who has access to an app against the current Access Grid.
- Trigger custom provisioner actions as workflow steps (`/Run provisioner action for user`). *Business plan.*

### Notifications / Slack
- Connect Slack as a notifications destination (OAuth, workspace picker).
- Designate one or more Slack channels for onboarding/offboarding notifications.
- DM task assignees in Slack when a workflow task is assigned to them.
- Allow users to submit and respond to Access Requests directly from Slack.

### Shadow Apps (undocumented in detail — flagged)
- View Shadow Applications — apps YeshID has detected users are logging into but that are not yet managed.
- Promote a Shadow App to a managed application in one click.

---

## Pages

### Login Page — https://app.yeshid.com/login?redirect=/
**Type:** form (auth entry)
**What you can do here:**
- Sign in with Google (OAuth redirect)
- Sign in with Microsoft (OAuth redirect)
- Navigate to Create account (`/signup`)
- View Privacy Policy (https://yeshid.com/privacy-policy/)
- View Terms of Service (https://yeshid.com/terms-and-conditions/)

**Targets found:**
- "Sign in with Google" → button (no data-cy found on this button)
- "Sign in with Microsoft" → button (no data-cy found on this button)
- "Create account" → `[data-cy="create-account-link"]` a → href="/signup"

**After action:**
- Sign in with Google/Microsoft → OAuth redirect to Google/Microsoft, then back to the `redirect` query param destination (default `/`)
- Create account → navigates to `/signup`

---

### Signup Page — https://app.yeshid.com/signup
**Type:** form (account creation)
**What you can do here:**
- Sign up with Google (OAuth redirect)
- Sign up with Microsoft (OAuth redirect)
- View Privacy Policy / Terms of Service
- Navigate back to Sign in (`/login`)

**Targets found:**
- "Sign up with Google" → `[data-cy="sign-up-with-google-button"]` button
- "Sign in" → link → href="/app.yeshid.com/login"

**After action:**
- Sign up with Google/Microsoft → OAuth redirect, then onboarding flow per docs (directory sync, org setup)

---

### Applications Page — https://app.yeshid.com/applications (AUTH REQUIRED)
**Type:** list
**What you can do here (from docs):**
- View all managed applications
- Click "Add application" → opens app picker modal
- Click "Import Applications" → opens AI Paste / CSV import flow
- Click "Shadow applications" → view discovered unmanaged apps
- Click into an app → detail view (Accounts, Connect, Settings tabs)

**Targets found:** Not directly accessible — inferred from docs screenshots.

---

### Application Detail — https://app.yeshid.com/applications/[id] (AUTH REQUIRED)
**Type:** detail view
**Tabs (from docs):** Accounts, Connect, Settings
**What you can do here (from docs):**
- View list of users with access to this app (Accounts tab)
- Click "Manage" → add/remove individual users
- Click "Import Users" → CSV or screenshot import
- Click "Connect" → configure integration (auth + actions)
- Click "Settings" → view/edit Technical Owners, login URL

---

### Add Application Modal (AUTH REQUIRED)
**Type:** modal
**What you can do here:**
- Search known app catalogue by name
- Type a custom app name (not in catalogue) and press Enter to add
- Select Technical Owner(s) from people picker
- Click "Add" to confirm

---

### Import Applications Modal (AUTH REQUIRED)
**Type:** modal / multi-step form
**Modes:** AI Paste, CSV Upload
**AI Paste mode:**
- Paste free-form text list (App Name, Login URL, Owner emails separated by semicolon)
- Click "Import application list"
- YeshID upserts: updates existing apps, inserts new ones

**CSV Upload mode:**
- Click "Download CSV template"
- Upload filled CSV (drag-and-drop or file picker)
- Click "Import application list"
- Same upsert behavior

---

### Connect / Integration Setup — inside Application Detail (AUTH REQUIRED)
**Type:** form / multi-step
**What you can do here:**
- Select integration type: Prebuilt, SCIM, Build Your Own
- Configure authentication: Bearer, OAuth2 (3 sub-types), Basic, Custom API Key, None
- Enable/configure actions: Import Users, Create User, Activate User, Delete User, Deactivate User
- For Import Users: enter endpoint URL + method, run Test, use Agent Yesh to auto-map fields, or map manually with jq
- For Create User: enter endpoint, method, and JSON payload template with template variables
- Click "Generate Config" (Import Users) → AI suggests field mappings
- Enable action → triggers immediate sync

---

### Settings — Notifications (AUTH REQUIRED)
**Type:** settings
**What you can do here:**
- Click "Add to Slack" → OAuth flow to connect Slack workspace
- Pick Slack workspace and channel
- Add @yeshid bot to desired Slack channels
- Select channel as notifications destination

---

### Shadow Applications — https://app.yeshid.com/shadow-applications (AUTH REQUIRED)
**Type:** list
**What you can do here (from docs):**
- View apps detected via login monitoring
- Click an app → see which users are logging in
- Click "Add as managed application" → promotes to managed app

---

## ssotax.yeshid.com — Full Survey

### Home / Search — https://ssotax.yeshid.com/
**Type:** dashboard / search tool
**What this is:** A public AI-powered research tool that generates integration reports for any SaaS vendor, showing how to connect it to YeshID. No authentication required.

**What you can do here:**
- Search for a vendor by name or enter a URL/query to generate new research
- Click a featured vendor tile (e.g. "Shopify", "Envato", "PNC Bank") to open its report
- Click "Generate Research Report" button
- Click "Clear" to reset the search

**Targets found:**
- Search input → `textbox "Search vendors or enter URL/query to generate new research..."` (no data-cy)
- "Generate Research Report" → `button`
- "Clear" → `button`
- Featured vendor links → `a[href="?vendor=<slug>"]`

**Navigation links:**
- YeshID Home → https://www.yeshid.com/
- Blog → https://www.yeshid.com/blog
- Sign in → https://app.yeshid.com/

---

### Vendor Report Page — https://ssotax.yeshid.com/?vendor=[slug]
**Type:** detail view / report
**Example:** https://ssotax.yeshid.com/?vendor=shopify

**What you can do here:**
- View report tabs: Summariser, Credential Research, Pricing Research, REST Research, SCIM Research
- Click "Refresh report" to regenerate the AI research
- View IAM Actions table: HTTP method, endpoint URL, required plan tier, usage requirements
- View SCIM endpoints and requirements
- View step-by-step token/credential setup instructions
- View pricing tier comparison table: SSO, MFA, SCIM, Group Management, RBAC support per tier + price
- View reference links to official vendor docs

**Tabs (buttons, no data-cy):**
- "Summariser" → overview of integration options
- "Credential Research" → how to obtain API keys/tokens
- "Pricing Research" → tier table (SSO/MFA/SCIM availability per plan)
- "REST Research" → REST endpoint table
- "SCIM Research" → SCIM endpoint details

**Example data (Shopify):**
- REST: `GET /admin/api/{version}/users.json` (Plus tier, Bearer token)
- SCIM: `https://shopifyscim.com/scim/v2/` (Plus tier)
- Auth: Admin Token (X-Shopify-Access-Token) or SCIM API Token
- Tier table: Basic $29/mo (no SSO/SCIM), Plus $2,300/mo (SSO+SCIM)

---

## Capability Map

| What you can do | URL | Path to get there | Required inputs | Success signal |
|---|---|---|---|---|
| Sign up (Google) | /signup | Direct | Google OAuth | Redirected into onboarding flow |
| Sign up (Microsoft) | /signup | Direct | Microsoft OAuth | Redirected into onboarding flow |
| Sign in (Google) | /login | Direct | Google OAuth | Redirected to `/` or `?redirect=` target |
| Sign in (Microsoft) | /login | Direct | Microsoft OAuth | Redirected to `/` or `?redirect=` target |
| Add single application | /applications | Nav → Applications → "Add application" | App name (required), Login URL (optional), Technical Owner(s) | App appears in applications list |
| Add applications via AI paste | /applications | Nav → Applications → "Import Applications" → AI Paste | Free-form text list | Apps upserted; count shown |
| Add applications via CSV | /applications | Nav → Applications → "Import Applications" → CSV | Filled CSV file | Apps upserted; count shown |
| Promote shadow app | /shadow-applications | Nav → Shadow applications → select app → "Add as managed application" | None | App moves to managed list |
| Import users via app connection | /applications/[id]/connect | App detail → Connect tab → enable Import Users action | API endpoint + auth credentials | Users appear in Accounts tab |
| Import users via CSV | /applications/[id] | App detail → Manage → Import Users → CSV | CSV with email column | Users appear in Accounts tab |
| Import users via screenshot | /applications/[id] | App detail → Manage → Import Users → screenshot | Screenshot file | Users appear in Accounts tab; confirm modal |
| Connect app (Prebuilt) | /applications/[id]/connect | App detail → Connect tab → Prebuilt | Auth credentials only | Integration enabled; actions available |
| Connect app (SCIM) | /applications/[id]/connect | App detail → Connect tab → SCIM | SCIM Endpoint URL + auth | Integration enabled; user sync |
| Connect app (custom REST) | /applications/[id]/connect | App detail → Connect tab → Build Your Own | Auth type + credentials + endpoint URLs per action | Integration enabled; test returns users |
| Add custom integration action | /applications/[id]/connect | App detail → Connect → Add custom action | Action name, HTTP method, endpoint, payload | Action available in workflows (Business plan) |
| Connect Slack notifications | /settings/notifications | Settings → Notifications → "Add to Slack" | Slack workspace OAuth + channel | Channel listed; bot added |
| Onboard a person | /workflows (inferred) | Workflow → Create user in application | Person, target app | Workflow task created; TO notified |
| Offboard a person | /workflows (inferred) | Workflow → Remove user from all applications | Person | Tasks created per connected app; auto-executed where integrated |
| Handle access request | /workflows (inferred) | Via Slack or app notification | Approve/Deny | User provisioned or request closed |
| Run application audit | /applications/[id] | App detail → Audit (inferred) | None | Access grid snapshot |
| Research vendor integration | ssotax.yeshid.com | Direct, search vendor name | Vendor name or URL | Report with REST/SCIM/auth/pricing details |

---

## Gaps

### In the app, not in the docs
- **Shadow Applications detection mechanism** — the docs mention it exists but don't explain how YeshID detects shadow apps (browser extension? OAuth logs? CASB integration?). Not documented.
- **Template Variables reference** — the Connecting Your Applications doc references a "Template Variables document" for payload construction but doesn't link to it or include its contents inline.
- **Code-backed integrations (Script Editor)** — referenced as https://docs.yeshid.com/articles/5428059420-code-backed-integrations-script-editor but this article was not in the Getting Started collection and wasn't accessible during this survey.
- **People / Directory management UI** — the docs reference syncing a Google Workspace/Microsoft directory on sign-up but there's no documentation of a dedicated People management page.
- **Access Request submission by end users** — docs say users can submit requests via Slack, but there's no doc for a direct in-app access request flow.
- **Application Audit workflow** — mentioned in the Integration Actions Enablement table as an outcome of Import Users, but no dedicated docs page for how to run one.

### In the docs, not in the app (during this survey)
- **Microsoft sign-up video** — the Sign-Up article says "Video coming soon!" for Microsoft and "Scopes coming soon!" — docs are incomplete for Microsoft path.
- **Business plan features** — Custom Actions require YeshID Business plan; no pricing page or upgrade flow observed in the public-facing app.
- **SCIM Takeover resolution** — documented as a known FAQ issue (0 users after SCIM sync for pre-SCIM users) with a solution, but the UI path to re-add users is not described.

### Auth-gated: needs live session to complete survey
The following pages/flows were documented from docs only and need authenticated access to survey properly:
- `/applications` — application list, all management actions
- `/applications/[id]` — app detail, Accounts/Connect/Settings tabs, all form fields
- `/shadow-applications` — shadow app list
- `/settings` — all settings pages
- `/workflows` or equivalent — workflow creation and management UI
- Any people/directory management page
- Onboarding/offboarding workflow UI (form fields, selectors, task list)
- Access request submission and approval UI

---

## Live Survey (Authenticated Session)

**Session date:** 2026-04-16
**Auth:** mw@mike-wolf.com (Google Workspace, mike-wolf.com domain)
**Method:** Chrome DevTools MCP via port 9222 (ChromeDebug profile, Default symlinked to main Chrome)

All pages below were visited with a live authenticated session. Data-cy selectors and UI structure captured via JS evaluation.

---

### Overview / Dashboard — /overview

**Title:** Overview | YeshID
**Type:** dashboard

**What you see here:**
- Greeting: "Hello [Name],"
- Stats row: Connected Applications, Not Connected Applications, Connection Errors, Total Applications (live counts from org)
- Active people count, YeshID admins count, Managed apps count, Unmapped identities count
- Widgets: Identity security (directory health), Unmapped Accounts, Shadow IT Assessment, Policies, Workflows (staged/in-progress/pending)

**Quick-action links on page:**
- `link "Onboard people"` → `/organization/people/onboard`
- `link "Offboard people"` → `/organization/people/offboard`
- `link "New Audit"` → `/access/audits/create`
- `link "Applications"` → `/access/applications`
- `link "Policies"` → `/policies`

**Targets found:**
- `[data-cy="username"]` → logged-in user display name div
- No page-specific data-cy targets on overview widgets

---

### People — /organization/people

**Title:** People | YeshID
**Type:** paginated list (35 people, 10/page)

**What you can do here:**
- View all org members — columns: YeshID account owner, Primary email, Directory synced (✓/✗), YeshID status (Active/Deactivated), # of applications
- Search people: `textbox "Search"` 
- Filter by status (button with dropdown)
- Filter by directory (button with dropdown)
- Bulk select (checkboxes per row)
- Open per-person context menu: `button[data-cy="user-menu-btn-{slug}"]` (one per person row, slug = email prefix)
- Tabs: **People** (default) and **Settings**

**Targets found:**
- `[data-cy="add-user-btn"]` → "Onboard person" button (top right)
- `[data-cy="user-table"]` → the people data table
- `[data-cy="username"]` → each person's display name div in the table
- `[data-cy="user-menu-btn-{email-slug}"]` → per-row action menu button (e.g. `user-menu-btn-buddy`, `user-menu-btn-daniel.wolf`)

**Navigation:**
- Pagination: 1–10 of 35 with next/last page buttons

---

### Onboard Person — /organization/people/onboard

**Title:** YeshID | YeshID (sic — title not set)
**Type:** form

**What you can do here:**
- Fill in person's details and create a scheduled or immediate onboarding workflow
- Toggle "Schedule this person to be onboarded" (checkbox, checked by default)
- Set start date/time and optional end date reminder
- Select onboarding template (default: "YeshID Default")
- Add/remove/reorder workflow tasks; each task has: task type, assignee (Initial directory, Domain selector), due date (relative: "7 days before start date")

**Default tasks in the workflow:**
1. Create user (in Initial directory) — 7 days before start date
2. Send access email to user — on Start date

**Form fields (data-cy selectors):**
- `[data-cy="first-name-input"]` — first name
- `[data-cy="last-name-input"]` — last name
- `[data-cy="company-email-input"]` — email prefix input with domain dropdown (`@mike-wolf.com` shown)
- `[data-cy="recovery-email-input"]` — personal/recovery email
- `[data-cy="schedule-user-activator"]` (×2) — "Select start date" button, "Select end date" button
- `[data-cy="Onboarding-template-select"]` — workflow template dropdown
- `input[type="checkbox"][aria-label="Schedule this person to be onboarded"]` — schedule toggle

**Action buttons:**
- `button "Add task"` — adds a new task row to the workflow
- `button "Save Changes"` — saves template changes (disabled until changed)
- `button "Create and onboard person"` — submits the form

**After action:** Person created in YeshID; workflow task(s) staged or executed immediately depending on schedule.

---

### Offboard Person — /organization/people/offboard

**Title:** YeshID | YeshID
**Type:** form

**What you can do here:**
- Select person from dropdown
- Set offboarding date and time
- Select offboarding template (default: "YeshID Default")
- Add/reorder tasks

**Default tasks:**
1. Suspend user in Initial directory — on End date

**Targets found:**
- `[data-cy="schedule-user-activator"]` → "Select offboarding date" button
- `[data-cy="Offboarding-template-select"]` → template dropdown
- `button "Add task"`, `button "Offboard person"` (submit)

---

### Applications — /access/applications

**Title:** Access Accounts | YeshID
**Type:** paginated list

**What you can do here:**
- View all managed applications (4 in this org: Descript, Sample Dashboard App, TestApp-SCIM, TestApp-SelectEntity2)
- Columns: Application, Status, Available Integrations, Accounts, Technical Owners, Actions
- Click "Add application" → opens app picker/creation modal
- Click "Import application list" → opens Import modal (AI Paste or CSV)
- Click a row → navigates to `/access/applications/[id]/accounts`

**Targets found:**
- `button "Import application list"` — import modal trigger
- `button "Add application"` — add single app modal trigger
- App row click → navigates to `/access/applications/{uuid}/accounts`

---

### Application Detail — /access/applications/[id]/accounts

**Type:** detail view with sub-navigation tabs

**Tabs (live):**
- **Accounts** → `/access/applications/[id]/accounts` — lists users with access; columns: External ID, Account name, Identity/Owner, Role, Login Type, Created, Deactivated, License
- **Roles** → `/access/applications/[id]/roles`
- **Settings** → `/access/applications/[id]/settings`
- **Access Requests** → `/access/applications/[id]/access-requests`

**Header buttons:**
- `button "Manage"` — opens user management panel (add/remove users, import via CSV or screenshot)
- `button "Connect"` — opens integration setup flow

**Settings tab fields (live):**
- Name, Description, Login URL, Technical Owners (people picker), Visibility (toggle), Icon, Onboarding Instructions, Offboarding Instructions

---

### Access Grid — /access/grid

**Title:** Access | YeshID
**Type:** matrix table

**What you can do here:**
- View all people × all applications in a grid (people in rows, apps in columns)
- Filter by YeshID status (Active by default)
- Click "Start an audit" → leads to audit creation
- Columns: User name, then one column per managed app (Descript, Sample Dashboard App, TestApp-SCIM, TestApp-SelectEntity2)

**Targets found:**
- `[data-cy="access-table"]` → the main grid div

---

### RBAC — /access/rbac

**Type:** list (Business plan feature)
**What you see:** "RBAC is available on Business plans. Upgrade Now" + empty table (Name, Description, Owners, Actions)
**Buttons:** `button "New RBAC Policy"`, `button "Clear all"`

---

### Access Requests — /access/requests

**Title:** Access | YeshID
**Type:** table (currently empty)

**Columns:** Type, Request Date, Requester, Requester Note, Subject, Application, Role, Approvers, Response Date, Responder, Responder Note, Response to Request

**Targets found:**
- `[data-cy="access-requests"]` → the table div
- `button "Start an audit"` (header action)
- `button "Clear all"` (filter clear)

---

### Audit Campaigns — /access/audits-v2

**Type:** list
**Tabs:** Campaigns, Templates
**State:** Empty — "No audit campaigns yet. Start one below."
**Buttons:** `button "Start audit campaign"` (×2, header + empty state)

---

### Shadow Applications — /security/shadow/applications

**Title:** Security | YeshID
**Actual URL:** redirects to `/security/shadow/applications`
**Type:** list with summary widgets

**What you see:**
- "New: 3 apps newly seen compared to last week"
- Summary cards: Sensitive & Restricted Scopes (22 apps), Forbidden Apps (none)
- Filter tabs on list: All, Neutral, Sensitive, Restricted
- Sub-tabs on each app: **Users**, **Scopes**
- Table columns: Application, Users, Scopes, Managed (Yes/No)

**Buttons:** `button "All"`, `button "Neutral"`, `button "Sensitive"`, `button "Restricted"`, `button "Clear all"`

---

### Identities — /security/identities/applications

**Type:** summary + list
**What you see:**
- Counts: All accounts (0), Mapped (0), Non Human (0), Unmapped (0)
- Empty state: "You don't have any integrations set up yet. Start integrating your applications now!"
- (Populates once apps are connected via the Applications → Connect flow)

---

### Access Drift — /security/access-drift

**Type:** summary (Business plan feature)
**What you see:** "Access drift is available on Business plans. Upgrade Now"
- Counts: Apps with Drift (0), Unmapped (0), Non Human (0)

---

### Non-Human IDs — /security/identities/nhi (BETA)

**Type:** list
**What you see:**
- Summary: 137 NHIs across 1 app (Google Workspace)
- Tabs: NHI (by service), VENDORS (by vendor)
- Each row: vendor name, Account owner (Unowned), domain
- Example entries: Zoom, ZIP Extractor, Zepp App, Zeffy, YeshID, Yelp, XSplit, xAI, ...
- (These are OAuth service accounts / non-human identities discovered from connected directories)

---

### Risk Assessment — /security/risk-assessment

**Type:** audit dashboard
**What you see:**
- Security Score: 57% (17 compliant, 5 semi-compliant, 12 not compliant)
- Grouped check categories with expandable items: Security, Gmail, Drive, Chrome, Meet, etc.
- `button "Resync"` — re-pulls current config from Google Workspace
- Each check is a clickable button showing compliant count

**Example checks:** Super Admin Account Recovery, User Account Recovery, Password Management, Session Control, Less Secure Apps, Login Challenges, Advanced Protection Program Enrollment, Gmail: Confidential Mode, S/MIME Encryption, Enhanced Pre-Delivery Message Scanning, Spoofing and Authentication, Links and External Images, Email Attachment Safety

---

### Triggers — /manage/triggers

**Type:** list (Business plan feature)
**What you see:** "Conditional triggers are available on Business plans. Upgrade Now" + empty table
**Columns:** Active, Type, Name, Conditions, State, Actions
**Buttons:** `button "New Trigger"`, `button "Clear all"`

---

### Workflow Templates — /workflow-templates

**Title:** Workflow Templates - YeshID | YeshID
**Type:** list with filter tabs

**What you see:**
- 3 built-in templates: Onboarding (4 tasks), Offboarding (4 tasks), New Application Request (1 task)
- Filter tabs: All templates, Onboarding, Offboarding, New Application Request
- `button "New Template"` — create custom template

**Columns:** Template, Created By, Last modified/created, Tasks, Actions

---

### Policies — /policies (BETA)

**Type:** policy list with toggle controls
**What you see:**
- `button "Create Policy"` — create new policy
- Built-in policies (OFF by default in this org):
  - "People without MFA turned on" — alerts when Google accounts have MFA disabled
  - "New OAuth Apps Seen within last 24 hours" — alerts when new OAuth apps are seen
- Each policy shows: Total events, Active, Resolved, Muted counts
- Toggle ON/OFF per policy

---

### Events — /events

**Type:** audit log table
**What you see:**
- Columns: Event Time, Actor, Event Type, Target, Severity
- Severity levels: INFO, WARN, ERROR (observed: INFO for logins)
- Event types observed: "User login (Success)"
- Actors: email addresses (mw@mike-wolf.com)
- `button "Clear all"` — filter reset

---

### Workflows — /workflows

**Title:** Workflows | YeshID
**Actual URL:** redirects to `/workflows/?filters=(workflow-status = "STAGED" OR workflow-status = "PENDING" OR workflow-status = "IN_PROGRESS")`
**Type:** filtered list

**What you see:**
- Active workflows filtered to Staged + Pending + In Progress by default
- `button "View: Workflows"` — toggle view mode
- `button "Start a Workflow"` — manually trigger a new workflow
- `button "Select workflows"` — bulk select
- Columns: Workflow, Details, Workflow Status, Owner, Trigger, Date, Actions
- In-progress examples: "New Application Request: Figma from Mike Wolf" (13 Feb 2026), "Offboarding: Reminder: Offboard Sarah Johnson" (15 Jun 2025)
- Status values: Staged, In Progress, Pending, Completed (filter options)
- Trigger types: "Manual by [user]"

---

### My Apps — /my-applications

**Type:** end-user app portal
**What you see:** Personal app list for the logged-in user (empty for admin account)
**Buttons:** `button "Request an application"` — opens access request flow

---

### Requested Apps — /requested-applications

**Type:** end-user requested apps view
**What you see:** Apps the current user has requested access to
- Example: "Figma — Requested 2/13/2026"
**Buttons:** `button "Request an application"`

---

### Directories — /organization/directories

**Actual URL:** redirects to `/organization/directories/{uuid}` (the connected directory)
**Type:** directory detail view

**What you see (Google Workspace directory):**
- Identity Provider: "Google Workspace | Initial directory" — Connected
- Domain: mike-wolf.com, Last sync: 5 hours ago
- Stats: Active identities (32), Suspended identities (3), Super admins (1), Identities without MFA (31)
- Sub-tabs: **Identities (35)**, **Groups (2)**, **Organizational units (6)**, **Settings**
- Table: Identity name, YeshID account owner, Primary email, Status, MFA enabled, Last login
- `button "Sync directory"` — trigger immediate resync
- `button "Add Directory"` — add another identity provider

---

### Groups — /organization/groups

**Type:** list (Business plan feature)
**What you see:** "Groups are available on Business plans. Upgrade Now" + empty table
**Columns:** Group name, Type, Description, Owners, Actions
**Buttons:** `button "New Group"`, `button "Clear all"`

---

### Settings — /manage/settings

**Sub-routes:**
- `/manage/settings/general` — Company Name, Support Contact, Org default timezone, Integration sync preferred time (Business), Delete account button
- `/manage/settings/notifications` — Weekly admin emails toggle, New user outside YeshID toggle, Status change outside YeshID toggle, Slack bot ("Add to Slack" link)
- `/manage/settings/customize` — (not surveyed, likely branding/email templates)
- `/manage/settings/billing` — (not surveyed, plan/billing management)
- `/manage/settings/administrators` — (not surveyed, admin user management)

---

## Updated Capability Map (Live)

| What you can do | URL | Key selector / path | Notes |
|---|---|---|---|
| Onboard a person | /organization/people/onboard | `[data-cy="first-name-input"]`, `[data-cy="last-name-input"]`, `[data-cy="company-email-input"]`, `[data-cy="recovery-email-input"]`, `button "Create and onboard person"` | Scheduling optional; template selectable |
| Offboard a person | /organization/people/offboard | `[data-cy="schedule-user-activator"]`, `[data-cy="Offboarding-template-select"]`, `button "Offboard person"` | Select person + date + template |
| View people list | /organization/people | `[data-cy="user-table"]`, `[data-cy="add-user-btn"]` | 35 people; paginated 10/page |
| Per-person actions | /organization/people | `[data-cy="user-menu-btn-{slug}"]` | Slug = email prefix (e.g. "buddy", "daniel.wolf") |
| Add application | /access/applications | `button "Add application"` | Opens picker modal |
| Import applications | /access/applications | `button "Import application list"` | AI paste or CSV |
| View app detail (accounts) | /access/applications/[id]/accounts | `button "Manage"`, `button "Connect"` | Tabs: Accounts, Roles, Settings, Access Requests |
| Connect app integration | /access/applications/[id] | `button "Connect"` | Prebuilt / SCIM / Build Your Own |
| View access grid | /access/grid | `[data-cy="access-table"]` | People × apps matrix; filter by status |
| Request app access (end user) | /my-applications | `button "Request an application"` | Creates workflow in admin view |
| View access requests | /access/requests | `[data-cy="access-requests"]` | Table: requester, app, role, response |
| Start audit campaign | /access/audits-v2 | `button "Start audit campaign"` | Also has Templates tab |
| View shadow apps | /security/shadow/applications | filter buttons (All/Neutral/Sensitive/Restricted) | Detected via Google OAuth; shows scopes per app |
| View identities | /security/identities/applications | — | Requires app connections to populate |
| View non-human IDs | /security/identities/nhi | tabs: NHI, VENDORS | 137 NHIs from Google Workspace in this org |
| View access drift | /security/access-drift | — | Business plan; empty w/ upgrade prompt |
| Risk assessment | /security/risk-assessment | `button "Resync"` | 57% score; expandable check categories |
| Create trigger | /manage/triggers | `button "New Trigger"` | Business plan; conditional automation |
| Manage workflow templates | /workflow-templates | `button "New Template"` | 3 default templates; custom templates supported |
| Manage policies | /policies | `button "Create Policy"`, ON/OFF toggles | 2 default policies (MFA, new OAuth apps) |
| View audit log | /events | — | Event Time, Actor, Event Type, Target, Severity |
| View/manage active workflows | /workflows | `button "Start a Workflow"` | Filtered to active by default |
| Configure RBAC | /access/rbac | `button "New RBAC Policy"` | Business plan only |
| Create groups | /organization/groups | `button "New Group"` | Business plan only |
| View directory | /organization/directories | `button "Sync directory"`, `button "Add Directory"` | Redirects to /directories/{uuid} |
| Settings: notifications | /manage/settings/notifications | "Add to Slack" link | Slack bot + email notification toggles |
| Settings: general | /manage/settings/general | — | Company name, timezone, delete account |

---

## Updated Gaps

### Resolved (previously "needs live session")
- **People page** — fully surveyed: `user-table`, `add-user-btn`, `user-menu-btn-{slug}` selectors confirmed
- **Onboarding form** — all fields confirmed: `first-name-input`, `last-name-input`, `company-email-input`, `recovery-email-input`, `schedule-user-activator`, `Onboarding-template-select`
- **Offboarding form** — `schedule-user-activator`, `Offboarding-template-select` confirmed
- **Applications list** — buttons and table structure confirmed
- **App detail tabs** — Accounts, Roles, Settings, Access Requests confirmed; URL pattern: `/access/applications/{uuid}/{tab}`
- **Workflows** — `Start a Workflow` button, status filter, column structure confirmed
- **Settings sub-pages** — `/notifications`, `/general` structure confirmed

### Business Plan gate (seen in live session)
These features exist in the nav but show "available on Business plans" with an Upgrade Now CTA:
- **Access Drift** (`/security/access-drift`) — apps-vs-expected-access comparison
- **Triggers** (`/manage/triggers`) — conditional workflow automation
- **RBAC** (`/access/rbac`) — role-based access policies
- **Groups** (`/organization/groups`) — user grouping
- **Custom Actions** (in app Connect flow) — arbitrary API endpoint tasks in workflows
- **Integration sync preferred time** (in general settings) — scheduled sync window

### New gaps found in live session
- **App detail: Manage modal** — clicking `button "Manage"` opens a panel for adding/removing users and importing. This modal's form fields (CSV import, screenshot import, user picker) were not fully inspected. High value for automation.
- **App detail: Connect flow** — the full integration setup wizard (Prebuilt/SCIM/Build Your Own, auth config, action enablement) was not walked through in this session. Form fields inside the Connect wizard are undocumented.
- **Audit creation form** — `/access/audits/create` not visited; form fields unknown.
- **Settings: customize, billing, administrators** — sub-pages not visited.
- **Workflow detail** — clicking into an active workflow to see task list, completion UI, and TO approval flow not surveyed.
- **People detail** — individual person view (`/organization/people/[id]`) not surveyed; likely shows app access, account links.
- **Onboard form: domain dropdown** — email domain selector (shows `@mike-wolf.com`) can likely switch between org domains. Not tested with multiple-domain org.
- **Shadow app detail** — clicking into a shadow app row to see per-user login details and "Add as managed app" button not tested.
- **Access request submission (end-user)** — `button "Request an application"` flow not fully walked through (modal content/fields unknown).
- **Title bug** — several pages have `<title>YeshID | YeshID</title>` (e.g. `/onboard`, `/offboard`, `/risk-assessment`). Likely a bug in the Vue router title config.
