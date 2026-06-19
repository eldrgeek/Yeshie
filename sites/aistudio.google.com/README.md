# aistudio.google.com Yeshie Recipe Set

Browser automation recipes for Google AI Studio (aistudio.google.com).

## Auth

All recipes require an active Google session on account `u/1` (mw.personalmail@gmail.com).
The `/u/1/` path segment pins the account index — omitting it may redirect to a different account.

The page is an Angular SPA using Material Design components (`mat-*`, `ms-*` prefixes).
Generated class names include `ng-tns-*` (Angular transclusion slots) — these are **not stable**
and must never be used as selectors. Use `aria-label`, stable class names, and text-content
matching instead.

## Bot Detection — Create API Key

Google's AI Studio applies server-side bot detection on the "Create key" submission step.
Fully automated key creation returns:
> "Failed to generate API key, The request is suspicious"

Recipe `02-create-api-key` navigates to the dialog and fills the key name, but **stops before
the final "Create key" click**. A human must complete that step. See recipe `_meta.botDetection`
for details.

## Selector Strategy

| Element | Stable Selector | Notes |
|---------|----------------|-------|
| "Create API key" page button | abstractTarget `create-api-key-btn` (text match "Create API key") | `ms-button-primary` class is reused on nav toggle, account switcher, and ToS dismiss banner — text matching is the only safe anchor |
| Name input (create dialog) | `input[aria-label="Name your key"]` | Stable aria-label; the generated `id` (UUID) changes per session |
| Cancel / Close dialog | `button[aria-label="Close dialog"]` | Stable aria-label |
| "Create key" (dialog submit) | `button.xap-inline-dialog.ms-button-primary` | Combined stable class unique to dialog submit |
| "Copy API key" per row | `button[aria-label="Copy API key"]` via `.xap-copy-to-clipboard` | aria-label is stable; do NOT use the icon text `content_copy` |
| "Show API Key(s)" toggle | `button.api-keys-toggle` | Stable dedicated class |
| Keys table | `mat-table, table` (inside `ms-api-keys-overview`) | Headers: Key, Project, Created, Billing Tier |

## Recipe Index

| # | Slug | Description | Risk | Auth |
|---|------|-------------|------|------|
| 01 | list-api-keys | List all API keys (names, projects, created dates, warning badges) | safe | google_u1 |
| 02 | create-api-key | Open create dialog, fill name, stop before submit (bot detection) | safe | google_u1 |
| 03 | copy-api-key | Click Copy API key for the first key row (value lands on clipboard) | safe | google_u1 |

## Known RSI Gaps

- **`03-copy-api-key` clipboard write**: The copy button is found and clicked correctly, but
  Chrome's clipboard security model requires a trusted user gesture for `navigator.clipboard.writeText()`.
  Programmatic `element.click()` via `chrome.scripting.executeScript` is NOT a trusted gesture.
  Workarounds: (a) add `clipboardWrite` to the extension manifest and rebuild, (b) implement a
  `mouse_click` action type using `trustedMouseClick` (CDP `Input.dispatchMouseEvent`), or (c)
  have the user manually click after the recipe navigates to the API keys page.
- No project-selector step in `02-create-api-key` — the project URL param pre-selects the project
  in the dialog; if multiple projects exist, a project dropdown may appear that is not yet mapped.
- "View more actions" (per-row `more_vert` menu) — delete / rename key flows are not yet covered.
- Key rotation workflows not covered.
- `03-copy-api-key` copies the first key in DOM order; a recipe param for key suffix selection
  (to target a specific row) is not yet implemented.
