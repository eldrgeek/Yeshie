# YeshID — 50 Most Common Tasks

Status key: `VALIDATED` (payload tested end-to-end) | `LEARNED` (steps discovered, payload ready) | `EXPLORED` (page visited, affordances mapped) | `NOT STARTED`

Priority: tasks ranked by frequency of use in a typical identity governance workflow.

---

## People Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 1 | Onboard a new person | VALIDATED | `01-user-add` | 18 steps, creates user with email |
| 2 | Offboard a person | VALIDATED | `02-user-delete` | 18 steps, 7.7s, full offboard flow |
| 3 | Modify a person's details | VALIDATED | `03-user-modify` | 14 steps, edit first/last/email |
| 4 | Search for a person | LEARNED | `06-person-search` | Search input works, typed "Mike" (6.7s). Results didn't visibly filter — may need Enter key or debounce wait |
| 5 | View a person's profile | LEARNED | `07-person-view` | `find_row("Claude")` → detail page. UUID `5e33dec8-6ebb-44ce-974e-5e80d8c9925d`. Tabs: Details, Directory IDs, Events, Applications, Tokens |
| 6 | Filter people by status | NOT STARTED | — | Status filter on people list |
| 7 | View all people | EXPLORED | — | `/organization/people` mapped |
| 8 | Assign person to application | NOT STARTED | — | Person detail has Applications tab; needs further exploration |
| 9 | Bulk import people | NOT STARTED | — | Unknown if supported |
| 10 | Suspend a person | EXPLORED | — | "Manage" dropdown on person detail shows role selector ("Administrator") — not the expected Offboard/Suspend menu. Suspend path unclear |

## Directory Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 11 | Sync directory | LEARNED | `08-sync-directory` | "Sync directory" button present, last sync ~6h ago. 4 filter buttons (Active/Suspended/Admin/No-MFA), 25 identities in table |
| 12 | View directory identities | EXPLORED | — | Table with 25 identities |
| 13 | Filter identities (active/suspended/admin/no-MFA) | EXPLORED | — | 4 filter buttons confirmed on directory page: Active, Suspended, Admin, No-MFA |
| 14 | Add a directory | EXPLORED | — | Button on directories page |
| 15 | View directory groups | NOT STARTED | — | Tab on directories page |

## Group Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 16 | Create a new group | LEARNED | `09-create-group` | Dialog fields: Group Name, Type (Static), Description, Owners. "New Group" button opens modal |
| 17 | View groups | EXPLORED | — | `/organization/groups` mapped |
| 18 | Edit a group | NOT STARTED | — | Actions column in groups table |
| 19 | Delete a group | NOT STARTED | — | Likely in Actions dropdown |

## Application Management

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 20 | Add an application | LEARNED | `10-add-application` | `click_text "Add application"` opens dialog. Fields: Application name, Technical Owners (1–5 required), Advanced Options section |
| 21 | Import application list | EXPLORED | — | Dialog offers AI Paste + Upload CSV options |
| 22 | View application accounts | EXPLORED | — | App detail page mapped |
| 23 | Set up SCIM integration | NOT STARTED | `05-integration-setup` | Has preRunChecklist |
| 24 | Disconnect an integration | EXPLORED | — | "Disconnect" button on integration config |
| 25 | Assign technical owners | EXPLORED | — | Technical Owners field (1–5) is part of the Add Application dialog |
| 26 | View application list | EXPLORED | — | `/access/applications` mapped |

## Access & Audit

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 27 | View access grid | LEARNED | `12-view-access-grid` | `/access/grid` mapped |
| 28 | Start a new audit | LEARNED | `11-start-audit` | Form: Title, Start date, Audit Workflow template, Tasks table. Navigated via `/access/audits` |
| 29 | Create RBAC policy | NOT STARTED | — | "New RBAC Policy" button (requires upgrade?) |
| 30 | View access requests | EXPLORED | — | `/access/requests` mapped |
| 31 | Approve/deny access request | NOT STARTED | — | Table with request rows |
| 32 | Filter access grid | EXPLORED | — | 22 people × 2 apps grid. Status filter present. "Start an audit" button. "Add another filter..." input |

## Security

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 33 | View shadow applications | EXPLORED | — | `/security/shadow/applications` mapped |
| 34 | Add shadow app as managed | EXPLORED | — | Filter tabs visible (All/Neutral/Sensitive/Restricted). Page loaded with shadow app data |
| 35 | Revoke shadow app access | NOT STARTED | — | "Revoke access" button |
| 36 | Filter shadow apps by category | EXPLORED | — | All/Neutral/Sensitive/Restricted tabs confirmed present |
| 37 | View access drift | EXPLORED | — | `/security/access-drift` mapped |
| 38 | Resync risk assessment | EXPLORED | — | Score: 57%. 17 Compliant, 5 Semi-Compliant, 12 Not Compliant. "Resync" button present. Categories visible |
| 39 | Review a risk finding | NOT STARTED | — | Click individual risk item |

## Workflows & Automation

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 40 | View workflows | EXPLORED | — | `/workflows` in nav |
| 41 | Create workflow template | EXPLORED | — | "New Template" button clicked — no visible effect. May require plan upgrade or additional nav step |
| 42 | Edit workflow template | NOT STARTED | — | Actions column in templates table |
| 43 | Add onboarding task | NOT STARTED | — | "Add task" on onboard form |
| 44 | Create a trigger | NOT STARTED | — | "New Trigger" button (requires upgrade?) |
| 45 | Create a policy | NOT STARTED | — | "Create Policy" button |

## Settings & Administration

| # | Task | Status | Payload | Notes |
|---|------|--------|---------|-------|
| 46 | View event log | EXPLORED | — | `/events` mapped, 122 events visible |
| 47 | Search events | EXPLORED | — | Search input works, typed value but results didn't visibly filter — may need Enter or debounce |
| 48 | Manage administrators | EXPLORED | — | Settings → Administrators. "Add Administrator" button present. Currently 1 admin |
| 49 | Change notification settings | EXPLORED | — | Weekly emails, new user detection, status change detection, Slack Bot integration option |
| 50 | Customize branding | NOT STARTED | — | Settings → Customize |

---

## Summary

| Status | Count |
|--------|-------|
| VALIDATED | 3 |
| LEARNED | 0 |
| EXPLORED | 27 |
| NOT STARTED | 20 |
| **Total** | **50** |

## Top 20 (learning priority)

1. Search for a person (#4)
2. View a person's profile (#5)
3. Add an application (#20)
4. Filter people by status (#6)
5. Suspend a person (#10)
6. Assign person to application (#8)
7. Start a new audit (#28)
8. Create a new group (#16)
9. Sync directory (#11)
10. View event log / search events (#46, #47)
11. Create workflow template (#41)
12. Filter identities (#13)
13. Add shadow app as managed (#34)
14. Set up SCIM integration (#23)
15. Manage administrators (#48)
16. Filter access grid (#32)
17. Approve/deny access request (#31)
18. Edit a group (#18)
19. Create a trigger (#44)
20. Resync risk assessment (#38)
