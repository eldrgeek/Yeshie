---
app: yeshid
display_name: YeshID
home_url: https://app.yeshid.com
generated_at: 2026-05-06T05:23:17.784019+00:00
corpus_entries: 27
confidence: high
---

# Theory of YeshID

## 1. Purpose (one paragraph)

YeshID is a cloud-based Identity and Access Management (IAM) / Identity Governance and Administration (IGA) platform targeting IT administrators and security teams at small-to-mid-size organizations. The primary user persona is an IT admin or security officer who needs to provision and deprovision employee access across a SaaS stack without spreadsheets or manual tickets. The job-to-be-done is lifecycle management: onboard a new hire into all their apps in one action, offboard a departing employee from everything, continuously monitor who has access to what, detect drift and shadow IT, and produce audit-ready compliance evidence — all from a single control plane.

## 2. Mental Model (3-5 sentences)

YeshID is an identity directory with a workflow engine bolted on: every lifecycle action (onboard, offboard) creates a Workflow run that sequences provisioning steps across integrated apps. The app's "center of gravity" is the Person record — every other entity (Applications, Groups, Directories, Audit Reports) exists to describe or govern a person's access. Integrated apps sync continuously via SCIM; unintegrated ones can be pulled in by CSV, screenshot, or by detecting OAuth tokens via Google/Microsoft SSO logs (Shadow IT). Access state is observable through the Access Grid (people × apps matrix) and interrogable via URL-filterable queries on status. Policy and RBAC layers sit above the directory to enforce rules and route approval requests, but both are marked BETA in the current product.

## 3. Auth & Identity Model

- **Login mechanism:** Google SSO only (button: "Sign in with Google"). No local username/password observed. MFA not configured at the YeshID login layer — delegated to Google.
- **Session signals:** Authenticated state = URL matches `app.yeshid.com` AND does not match `/login|/auth|/signin|accounts.google.com`. Sidebar nav link `a[href="/overview"]` is present when logged in. The element `[data-cy="username"]` appears on every authenticated page and serves as the most reliable hydration sentinel.
- **Multi-tenant / Org-scoped:** Yes — org-scoped. The corpus shows a single tenant (`embeddedsystemsresearch.org`). All data is org-scoped; there is no visible cross-org switching UI.
- **Auth automatable:** Yes, end-to-end. Extension clicks "Sign in with Google," selects the account by `[data-email="mw@mike-wolf.com"]`, and waits for redirect back to `app.yeshid.com`. If already authenticated, the login flow exits immediately. No human prompt needed for the configured Google account.

## 4. Entity Model

| Entity | Description | Key Attributes | Relationships |
|--------|-------------|----------------|---------------|
| Person | A human identity managed in YeshID | First name, last name, company email, personal/recovery email, YeshID status (ACTIVE, DEACTIVATED, STAGED, STAGED_OFFBOARDING), directory sync source, app count | Member of Groups; has Application accounts; belongs to Directories; subject of Workflows |
| Application | A SaaS app tracked in YeshID | Name, status, available integrations, accounts count, technical owner(s) | Has Accounts (per-person); may have an Integration; appears in Access Grid; subject of Audits |
| Directory | An identity source (e.g. Google Workspace) | Sync status, identity count, filter states (active, suspended, no-MFA, admin) | Contains Directory Identities; linked to People |
| Group | A named collection of People | Name, type, description, owners, members | Contains People; gated by Business plan |
| Workflow | An automated sequence of provisioning steps | Status (Staged, In Progress, Pending), type (onboard/offboard), UUID-based URL | Triggered by onboard/offboard actions on a Person; URL: `/workflows/{uuid}` |
| Audit Report | A structured access review | Title, reviewers, decisions, exceptions | Cross-references People × Applications; started from `/access/audits/create` |
| Policy | A compliance rule (BETA) | Rule logic, enforcement status (enforced/staged/flagged) | Applied to Applications, Departments, Access levels |
| Trigger | An event-driven automation rule | Event type, actions, enabled state | Fires Workflows on identity events |
| Shadow Application | An unmanaged app detected via OAuth/SSO logs | App name, classification (neutral/sensitive/restricted), OAuth scopes | Linked to People via OAuth tokens; can be promoted to managed Application |
| Non-Human Identity (NHI) | Service accounts, bots, automated identities (BETA) | Identity type, linked app | Tracked under Security → Non-human IDs |

