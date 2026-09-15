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

**Updated 2026-09-15** (Mike Wolf + Claude Opus 5/CCc): `create-song`'s proof step
(s9) was rebuilt after it went red on real creates. It now waits on the clip row's
own attributes, because Suno shows a skeleton instead of the title while a take is
generating. Two steps (s1a, s8b) raise the tab, because Chrome does not render the
clip list in a hidden tab. A guard (s1e) stops the run while an earlier take with
the same title is still generating. See **Clip list and the proof step** below.

## Recipes

| # | Task | Params | Risk | Verified |
|---|------|--------|------|----------|
| 01 | create-workspace | `workspace_name` | creates a workspace (reversible) | flow confirmed live |
| 02 | select-workspace | `workspace_name` | safe | yes |
| 03 | create-song | `title`, `style`, `lyrics` | **consumes credits at s8** | fill + generate re-verified live 2026-07-08; proof (s9) rebuilt 2026-09-15, live check pending |

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

**Clip list and the proof step** (`/create`, the workspace's list of takes) —
*checked 2026-09-15 in the live DOM and in Suno's client bundle*:
- Row: `[data-testid="clip-row"]`, one per take. The row carries the take's title in
  `aria-label` and its state in `data-clip-status`: `submitted`, `queued`,
  `processing` or `streaming` while it generates, then `complete` or `error`.
- Title link: `.clip-title-wrapper a[href^="/song/"]`. It is **missing while a take is
  freshly generating**, because Suno draws a skeleton there instead. So neither the
  title text nor the song link can prove that a Create worked. The row attributes can.
- Proof (s9): `[data-testid="clip-row"][aria-label="<title>"]:not([data-clip-status="complete"]):not([data-clip-status="error"])`.
  Older takes with the same title are `complete`, so they do not match. A title that
  contains a double quote or a backslash breaks this selector.
- **Hidden tabs:** Chrome does not render a hidden tab. The list stayed empty for 60 s
  in a background tab and filled within 2 s of the tab being raised. `activate_tab`
  (s1a, s8b) raises the tab and focuses Chrome's window before the list is read.
- **Feed API:** `GET studio-api.prod.suno.com/api/feed/v2` (page 0) is not reliable for
  new songs: it left out two takes while they were generating.
  `GET studio-api.prod.suno.com/api/feed/?ids=<id1>,<id2>`, with the Bearer token
  from `await window.Clerk.session.getToken()` in a suno.com tab, did return them, but
  it needs the clip ids.

## Notes / gotchas

- `create-song` step `s8` is the generate click. To fill the form without generating,
  remove `s8`, `s8b` and `s9`; the proof only makes sense after a Create. This is how
  the 2026-07-08 re-verify was run without spending an extra credit.
- **Space runs.** Suno drops a Create without any error while too many songs are
  generating. Start the next run only after the previous run's takes finish. `s1e`
  enforces this for the same title: it fails before the Create click.
- The style field is scoped by `data-testid="create-form-styles-wrapper"`. If a future
  Suno build renames that wrapper, re-anchor to the "Styles" section label instead.
- Recipes assume Advanced mode for song creation; `s2` clicks "Advanced" to ensure it.
- **Selector-drift lesson (2026-07-08):** Suno ships React redesigns that swap element
  types (textarea → contenteditable) and reshuffle the DOM. When a step times out on a
  `wait_for`, inspect the live DOM for the new stable hook (prefer `data-testid`, then
  `aria-label`, then a scoped wrapper) rather than falling back to CIC/computer-use for
  the whole flow — fix the recipe so the relay keeps owning the runtime.
- **Proof lesson (2026-09-15):** a proof step must be tested against the state it
  exists to detect. The first s9 was checked only against finished songs, so it never
  saw that a generating take has no title text.
