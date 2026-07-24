# docs.google.com Yeshie Recipe Set

Browser-automation recipes for Google Docs (https://docs.google.com) via Yeshie.
All recipes require an active Google login in the connected Chrome (`ChromeMain`).

Authored 2026-07-24 (Mike Wolf + Claude/CCc) from the hand-driven CIC flow that
shared the Izzy voice-release doc (doc id
`1BhxR5bX05vdlF0J28MgyF_ZdmvxYdmamKbxMytG2JG0`), per the Yeshie-first canon:
CIC was the discovery pass; this recipe makes the next run relay-native.

## Recipes

| # | Task | Params | Risk | Verified |
|---|------|--------|------|----------|
| 01 | share-doc | `doc_url`, `emails`, `role`, `message?`, `verify_email?` | **sends notification email to recipients** | ✅ 2026-07-24 live relay run, all 29 steps green — access list showed "Claude AI claude@mike-wolf.com **Viewer**" against fresh server state; test share revoked after. New shares only (see caveats in `_meta.verified`). |

Run via the relay, e.g.:

```
yeshie_run payload_path=sites/docs.google.com/tasks/01-share-doc.payload.json params={"doc_url":"https://docs.google.com/document/d/<id>/edit","emails":"a@example.com","role":"Editor","verify_email":"a@example.com"}
```

## Page model (live-verified 2026-07-24 through the relay; supersedes the hand-driven notes)

**THE IFRAME (load-bearing):** everything inside the Share dialog renders in a
same-origin iframe, `iframe.share-client-content-iframe`, src
`/drivesharing/driveshare`. Top-document selectors can NEVER reach it — the
first relay run failed exactly here. Every dialog step carries
`"frame": "drivesharing/driveshare"` (per-step frame scoping, added to the
engine for this recipe; the substring must include `/driveshare` because a
sibling bridge frame `drivesharing/_/bscframe` also matches the looser word).
The Share button itself is top-document. Beware: the doc page always contains a
*hidden* `div[role='dialog']` (`#document-details-bubble-container`), so an
unscoped dialog wait false-matches instantly.

**Auth check:** landing on `accounts.google.com` ⇒ session expired
(`chrome-debug-restart` for a fresh `ChromeMain` session).

**Share flow** (as actually relay-run):
Share button → *(untitled docs only:* "Name before sharing" interstitial → Skip*)*
→ recipient combobox in the iframe (chip on Enter) → role button → role menu
item → Send → re-open → verify People-with-access.

- Share button: `#docs-titlebar-share-client-button` (long-stable container id);
  clickable child is `div[role='button']` with `aria-label` starting `"Share"`.
  Now a `scb-split-button` (main half + quick-actions arrow); the css cascade
  resolves the main half. Bonus: the container's `vsjson` attribute carries a
  JSON summary ("Private to only me" / "Shared with 1 person") — a free
  no-dialog verification hook.
- **Naming interstitial (untitled docs):** a top-document GM3 dialog
  ("Give your untitled document a name" — Skip/Save) appears before the share
  UI. Recipe steps s4b (soft wait for
  `.javascriptMaterialdesignGm3WizDialog-dialog__surface`) + s4c (optional
  `click_text` "Skip") absorb it; named docs sail past.
- Recipient combobox: `div[role='dialog'] input[aria-label*='Add people']`
  *inside the iframe* — label suffix has now been seen in a third variant
  ("Add people, groups, spaces, and calendar events"); the `Add people` prefix
  anchor held. A final **Enter** commits the trailing token to a chip.
  Frame-mode typing preserves focus (no trailing Tab), so the Enter `key` step
  lands on the combobox. **Chip commit is timing-sensitive**: on a slow page
  the Enter can fire before the suggestion list is up and the commit is
  silently lost — recipe does Enter → 1s settle → second Enter (a no-op when
  already chipped), then guards on the *email-specific* chip
  `[data-hovercard-id*='<verify_email>']` (the generic `[data-hovercard-id]`
  false-matches the owner's own People-with-access row instantly).
- Recipient chips: `[data-hovercard-id="<email>"]` — reliable "address
  resolved" signal and the verification hook in People-with-access.
- Role selector: **native `<button aria-label='Editor. change permission'
  aria-haspopup='menu'>`** — NOT a `div[role='combobox']` (authoring-session
  guess, never matched live). Anchor `button[aria-label*='change permission']`
  (also excludes the neighboring "Restricted change general access" button).
  It renders a beat AFTER the chip commits — guard with an explicit `wait_for`
  (recipe s8b) before clicking.
- **Trusted clicks required from here on:** synthetic
  PointerEvent/MouseEvent sequences flip the role button to
  `aria-expanded=true` but Google only *renders the menu contents* on real
  input. Steps s9/s10/s12 (+optional variants) use `"trusted": true` — engine
  dispatches real CDP `Input.dispatchMouseEvent` at viewport coordinates
  (iframe offset + element rect). Menu items are `position:fixed`
  (`offsetParent === null`), so hit-testing is rect-based, not
  offsetParent-based.
- Role menu options: menu items with exact text **Editor / Commenter / Viewer**
  (capitalized), selected via trusted `click_text` in the iframe.
- Message: `div[role='dialog'] textarea` in the iframe (same compose view in
  the current UI; optional steps s11b/s12b still cover the older two-screen
  notify flow).
- Send: text button **"Send"** in the iframe — no stable id; trusted
  `click_text` is the anchor.
- Verification: **navigate the doc URL fresh, then** re-open Share — the share
  client wedges after an open/Send/close cycle in one page instance and a
  same-page re-open shows an empty dialog shell (live-observed). The fresh
  load also makes the check honest: it reads persisted server state. The
  iframe dialog then lists **People with access**; recipe 01 stores the dialog
  text as `access_list` and (optionally) `wait_for`s
  `[data-hovercard-id*='<verify_email>']` — timeout means the share did not
  stick and the chain fails. (Not `assert`: that action exists only in the
  jsdom test mirror `src/step-executor.ts`, not the extension runtime.)
  **Caveat:** the s17 assert proves *presence*, not *role* — check the
  `access_list` text ("<name> <email> <Role>" per member) when the role
  matters. **Re-share limitation:** for an already-shared member the dialog
  becomes a role-edit flow (changes apply via "Save", not "Send") — this
  recipe targets NEW shares only.

**Engine capabilities added for this recipe** (in
`packages/extension/src/entrypoints/background.ts`, benefit every recipe):
- `"frame": "<url substring>"` on `wait_for` / `click` / `click_text` / `type`
  / `read` — scopes DOM work to the matching iframe via
  `chrome.scripting.executeScript({frameIds})`; `wait_for` lazily re-resolves
  the frame inside its poll loop (dialog iframes load late and get torn down).
  Frame-mode `type` focuses in-frame and lands text via trusted
  `Input.insertText` (CDP input follows focus across frames), preserving focus
  (no trailing Tab).
- `"trusted": true` on `click` / `click_text` — real CDP mouse events at
  frame-offset coordinates for widgets that ignore or half-honor synthetic
  events.

## Notes / gotchas

- **Sending is not reversible.** Access can be revoked afterwards, but the
  notification email cannot be recalled. "Notify people" is left at its default
  (checked); passing `message` fills the note, omitting it sends Google's stock
  notification.
- **External-domain shares** can pop a "Share anyway?" confirmation — optional
  step `s10b` clicks through it when present.
- **Roles are exact menu text**, capitalized: `Editor` | `Commenter` | `Viewer`.
  Lowercase will miss `click_text`.
- **Not yet relay-verified.** Selectors come from the hand-driven session plus
  long-stable Docs hooks. On first live run, if a `wait_for` times out, inspect
  the live DOM for the new stable hook (prefer `data-testid`, then `aria-label`,
  then a scoped wrapper) and heal the payload — don't finish the flow in CIC.
- The same dialog serves Sheets/Slides/Drive; if recipes for those are ever
  needed, extract the share sub-chain rather than re-deriving selectors.

## Sibling capability: create a Google Doc from markdown/HTML

Deliberately **not** a browser recipe. Drive's upload API converts HTML natively
(`files.create` with `mimeType: application/vnd.google-apps.document` and an
HTML media body), which is faster and far more robust than driving the Docs
editor through paste/format steps — markdown just needs an HTML render first
(`pandoc` or similar). Route that task through the Drive MCP / Drive API using
Mike's Google credentials (see `~/Projects/CLAUDE.md` → Google account topology:
prefer `mw.personalmail@gmail.com`), then feed the resulting doc URL into
recipe 01 to share it.