**Center of gravity:** Person. Every significant operation — provisioning, deprovisioning, access review, group membership, drift detection — begins or ends at a Person record. The people list at `/organization/people` is the primary operational surface and every other entity references people.

## 5. Action Vocabulary

| Entity | Create | Read/View | Update | Delete/Offboard | App-specific |
|--------|--------|-----------|--------|-----------------|--------------|
| Person | `/organization/people/onboard` (form) | `/organization/people` (list), `/organization/people/{id}/details` | Click Edit on detail page → save | Manage → Offboard User → `/offboard/` flow → `/workflows/{uuid}` | Onboard (with start date), Offboard, Search/filter by status |
| Application | "Add application" dialog on `/access/applications` | `/access/applications` (list), `/access/applications/{id}/accounts` | Edit integration config | — | Connect (SCIM), Manage Integration, Import list |
| Integration | — | `/access/applications/{id}/integration/authentication` | SCIM config form (base URL, bearer token, auth type) | Disconnect button | Save configuration |
| Directory | "Add Directory" on `/organization/directories` | `/organization/directories` | — | — | Sync now |
| Group | "New Group" dialog on `/organization/groups` | `/organization/groups`, `/organization/groups/{id}` | Add/remove members | Manage → Delete Group | Add Member, Remove Member |
| Access Grid | — | `/access/grid` (.v-data-table) | — | — | Filter, Start Audit |
| Audit Report | `/access/audits/create` | `/access/audits` | — | — | Assign reviewers, collect decisions, export |
| Workflow | Auto-created on onboard/offboard | `/workflows` (list), `/workflows/{uuid}` | — | — | View status (Staged/In Progress/Pending) |
| Shadow App | — | `/security/shadow` | Classify (neutral/sensitive/restricted) | Revoke OAuth tokens | Add as managed application |
| Events | — | `/events` (searchable log) | — | — | Search by term |

## 6. Navigation Topology

**Top-level routes:**

| Route | Page |
|-------|------|
| `/overview` | Dashboard — quick stats, action buttons, workflow status |
| `/workflows` | Workflow run list |
| `/my-applications` | End-user self-service app view |
| `/requested-applications` | Pending access requests for current user |
| `/organization/people` | People list (filterable by status via `?filters=status=X`) |
| `/organization/people/onboard` | New person form |
| `/organization/people/{id}/details` | Person detail/edit |
| `/organization/people/{id}/offboard/{uuid}` | Offboard flow |
| `/organization/directories` | Directory list + sync |
| `/organization/groups` | Group list |
| `/organization/groups/{id}` | Group detail + members |
| `/access/applications` | Application catalog |
| `/access/applications/{id}/accounts` | App detail + account list |
| `/access/applications/{id}/integration/authentication` | Integration config |
| `/access/grid` | Access Grid (people × apps matrix) |
| `/access/rbac` | RBAC (BETA) |
| `/access/requests` | Access request queue |
| `/access/audits` | Audit report list |
| `/access/audits/create` | New audit wizard |
| `/security/shadow` | Shadow IT app list |
| `/security/identities/applications` | Identity security view |
| `/security/access-drift` | Access drift detection |
| `/security/identities/nhi` | Non-human identities (BETA) |
| `/security/risk-assessment` | Risk scores |
| `/manage/triggers` | Automation trigger list |
| `/manage/settings` | Org settings |
| `/workflow-templates` | Workflow template library |
| `/policies` | Policy list (BETA) |
| `/events` | Event log |

**Navigation pattern:** Left sidebar nav is persistent and always visible when authenticated. Sections: Home, Workflows, My Apps, Requested Apps, Organization (People/Directories/Groups), Access (Applications/Grid/RBAC/Requests/Audit Reports), Security (Shadow/Identities/Access Drift/NHI/Risk), Manage (Triggers/Templates/Policies/Events/Settings).

**Modal vs. full-page:** "Add application" and "New Group" use in-page dialogs (`.v-overlay--active`). Onboard and Offboard are full-page flows. Integration config is a full page. Confirmation dialogs appear before destructive actions.

**Wizard flows:** Onboard person (form → start date picker → submit → redirect to `/workflows/{uuid}`). Offboard person (Manage menu → Offboard User → offboard date picker → Offboard person → redirect to `/workflows/{uuid}`). Integration setup (app detail → Connect → SCIM radio → auth type → base URL + token → Save).

