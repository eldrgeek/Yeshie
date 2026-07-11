# elevenlabs.io Yeshie Recipe Set

Browser-automation recipes for ElevenLabs (https://elevenlabs.io/app/settings/api-keys), built
2026-07-09 for the estate's API-key-rotation capability (`~/Projects/key-rotation/`). All recipes
require an active ElevenLabs login session in the connected Chrome (`ChromeMain` debug profile).

**No key is ever regenerated/created/deleted/disabled by these recipes as delivered** — they stop
one step before any irreversible action, per the estate's rotation-capability guardrails. See
`~/Projects/key-rotation/README.md` for the full design and the manual steps to actually fire a
rotation.

## Why ElevenLabs needs "create new + revoke old," not "regenerate in place"

Confirmed 2026-07-09 (see `~/Projects/key-rotation/providers/ELEVENLABS.md`): there is no REST
endpoint for API-key management (`v1/user/api-keys`, `v1/workspace/api_keys` all 404/405/401
against `xi-api-key` auth), and the dashboard itself has no "Regenerate" action — only Create,
Rename (probably, unconfirmed), Disable, and presumably Delete. Rotation is therefore: create a
new key (`02-create-api-key`), propagate it everywhere, verify, then disable/delete the old one
via the per-row menu (`03-inspect-key-row-menu` finds the menu; the actual disable/delete click is
not automated in any recipe here).

## Recipe Index

| # | Slug | Description | Risk | Verified live? |
|---|------|-------------|------|-----------------|
| 01 | list-api-keys | Read the keys table (name, masked suffix, created, enabled) | safe | **yes, 2026-07-09** |
| 02 | create-api-key | Open 'Create Key' dialog, fill name, stop before the actual create submit | safe up to the stop point | button text verified; dialog internals NOT verified (deliberately not opened) |
| 03 | inspect-key-row-menu | Open the first row's kebab menu, read its labels, close without selecting | safe if selector is right (see incident below) | **not yet — see incidentNote in the payload** |

Run via the relay, e.g.:
```
yeshie_run payload_path=sites/elevenlabs.io/tasks/01-list-api-keys.payload.json
```

## Page model (verified selectors, 2026-07-09)

**Keys table** at `/app/developers/api-keys`. Headers: `Name | Key | Created | Enabled | ` (last
column has no header text). Live sample (masked, read via the relay's generic `read` action — the
DOM never exposes a raw secret here):

| Name | Key | Created |
|---|---|---|
| Claude MovieMaker | •••••••••••••••••••••e26a | Apr 29 |
| Claude Moviemaker 2 | •••••••••••••••••••••1450 | Jul 5 |
| CLI Key | •••••••••••••••••••••29d3 | Jun 25 |

**"Create Key"** — top-of-page button, stable text `Create Key`.

**Per row, two SEPARATE controls that look similar — do not confuse them:**
- **`Enabled` column**: an icon-only toggle switch button with **no text/aria-label** captured by
  the relay's generic read. Clicking it opens a **"Disable API Key"** confirmation dialog
  immediately (no intermediate menu) — this is destructive-adjacent (kills the key once confirmed)
  and easy to hit by accident with a positional selector.
- **Last column ("kebab")**: a button with stable literal text `Open menu` — this is the intended
  target for inspecting Rename/Delete/etc. actions.

## Incident (2026-07-09) — read before writing new recipes against this page

A discovery probe used the selector `table tbody tr:first-child button`, expecting to hit the
kebab. Because `button` matches in DOM order and the `Enabled` toggle is the first `<button>` in
the row (one column left of the kebab), the click landed on the toggle instead and opened:
> "Disable API Key — Are you sure you want to disable the API key 'Claude MovieMaker'? It will no
> longer work until it's enabled..."

The dialog was dismissed with `Escape` before any confirm click — **no key was disabled**. Lesson
applied to every recipe in this set: **never select ElevenLabs row-action buttons positionally.**
Use `click_text` on the button's own literal text (`Open menu`) instead.

## Known RSI Gaps

- `click_text` (the relay's implementation, `src/step-executor.ts`) clicks the **first** DOM match
  only — no occurrence/nth parameter, and `find_row` clicks a row's first `<a>` link, not an
  arbitrary button by text scoped to that row. So `03-inspect-key-row-menu` can only ever reach
  **row 1's** kebab. Targeting a specific named key needs either a new scoped-click relay
  capability or a human click. Don't invent a param the executor doesn't support.
- The create-dialog's field selectors (`02-create-api-key` steps s4/s5) and the exact label of its
  final submit button are unverified — deliberately not opened live this pass to avoid any
  misclick risk during a live OLLI class running on `ELEVENLABS_API_KEY`. First live run should
  expect to heal these selectors (per the Yeshie "heal, don't abandon" policy) with a human
  watching, not run unattended.
- Per-row menu contents (Rename? Delete? anything else?) are undiscovered — `03-inspect-key-row-menu`
  is designed but not yet run correctly (the one live attempt hit the wrong control, see incident
  above).
- **Critical, separate finding** (see `~/Projects/key-rotation/providers/ELEVENLABS.md`): the
  `ELEVENLABS_API_KEY` value actually used in production (`playmaker/.env` as of the 2026-07-05
  incident writeup in `api-keys-reference.md`) matched **neither** of the two dashboard-visible
  managed keys at the time — some older/unmanaged credential outside this UI entirely. Before
  rotating "the" key, confirm which dashboard row (if any) corresponds to the live production key,
  by comparing suffix characters, not by name/label.
