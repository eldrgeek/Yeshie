# claude.ai Yeshie Recipe Set

Browser-automation recipes for Claude web (https://claude.ai) via Yeshie. All
require an active claude.ai login in the connected Chrome. Authored & verified
live 2026-06-18 (account: Mike Wolf). They follow the `wait_for` canon.

These are the Claude-side building blocks for the **Claude → Suno song pipeline**.

## Recipes

| # | Task | Params | Risk |
|---|------|--------|------|
| 01 | create-project | `project_name` | creates a project (reversible) |
| 02 | open-project | `project_name` | safe |
| 03 | create-song-spec | `content` | starts a chat + model usage |
| 04 | extract-song | — | safe (read-only) |

## Verified page model

- **Auth/identity:** `button "Mike Wolf, Settings"` present ⇒ logged in.
- **New project:** button text **"New project"** → dialog with
  `input[placeholder="Name your project"]` + **"Create project"** button.
- **Open project:** `input[placeholder="Search projects..."]` to filter, then each
  project is a card (`a[href="/project/<id>"]`); click by name. (Each card also has a
  `button[aria-label="More options for <NAME>"]` exposing the name.)
- **Prompt input:** `[aria-label="Write your prompt to Claude"]` (a ProseMirror /
  tiptap contenteditable — Yeshie types into it fine).
- **Submit:** `button[aria-label="Send message"]`. **Pressing Enter via automation
  does NOT submit** — you must click this button. (This was the one real gotcha.)
- **Turn-complete signal:** the response container carries `data-is-streaming`
  (`"true"` while generating, `"false"` when done); the `Stop response` button is
  present only while streaming. Recipes wait for `[data-is-streaming="false"]`.
  Reliable for a fresh one-shot conversation; for multi-turn, a prior response's
  `false` could match early — guard accordingly.
- **Assistant message text:** `.standard-markdown` (inside `.font-claude-response`).
  Reading this returns the clean reply (no reasoning preamble).

## Extraction format

`create-song-spec` instructs Claude to reply as exactly:

```
TITLE: <title>
STYLE: <comma-separated style tags>
LYRICS:
[Verse] ...
[Chorus] ...
```

Parse `song_spec` with: `TITLE -> /TITLE:\s*(.+)/i`, `STYLE -> /STYLE:\s*(.+)/i`,
`LYRICS -> everything after the first "LYRICS:"`. Verified to parse cleanly.

## The complete pipeline (next step)

```
open-project (or create-project)  →  create-song-spec(content)  →  parse TITLE/STYLE/LYRICS
        →  suno.com/select-workspace(name)  →  suno.com/create-song(title, style, lyrics)
```

Recipes 03/04 already capture and (with the parse above) yield the three fields the
Suno `create-song` recipe needs as `title` / `style` / `lyrics`. The remaining piece
is the orchestrator that runs these in sequence, parses the spec, and hands off to
Suno — that's the "complete workflow" to build next.

Sandbox project used for verification: **"Yeshie Songs"**.