## 7. State Machine

**Person lifecycle:**
```
STAGED → ACTIVE → STAGED_OFFBOARDING → DEACTIVATED
```
- `STAGED`: Onboarded with future start date; pending activation
- `ACTIVE`: Currently employed, provisioned in apps
- `STAGED_OFFBOARDING`: Offboard scheduled but not yet executed
- `DEACTIVATED`: Offboarded; accounts removed from apps

**Session states:**
- `unauthenticated` → (click Sign in with Google + account select) → `authenticated`
- `authenticated` persists until browser session expires; extension re-authenticates automatically if Google account cookie is active

**Workflow run states:** Staged → In Progress → Pending (visible on dashboard as toggle buttons)

**Application integration states:**
- Unconnected → (click Connect → configure SCIM) → Connected/Integrated → (Disconnect) → Unconnected

**Offboard confirmation pattern:** People-list → search → find_row → person-detail → Manage dropdown → "Offboard User" → offboard page (`/offboard/`) → date picker → "Offboard person" → redirect `/workflows/{uuid}` → status chip changes to Deactivated

## 8. UI Framework Fingerprint

- **Framework:** Vue 3 + Vuetify 3. Confirmed via `v-application` class detection, `v-btn`, `v-data-table`, `v-snackbar`, `v-input`, `v-navigation-drawer`, `v-overlay`.
- **Selector strategy (priority order):**
  1. `data-cy` attributes — highest confidence; confirmed stable on onboard form: `[data-cy="first-name-input"] input`, `[data-cy="last-name-input"] input`, `[data-cy="company-email-input"] input`, `[data-cy="recovery-email-input"] input`, `[data-cy="schedule-user-activator"]`, `[data-cy="username"]`
  2. Class-based: `.search-input` (confirmed on people list, groups list), `.v-data-table-footer`, `.v-snackbar--active`
  3. Vuetify label match (`vuetify_label_match` resolution strategy) — use when `data-cy` absent; no ARIA labels on most inputs
  4. Placeholder text: `input[placeholder='Search']`, `input[placeholder='Type application name']`
  5. `button[aria-haspopup='menu']` for dropdown triggers
- **Critical DOM notes:**
  - Vuetify dynamic IDs (e.g. `#input-v-23`) change per session — never use them
  - Vue SPA: always wait for element visibility after navigation; hydration takes 1-2s
  - Search inputs use Vue debounce — wait 1-1.5s after typing before reading results
  - Snackbar success: `.v-snackbar--active .v-snackbar__content`; error: `.v-input--error`, `.v-messages__message`
  - Manage dropdown: `button[aria-haspopup='menu'].bg-primary` scoped to `main` (sidebar has conflicting elements)
  - Table rows: `.v-data-table tbody tr`; footer pagination: `.v-data-table-footer` with text pattern `N-N of TOTAL`
  - Status URL filter: `?filters=status=ACTIVE|DEACTIVATED|STAGED|STAGED_OFFBOARDING` — confirmed working

## 9. Permissions / Roles

- **Admin:** Full access to all sections. Can manage org settings, view/manage all people, configure integrations, create audits, manage administrators. The `mw@mike-wolf.com` account has this role.
- **Audit Admin:** A dedicated role added January 2026 for running access audits without full admin rights.
- **Standard user:** Can view `/my-applications` and `/requested-applications`. Limited access to org management.
- **Technical Owner:** An app-level role assigned per application; receives provisioning notifications and owns integration health.
- **Plan gating:** Groups feature requires Business plan. Current org (embeddedsystemsresearch.org) observed on a free/trial tier — "New Group" button is disabled, groups table shows "No data available." RBAC and Policies are BETA and may also have tier gates.

## 10. Failure Modes & Pitfalls

