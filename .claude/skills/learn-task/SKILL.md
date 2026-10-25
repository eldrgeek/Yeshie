---
name: yeshie:learn-task
description: >
  Teach Yeshie a task on any website from one recording of Mike doing it: record,
  compile the recording into a tooltip guide plus a draft payload, reword and check
  the guide, run it with Mike, and promote the payload after clean guided runs.
  Trigger on: "learn how to", "watch me do", "record this", "teach Yeshie",
  "Do-It-Once", "turn this into a guide", "learn-task".
---

# Yeshie — Learn a task from one recording

The loop: **record → compile → reword → guide → promote**. A learned task always
runs as a guide (Mike clicks, Yeshie points) before Yeshie is allowed to click.

## 1. Record

- Mike presses **Ctrl+Alt+R** in Chrome (a red ● REC badge shows), does the task
  once, and presses Ctrl+Alt+R again. Or start and stop it for him:
  `curl -s -X POST localhost:3333/trace/toggle -H "x-dispatch-token: $(cat ~/.dispatch/relay.secret)" -d '{}'`
- Every click, field edit and page load goes to the relay and lands in
  `~/.dispatch/traces/<episodeId>.jsonl`. Password fields are never recorded.
  Traces stay out of the repo because they hold what Mike typed.
- Recording survives full page loads; it covers every open tab, so ask Mike to work
  in one tab.

## 2. Compile

```
node scripts/learn-task.mjs --list                      # newest recording first
node scripts/learn-task.mjs <episodeId> --name <slug> --title "What the task does"
```

Writes `sites/<host>/guides/<slug>.guide.json` and
`sites/<host>/tasks/<slug>.payload.json` (`_meta.learned.status: "draft"`).
Use `--dry-run` to look first, `--force` to replace. What it does:

- One step per click. Typing folds into the click that submits it
  ("Type the passcode in the Passcode box, then click Save").
- A click that loaded a new page gets `doneWhen.urlIncludes`; if the new URL is a
  prefix of the old one it uses `selectorGone` on the clicked control instead.
- Typed values become payload params. A field whose name looks secret
  (pass, code, token, pin…) keeps no example value.
- Every `review:` line it prints needs settling before the guide runs.

## 3. Reword and check

The compiler's instructions are terse. Before Mike sees the guide:

- Rewrite each `instruction` in plain words, saying which control and why
  (compare `sites/zoom.us/guides/personal-room-passcode.guide.json`).
- Add a first sign-in step (`target: ""`, `doneWhen.urlIncludes` of the start
  page) if the site may log him out.
- Settle the review notes: add selectors for unnamed controls, and a `doneWhen`
  for a last step that only types.
- Give params readable descriptions in the payload.

## 4. Guide

`node scripts/guide.mjs sites/<host>/guides/<slug>.guide.json` (see the
`yeshie-guide` skill). Exit 0 = every step finished. If a tooltip pointed at the
wrong control or a step never finished, fix that step's `target` or `doneWhen`
and run again. If Mike did it differently, record again and recompile.

## 5. Promote

After each clean guided run, bump `_meta.learned.cleanGuidedRuns` in the payload.
At `promoteAfter` (2), offer Mike "do it for me": dry-run the payload, then run it
live with his params; on success set `status: "learned"`. Failures from then on go
to HEAL like any other payload.
