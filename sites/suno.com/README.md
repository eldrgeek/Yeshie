# suno.com Yeshie Recipe Set

Browser-automation recipes for Suno (https://suno.com) via Yeshie. All recipes
require an active Suno login session in the connected Chrome.

Authored 2026-06-18 against the live `/create` page (account: Pro plan). All
selectors verified live; recipes follow the `wait_for` canon (no fixed `delay`).

**Updated 2026-07-08** (Mike Wolf + Claude/CCc): Suno redesigned the `/create`
form. `create-song` selectors re-verified live through the relay (all 7 fill steps
`ok`). The lyrics field changed from a `<textarea>` to a contenteditable `<div>`,
and the style field is now scoped by a stable wrapper `data-testid`. See the
updated **Song create form** section below.

## Recipes

| # | Task | Params | Risk | Verified |
|---|------|--------|------|----------|
| 01 | create-workspace | `workspace_name` | creates a workspace (reversible) | flow confirmed live |
| 02 | select-workspace | `workspace_name` | safe | yes |
| 03 | create-song | `title`, `style`, `lyrics` | **consumes credits at final step** | re-verified live 2026-07-08 (fill + generate) |

Run via the relay, e.g.:

```
yeshie_run payload_path=sites/suno.com/tasks/01-create-workspace.payload.json params={"workspace_name":"My New Space"}
```

## Page model (verified selectors)

**Auth check:** `button[aria-label="Profile menu button"]` present ⇒ logged in
(its text shows username + plan, e.g. "wolfreporter Pro Plan").

**Workspaces** (right-hand drawer on `/create`; elements exist in the DOM and are
clickable even when the drawer isn't expanded):
- Search: `input[aria-label="Search workspaces"]`
- Create: button text **"Create New Workspace"** — creates an *Untitled* workspace
  immediately and opens an inline rename field `input[placeholder="Untitled"]`;
  type the name and press Enter. (There is **no** name dialog.)
- Select: each workspace is a card whose text starts with its name
  (`"<name><N> Songs · <age>"`) — click by text.

**Song create form** (`/create`, **Advanced** tab = Custom mode) — *selectors as of
the 2026-07 redesign, re-verified 2026-07-08*:
- Mode tabs: text **"Simple" / "Advanced" / "Sounds"**.
- Lyrics: `div[aria-label="Lyrics editor"]` — a **contenteditable div** (class
  `lyrics-editor-content`), NOT a textarea anymore. The old
  `textarea[data-testid="lyrics-textarea"]` is gone. The relay's `trustedType()`
  detects contenteditable and fills it with CDP `Input.insertText`, so the `type`
  action works unchanged. Lyric sub-modes: **"Write" / "Prompt" / "Instrumental"**.
- Style: `[data-testid="create-form-styles-wrapper"] textarea`. The style field is
  still a `<textarea>` with no stable attribute of its own (rotating genre
  placeholder), but its section wrapper now carries a stable `data-testid`. The form
  contains **4 textareas** (cowriter / style / simple-prompt / sounds), so the old
  positional `textarea:not([data-testid="lyrics-textarea"])` selector is now
  ambiguous — always scope by the wrapper testid.
- Title: `input[placeholder="Song Title (Optional)"]` (stable placeholder). Two
  mirrored inputs exist (responsive layouts) bound to the same state; `querySelector`
  first-match (what `trustedType` uses) is correct.
- Generate: `button[aria-label="Create song"]` — disabled until fields have content;
  clicking it **spends credits**.

## Notes / gotchas

- `create-song` step `s8` is the generate click. Remove it to fill the form without
  generating (useful for review/QA — this is how the 2026-07-08 re-verify was run
  without spending an extra credit). It is intentionally the last step.
- The style field is scoped by `data-testid="create-form-styles-wrapper"`. If a future
  Suno build renames that wrapper, re-anchor to the "Styles" section label instead.
- Recipes assume Advanced mode for song creation; `s2` clicks "Advanced" to ensure it.
- **Selector-drift lesson (2026-07-08):** Suno ships React redesigns that swap element
  types (textarea → contenteditable) and reshuffle the DOM. When a step times out on a
  `wait_for`, inspect the live DOM for the new stable hook (prefer `data-testid`, then
  `aria-label`, then a scoped wrapper) rather than falling back to CIC/computer-use for
  the whole flow — fix the recipe so the relay keeps owning the runtime.