- **Snackbar errors:** Displayed via `.v-snackbar--active`; text matches `Error|error|failed|required|invalid`. Check `.v-input--error` for inline field validation; `.v-messages__message` for field-level messages.
- **Vue hydration lag:** After SPA navigation, the DOM exists before Vue components mount. Always `wait_for` a known selector before interacting — never rely on `delay` alone.
- **Search debounce:** The search input does not fire instantly; wait 1-1.5s after typing. The Vue reactive filter may not always activate via CDP `insertText` — the payload falls back to reading the full table and filtering client-side.
- **Manage dropdown scoping:** The `button[aria-haspopup='menu']` pattern matches sidebar elements too. Always scope to `main` to avoid clicking the wrong dropdown.
- **Recovery email not in table:** The personal/recovery email field is only visible on the person detail page (and only in edit mode). It is not a column in the people list — any query requiring it must iterate detail pages.
- **Offboard does not delete:** Offboarding sets status to `DEACTIVATED` but does not remove the person record. Verify by checking the YeshID status column, not by absence from the table.
- **Groups tier gate:** Groups feature silently shows "No data available" on free tier. Payloads must guard for this state and return an informative error rather than failing.
- **Workflow redirect:** Both onboard and offboard redirect to `/workflows/{uuid}` on success — not back to the people list. Skills must handle this redirect as a success signal.
- **Start date required:** The onboard form requires clicking the start date picker before submitting. Omitting it causes a validation error. Default is "Immediately" but must be explicitly selected.
- **Company email derivation:** YeshID auto-derives company email as `firstname.lastname@embeddedsystemsresearch.org`. If names have special characters or the pattern breaks, the field may need manual correction.

## 11. Skill Candidates (RANKED)

1. **`user-add`**
   - **Goal:** Onboard a new person into YeshID with name, company email, recovery email, and start date.
   - **Estimated leverage:** high — every new hire requires this
   - **Estimated difficulty:** low — form is well-mapped with `data-cy` selectors; 5 runs successful
   - **Pre-requisites:** `00-login`
   - **Verification signal:** Redirect to `/workflows/{uuid}` AND snackbar "Onboarding workflow created"

2. **`user-delete`** (offboard)
   - **Goal:** Offboard a person from YeshID by name or email, setting them to Deactivated.
   - **Estimated leverage:** high — every departure requires this
   - **Estimated difficulty:** low-medium — multi-step flow (search → detail → Manage → Offboard → date → confirm); 2 confirmed runs
   - **Pre-requisites:** `00-login`
   - **Verification signal:** Redirect to `/workflows/{uuid}`; status column shows "Deactivated" on re-query

3. **`person-search`**
   - **Goal:** Find a person by name or email and return their YeshID status and app count.
   - **Estimated leverage:** high — prerequisite for most other skills
   - **Estimated difficulty:** low — direct URL navigation + table read
   - **Pre-requisites:** `00-login`
   - **Verification signal:** Table rows returned; match found in results

4. **`view-access-grid`**
   - **Goal:** Capture the full people × applications access matrix.
   - **Estimated leverage:** high — security audits, drift detection, compliance reviews
   - **Estimated difficulty:** low — direct navigation + `.v-data-table` read; 6 confirmed runs
   - **Pre-requisites:** `00-login`
   - **Verification signal:** `.v-data-table` visible at `/access/grid`

5. **`count-by-status`**
   - **Goal:** Return counts of users by status (ACTIVE, DEACTIVATED, STAGED, STAGED_OFFBOARDING).
   - **Estimated leverage:** high — operational health check, headcount queries
   - **Estimated difficulty:** low — URL filter pattern confirmed; pagination footer parse
   - **Pre-requisites:** `00-login`
   - **Verification signal:** Four numeric values returned from footer text

6. **`user-modify`**
   - **Goal:** Update a person's first name, last name, or recovery email.
   - **Estimated leverage:** medium — name changes, email corrections
   - **Estimated difficulty:** medium — requires Edit mode toggle; save button selector not yet cached
   - **Pre-requisites:** `00-login`, person exists
   - **Verification signal:** Snackbar confirmation + detail page reflects updated values

7. **`add-application`**
   - **Goal:** Add a new SaaS application to YeshID's catalog with a technical owner.
   - **Estimated leverage:** medium — needed whenever a new app is adopted
   - **Estimated difficulty:** medium — dialog with `select_entity` owner search; not yet run
   - **Pre-requisites:** `00-login`
   - **Verification signal:** App appears in `/access/applications` list

8. **`integration-setup`**
   - **Goal:** Configure SCIM provisioning for an application (base URL + Bearer token).
   - **Estimated leverage:** medium — one-time per app but high-value automation
   - **Estimated difficulty:** medium — multi-step form with radio selectors and password field; 0 confirmed runs
   - **Pre-requisites:** `00-login`, app exists in catalog, SCIM endpoint + token in hand
   - **Verification signal:** Integration status changes to "Connected" on app detail page

