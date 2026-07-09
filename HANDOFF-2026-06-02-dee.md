# Dee → Dee Handoff — 2026-06-02

**From:** Sonnet-4-6 instance, session bf3b756c-de06-405f-8fbb-d11aa83b7100
**To:** Whichever Dee Mike spawns next
**Reason:** Context length / latency. Mike asked for handoff.

MEMORY.md auto-loads — don't re-summarize what's there. This doc covers immediate state only.

---

## In-flight work (will keep running after this session ends)

**PID 67408 — corpus expansion worker.** Spawned 2026-06-03T00:04:55Z. Renames /papers → /corpus on Levinese; ingests videos/blog/magazine/substack/X archives; adds filter chips by type; applies `content-visibility: auto`; updates dictionary linkifier for non-DOI cross-links; 301 redirects /papers → /corpus.

Report will land at `~/Projects/SOMA/audits/20260603T000455Z-levinese-papers-to-corpus-expansion.md`. Check there first thing.

**Survival check:** when next Dee starts, run `ps -p 67408 -o pid,etime,stat 2>/dev/null` — if alive, let it finish. If done, read the report and verify the live state at https://levinese-preview.netlify.app/corpus.

---

## Levinese — what's live now (commit chain today)

| Commit | What landed |
|---|---|
| a03cecb | Mike's close-reading additions (18 new terms from Self-Improvising Memories) |
| 5a8eacf | Git Gateway CD pipeline + content collections + Decap CMS |
| c8f8753 | Dictionary → paper linkage via DOI slugs; deep-link + auto-expand on /papers |
| 2cb4b2c | scroll-margin for hash deep-link; live search filter on /papers |
| 09af90e | 3D semantic atlas (UMAP, three.js) — v1, way too big |
| dda4b91 | Atlas: shrink points 30x, enable pan+zoom, replace orbital rings, add fog |
| b988c56 | Paper title (not DOI) as link text; schema hardened for non-DOI papers |
| **(pending)** | Corpus expansion (PID 67408) |

**Verifications outstanding** when next session opens (do these first):

1. `curl -sL https://levinese-preview.netlify.app/dictionary/ | grep -c 'href="/papers#'` — should be ~133. If links show **DOI strings** as text rather than paper titles, b988c56 hasn't deployed yet via CD; check latest deploy state.
2. **/dictionary search** — earlier commit said "live search filter on /papers" only. Verify /dictionary search box also works on live; if not, dispatch a follow-up (same pattern, different file).
3. **/atlas** — Mike sent a screenshot of v1 as a giant orange blob. v2 (dda4b91) ships smaller points + pan/zoom. Spin it and confirm it's navigable.

**Known architecture:**
- Astro + Tailwind, content collections under `src/content/{papers,terms,colophon}/`
- Build via `npm run build`; deploy via git push (CD now works — confirmed)
- Decap CMS at /admin/ — works after Mike clicked Git Gateway enable in Netlify dashboard earlier today
- `scripts/deploy.sh` has hardcoded `--site=2ab17854-...` flag — use it if you ever fall back to manual deploy, to prevent the cross-link incident from Nov 2026 (the one where legends content overwrote Levinese)

---

## Other live tracks

**Legends membership site (`~/Projects/legends-membership-site/`)**
- Live: https://legends-membership.netlify.app
- GitHub: `eldrgeek/legends-membership` (CD wired, auto-deploys on push)
- Open PR: branch `fix/resources-dropdown` — a worker landed it today, NOT merged to master, waiting for human review. Greg should look first.
- Git Gateway enabled in Netlify dashboard (Mike clicked it today). Decap CMS at /admin-cms/ should work end-to-end.

**Bill-talk**
- Fix landed 2026-06-01: dropped the "always assumes it's Greg" behavior. ElevenLabs agent prompt updated to ask "what's your name?" first.
- Reconstructed source at `~/Projects/bill-talk/` (was never local before).
- Live: https://bill-talk.netlify.app

**Webwright**
- Installed and evaluated. Report: `~/Projects/SOMA/audits/20260601T234626Z-webwright-install-and-eval.md`
- Conclusion: complement to Yeshie, not replacement. Yeshie wins for live-Chrome-session tasks; Webwright wins for "this should be a recipe / run from VPS / hand to another agent."
- Memory: `reference_webwright.md`

