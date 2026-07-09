# script.google.com — Site Context

**Purpose:** Google Apps Script IDE and project management. Used to create, edit, and deploy server-side JavaScript that runs on Google's infrastructure with access to Google Workspace APIs.

## Site Structure

| URL | Description |
|-----|-------------|
| `https://script.google.com/home` | Project list dashboard |
| `https://script.google.com/d/<SCRIPT_ID>/edit` | Editor for a specific script |
| `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` | Deployed web app execution URL |

## Editor Environment

- **Code editor:** Monaco editor (not CodeMirror). Accessible as `monaco.editor.getModels()[0]` from the page's global scope.
- **Content injection:** Use `js` action with `monaco.editor.getModels()[0].setValue(code)` to replace editor content programmatically. Base64-encode the source code to avoid JSON escaping issues: `atob(b64)` decodes it at runtime.
- **Project title:** Clicking the project title text at top of editor enters inline rename mode. The renamed input is near the top nav bar.
- **Save:** Cmd+S via `document.dispatchEvent(new KeyboardEvent('keydown', {key:'s', metaKey:true, bubbles:true}))`. GAS also auto-saves every few seconds.

## Deploy Flow (New Deployment Dialog)

1. Click **Deploy** button (top-right toolbar) → dropdown opens
2. Click **New deployment** → dialog opens
3. Click **gear icon** next to "Select type" → type menu opens
4. Select **Web app** → form shows Description, Execute as, Who has access
5. Fill fields, click **Deploy**
6. If first deploy: **Authorization required** screen → click **Authorize access** → OAuth popup on `accounts.google.com`
7. In OAuth popup: click **Allow** to grant DocumentApp (or other) scopes
8. Popup closes → deployment completes → Web app URL shown

## Web App URL Pattern

```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

Capture via JS: `document.body.innerText.match(/https:\/\/script\.google\.com\/macros\/s\/[^\s"'<>]+\/exec/)`

## Abstract Target Notes

| Target | Selector hint |
|--------|---------------|
| Project title input | `input` near top nav, appears on click of project name |
| Deploy type gear | Button in New Deployment dialog, before/near "Select type" label |
| Description field | First `input` in deployment form |
| Execute as | `select` or `mat-select` labeled "Execute as" |
| Who has access | `select` or `mat-select` labeled "Who has access" |
| Allow button (OAuth) | `#submit_approve_access` or `[data-value="Allow"]` on `accounts.google.com` |

## Authorization Popup Handling

The OAuth consent popup opens at `accounts.google.com`. Chrome may focus it as a new tab. Since the popup is cross-origin from `script.google.com`, JavaScript cannot inject into it from the parent window. Yeshie must either:

1. Follow the new tab (if Chrome brings it to focus) and run `click_text "Allow"` there
2. Or use `perceive` to detect the current URL, then dispatch `click_text "Allow"` if on `accounts.google.com`

If Yeshie cannot follow the popup, the authorization step becomes a manual blocker — note in the SOMA report.

## Known Anomalies

- GCP SPA: each navigation takes 3-5s to fully render
- Monaco initialization takes ~3-4s after page load — include `delay 5000` before `js` injection
- Project name is "Untitled project" on creation; click the title text to rename inline
- The gear icon for deploy type may have `aria-label="Select type"` or similar
- Authorization may be skipped if the Google account already granted DocumentApp scope to a previous script
- `Execute as: Me` requires the deploying account (mw@mike-wolf.com) to have DocumentApp access to the target Doc — they are the owner, so this is automatic

## Tasks

| Payload | Description |
|---------|-------------|
| `tasks/deploy-apps-script.payload.json` | First-run deploy of Mike Review Queue append endpoint |
