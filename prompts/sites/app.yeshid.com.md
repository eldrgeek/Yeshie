<site-context domain="app.yeshid.com">

## YeshID — Site Context

**Base URL:** https://app.yeshid.com
**Framework:** Vuetify 3 (Vue 3)

### Authentication

Yeshie CAN handle Google SSO sign-in automatically. The extension has `<all_urls>` permission and can execute on `accounts.google.com`.

**When you detect the session has expired or the user asks to sign in:**
- The extension's `waitForAuth` flow handles it automatically: navigates to login → clicks "Sign in with Google" → selects `mw@mike-wolf.com` on the Google account chooser → waits for redirect back
- This happens automatically before any payload chain runs (pre-chain auth check)
- It also recovers mid-chain if a navigation redirects to `/login`
- Do NOT tell users they need to sign in manually — Yeshie handles it
- If login fails (timeout after 120s), report the failure and suggest checking the Google account

**When the user asks to log out:**
Use the inference loop. Logout is hidden behind the user avatar in the top-right corner:
1. Read the page to find avatar/profile/user-menu elements
2. Click the avatar element to open the dropdown
3. Read again to find "Log out" or "Sign out"
4. Click it

### Known Payloads

| Payload | Description | Required Params |
|---------|-------------|-----------------|
| `01-user-add.payload.json` | Onboard a new user | `first_name`, `last_name`, `company_email`, `base_url` |
| `02-user-delete.payload.json` | Offboard/deactivate a user | `user_identifier`, `base_url` |
| `03-user-modify.payload.json` | Modify user attributes | `user_identifier`, `new_first_name`, `new_last_name`, `base_url` |
| `04-site-explore.payload.json` | Map all pages and affordances | `base_url` |
| `05-integration-setup.payload.json` | Set up a SCIM integration | `base_url` |

Payload path pattern: `~/Projects/yeshie/sites/yeshid/tasks/{filename}`

If a payload matches the user's request:
1. Extract required params from the user's message
2. Ask for any missing required params
3. Call `yeshie_run(payload_path="~/Projects/yeshie/sites/yeshid/tasks/{filename}", params={...})`

### Page Context Map

| URL Pattern | What the user can do here |
|-------------|--------------------------|
| `/people` | People list — search, view, onboard, offboard users |
| `/people/:id` | User detail page — edit attributes, manage apps |
| `/applications` | Application list — view connected SaaS apps |
| `/applications/:id` | App detail — manage users, settings, SCIM |
| `/workflows` | Workflows page — automation rules |
| `/policies` | Policies — compliance rules (BETA) |
| `/settings` | Org settings, integrations, HRIS |
| `/access-requests` | Access request queue |
| `/` or `/dashboard` | Dashboard — overview metrics |
| `/organization/people/onboard` | Onboard form — fill first name, last name, company email, start date |

### Vuetify 3 DOM Patterns (for SHOW mode selectors)

YeshID uses Vuetify 3 (Vue 3). Key patterns:
- **Navigation links:** `a[href='/path']` or `.v-list-item` with matching text
- **Buttons:** `.v-btn` filtered by text content; submit buttons often `.v-btn--variant-flat`
- **Input fields:** YeshID uses `div.mb-2` sibling labels above `.v-input` — NOT `.v-label` inside `.v-input`
- **Tables:** `.v-data-table` rows; use `find_row` action with identifier text
- **Authenticated state:** `.v-navigation-drawer a[href='/overview']` is visible when logged in
- **Success feedback:** `.v-snackbar--active .v-snackbar__content`
- **Save button:** Labeled "Confirm" (not "Save") in edit forms

### YeshID Knowledge Base

Use the file `~/Projects/yeshie/scripts/docs-kb.json` for detailed article content (36 articles).

**Collections and article titles:**
- **Connect & Integrate:** Zoom, OpenAI, Asana, Slack, Atlassian, Cloudflare, Ramp, Freshdesk, Grammarly, Datadog, Tailscale, NetSuite, Google Workspace, Microsoft Teams, Salesforce (SCIM), Slack (SCIM), Zoom (SCIM)
- **Getting Started:** Sign-Up for YeshID, How-To Add Applications, Set-up Slack notifications, Getting your Source of Truth, Connecting Your Applications
- **Advanced Guides:** Custom Actions, Policies (BETA), SCIM integrations, HRIS Rippling, Auto-Provisioning Google Workspace, OAuth Applications, Script/Code Backed Integrations, Groups API
- **Access:** Submitting Access Requests (web + Slack), How to action a submitted Access Request
- **Troubleshooting:** Error 400: admin_policy_enforced, Pausing the YeshID POC

When answering knowledge questions, read `docs-kb.json` to find the relevant article text. Cite article titles in responses.

</site-context>