9. **`start-audit`**
   - **Goal:** Initiate a new access audit report.
   - **Estimated leverage:** medium — quarterly compliance cycle
   - **Estimated difficulty:** low-medium — form opens from list; 0 confirmed runs
   - **Pre-requisites:** `00-login`
   - **Verification signal:** Audit appears in `/access/audits` list

10. **`sync-directory`**
    - **Goal:** Trigger an immediate directory sync to pull in identity changes.
    - **Estimated leverage:** medium — needed after bulk identity changes in Google Workspace
    - **Estimated difficulty:** medium — sync button selector not yet cached; 0 confirmed runs
    - **Pre-requisites:** `00-login`, directory configured
    - **Verification signal:** Snackbar or page state change indicating sync initiated

## 12. Open Questions

- **Settings page structure:** `/manage/settings` was visited during exploration but content not fully captured. Subpaths (general, billing, administrators, notifications) need probing — particularly whether SCIM inbound provisioning config lives here.
- **Organization settings path:** payload 17 attempted `/organization/settings` (not confirmed in nav links) vs. `/manage/settings` (confirmed in nav). Which is authoritative?
- **Audit detail page:** The audit creation flow beyond the title field is unknown — what reviewers/apps can be scoped per audit? What does the running audit look like?
- **RBAC page:** Visited in exploration but structure not captured. How roles relate to applications and what the assignment flow looks like is unknown.
- **Policies page:** BETA, minimal corpus coverage. What triggers a policy evaluation? What actions does it take?
- **Shadow IT detail:** Revoke OAuth token flow not captured — does it require additional confirmation? Does it cascade to the app account in YeshID?
- **NHI (Non-Human Identities):** BETA, zero coverage. What constitutes an NHI in this system — service accounts? API keys? OAuth machine clients?
- **Onboard form full field set:** Only 5 fields confirmed (`first_name`, `last_name`, `company_email`, `recovery_email`, `start_date`). Are there department, role, or manager fields on the same form?
- **Access Requests flow:** The `/access/requests` queue exists but no payload covers it. How does a user request access? Does it integrate with Slack/Teams as advertised?
- **Workflow template structure:** `/workflow-templates` visited but template internals (steps, conditions, app mappings) not captured.

## 13. Provenance

- **§3 (Auth):** `site.model.json` (`_meta.auth`), `00-login.payload.json` (full chain), `exploration-results.json` (nav links)
- **§4 (Entity Model):** `exploration-results.json` (nav links, page buttons), `site.model.json` (stateGraph nodes), `01-user-add` through `17-view-org-settings` payloads
- **§5 (Action Vocabulary):** `01-user-add.payload.json`, `02-user-delete.payload.json`, `05-integration-setup.payload.json`, `10-add-application.payload.json`, `11-start-audit.payload.json`, `exploration-results.json` (button hrefs)
- **§6 (Navigation):** `exploration-results.json` (navLinks array, page buttons with hrefs), `site.model.json` (stateGraph node URL patterns)
- **§7 (State Machine):** `01-user-add.payload.json` (onboard → workflow redirect), `02-user-delete.payload.json` (offboard → Deactivated), `q01-count-by-status.payload.json` (status values), `site.model.json` (stateGraph)
- **§8 (UI Framework):** `site.model.json` (`frameworkDetail`, `frameworkDetail` vuetify notes), `01-user-add.payload.json` (abstractTargets with `data-cy` selectors and `resolvedVia` fields), `02-user-delete.payload.json` (manage button scoping note)
- **§9 (Permissions):** `www.yeshid.com/blog` (Audit Admin role, January 2026 release notes), `14-add-user-to-group.payload.json` (Business plan gate anomaly), `q04-group-membership-count.payload.json` (tier warning)
- **§10 (Failure Modes):** `01-user-add.payload.json` (failureSignature, verification notes), `02-user-delete.payload.json` (Deactivated status assertion), `06-person-search.payload.json` (Vue debounce note), `q03-users-without-recovery-email.payload.json` (recovery email not in table), `q04-group-membership-count.payload.json` (tier guard)
- **§11 (Skill Candidates):** All payload JSONs (`runCount`, `lastSuccess`, `selfImproving` fields as proxy for maturity)