**Levin email**
- Draft at `~/Projects/SOMA/state/levin-archive/phase2.5-logs/EMAIL_TO_LEVIN_DRAFT.md` — was Phase C of the archive plan. Mike pivoted to "build a searchable directory with reachability checks" instead, so email is **deprecated**. Don't send unless Mike asks.

---

## Architecture learnings from this session (worth retaining)

1. **Netlify CD link requires dashboard OAuth, not API.** `installation_id` cannot be set via PATCH — Netlify enforces dashboard-only. But once Mike clicks "Link repository" once, the field stays even if API later returns null for it. Both legends and Levinese are now CD-wired despite `installation_id: null` in API response. Don't be fooled by the field.

2. **Git Gateway also dashboard-only.** API returns 422 "Provisioning this addon via API is not supported." Must be enabled in `/projects/{name}/identity` → Services → Enable Git Gateway. Mike did this for both Levinese and Legends today.

3. **Netlify deploy cross-link incident pattern.** If a `netlify deploy --prod` runs from a folder while its CLI link is mistakenly pointing at a different site, content goes to the wrong place. Mitigation: always use `--site={uuid}` flag explicitly. `scripts/deploy.sh` in both projects has this baked in.

4. **Yeshie DSL: 17 actions.** `wait`/`extract_text` return `unsupported`. Use `wait_for`/`read`. If even `navigate` returns unsupported, extension is stale — reload. Reference: `reference_yeshie_dsl.md`.

5. **cc_dispatch pattern reliable for 5-15 min jobs.** Workers cost $1-3 each, complete cleanly, write audit reports to `~/Projects/SOMA/audits/`. Use for substantive work; not for trivial diagnostics (use `shell_exec` directly).

6. **Mike's typo for Levin.** Mike sometimes types "Mike" when he means "Levin" (e.g. "everything Mike has written or said" → Levin's corpus). Read by context; this is the Levinese site, not a Mike anthology.

---

## Recommended next moves

In order:

1. **Verify corpus expansion worker (PID 67408) landed.** Read its report; check /corpus is live with proper filter chips.
2. **Reply to Mike with corpus state** + concrete clickable verifications.
3. **Atlas re-projection.** Once /corpus is stable, dispatch a worker to embed the new ~720 items (videos, blog, magazine, substack, X) with the same BGE model and re-run UMAP including them. Update `src/data/atlas.json`. Cluster colors should encode type (paper vs video vs blog) — better signal than year-gradient when types are mixed.
4. **Dictionary search verification.** Quick check; one-line fix if broken.
5. **Catch up on legends-membership `fix/resources-dropdown` branch** — has been waiting for review since today. Surface to Mike when he's ready.

---

## Paths cheatsheet

| What | Where |
|---|---|
| Levinese repo | `~/Projects/Levinese/` |
| Legends repo | `~/Projects/legends-membership-site/` |
| Bill-talk | `~/Projects/bill-talk/` |
| Webwright | `~/Projects/Webwright/` |
| Cc-dispatch logs | `~/Projects/cc-dispatch/logs/` |
| Audit reports | `~/Projects/SOMA/audits/` and `~/Projects/SOMA/state/audits/` |
| Levin archive data | `~/Projects/SOMA/state/levin-archive/` |
| Personas | `~/Projects/SOMA/personas/` |
| Memory (auto-loaded) | `~/Library/.../agent/memory/MEMORY.md` |

---

## What to NOT do

- Don't ask Mike for clicks before trying Yeshie / API / CLI / Webwright paths.
- Don't deploy via `netlify deploy --prod` without the `--site=` flag.
- Don't use `wait` or `extract_text` in Yeshie payloads (unsupported).
- Don't merge legends `fix/resources-dropdown` until Mike reviews.
- Don't send the Levin email (deprecated).
- Don't use `claude_code` tool — use `cc_dispatch` for dispatched work.
- Don't ingest things Mike didn't ask for. He's clear when he wants more.

— Sonnet 4.6, end of session bf3b756c
