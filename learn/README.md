# `learn/` — Yeshie's "learn one skill at a time" loop

Bootstrap scaffold that lets Yeshie land on a website it doesn't know, read
the docs, form a theory of how the site works, and learn one skill at a time.

The output of this loop feeds the existing Yeshie executor (`sites/<app>/tasks/`).

## Architecture

Four steps, parameterized by app name:

| Step | Script | What it does | Model |
|------|--------|--------------|-------|
| 1. fetch | `fetcher.py` | Pull docs corpus from configured seed URLs; ingest existing `sites/<app>` evidence | none (deterministic) |
| 2. theorize | `theorize.py` | Corpus → `theory.md` (conceptual model: entities, actions, navigation, failure modes, ranked skill candidates) | Sonnet |
| 3. propose | `propose_skill.py` | Theory → first Yeshie payload JSON + test cases | Sonnet |
| 4. execute | `execute.py` | POST payload to relay (`localhost:3333/run`); record outcome to `runs/` | (cheap models for in-loop classification — see below) |

**Cheap-model discipline.** Bootstrap (steps 2 & 3) is high-reasoning — Sonnet
via the `claude -p` CLI. Once a skill is encoded as structured JSON, executing
it against a live page is largely deterministic; any in-loop decisions
("which validation field failed?", "did the snackbar say success?") are
classification tasks that Haiku / Gemini Flash handle. The whole point of
encoding skills is to pay Sonnet prices once and run the skill cheaply forever.

## Layout

```
learn/
├── README.md                     ← you are here
├── loop.py                       ← main entry point
├── fetcher.py                    ← step 1
├── theorize.py                   ← step 2
├── propose_skill.py              ← step 3
├── execute.py                    ← step 4 (sketched; --live posts to relay)
├── llm.py                        ← thin wrapper around `claude -p`
├── apps/
│   ├── yeshid.yaml               ← per-app config (seed URLs, auth notes)
│   └── google-admin.yaml
├── yeshid/
│   ├── docs/                     ← fetched corpus + _corpus.json index
│   ├── theory.md                 ← generated conceptual model
│   ├── skills/                   ← proposed Yeshie payloads
│   └── runs/                     ← execution reports
└── google-admin/                 ← parallel layout, parameterized
    └── …
```

## Invoking the loop

### Run all bootstrap steps for an app

```bash
.venv-learn/bin/python learn/loop.py yeshid
```

This runs `fetch → theorize → propose` (skips `execute` by default).

### Run individual steps

```bash
python learn/loop.py yeshid --steps fetch
python learn/loop.py yeshid --steps theorize
python learn/loop.py yeshid --steps propose
```

### Execute the proposed skill against the live site

```bash
# Dry-run (just shows what would be POSTed):
python learn/loop.py yeshid --execute

# Actually fire it through the Yeshie relay:
python learn/loop.py yeshid --execute --live
```

Requires the Yeshie relay running on `localhost:3333` and the extension
connected — check with `curl -s http://localhost:3333/status`.

### Add a new app

1. Drop a YAML at `learn/apps/<app>.yaml` (copy `google-admin.yaml` as a template — set `app`, `display_name`, `home_url`, `docs_seeds`, `auth`, optionally `existing_site_dir`).
2. `python learn/loop.py <app>`.

The scaffold is **fully parameterized by app name** — no code changes needed
to onboard a new target. `google-admin.yaml` is pre-staged and ready to run
tomorrow.

## Setup

Python venv with the three deps:

```bash
python3 -m venv .venv-learn
.venv-learn/bin/pip install anthropic requests pyyaml beautifulsoup4
```

(`anthropic` is pinned for the future direct-API path, but the current loop
uses `claude -p` subprocess and authenticates via the Claude Code CLI's own
session — no `ANTHROPIC_API_KEY` needed.)

## Status — what works tonight vs. what's stubbed

**Working end-to-end (tested on YeshID):**
- ✅ Step 1 fetcher: pulls public marketing pages + ingests 25 existing payload/site-model files as ground-truth evidence. ~150K-char corpus produced.
- ✅ Step 2 theorize: 256-line `theory.md` with 13 sections (purpose, mental model, auth, entity model with 10 entities, action vocabulary matrix, navigation topology, state machine, UI fingerprint, permissions, failure modes, ranked skill candidates with leverage/difficulty scores, open questions, provenance). Real Sonnet output, not stubbed.
- ✅ Step 3 propose: emitted `00-user-add.payload.json` with 22 chain steps, 10 abstract targets, 6 test cases, schema-conformant, `mode: exploratory`, includes `proposalRationale`.
- ✅ Step 4 execute (dry-run): relay status confirmed, run report written. Schema for outcome capture in place.

**Stubbed / sketched:**
- ⚠️ Step 4 execute (live mode) is wired but unverified end-to-end against a freshly proposed skill. The proposed user-add skill is exploratory (uncached selectors), so a live run will exercise the resolver — expect partial successes that need iteration.
- ⚠️ Failure → re-theorize feedback hook (the actual *learning* loop) is marked `TODO` in `execute.py`. The structure is there: when an outcome diverges from `expect`, the next pass should append a refinement note to `theory.md` and re-run propose. Tomorrow's work.
- ⚠️ The fetcher does not crawl — it only fetches the seed URLs. For YeshID the seed list is short and `help.yeshid.com` 404s, so most evidence comes from the in-repo `sites/yeshid/` files. For Google Admin Console, the seed list points at `support.google.com/a/*` topic hubs but a real run may want a small recursive expansion.
- ⚠️ Theorize and propose both call Sonnet via `claude -p`. The CLI inherits whatever auth the parent session has. If running in a fresh shell, ensure `claude` is logged in.

## Honest read on the YeshID output

Because YeshID has 17 production payloads + a rich `site.model.json` already in
the repo, the theorize step had real ground-truth evidence and produced a
high-confidence theory. The skill it proposed (`user-add`) is essentially a
re-derivation of an existing payload (`sites/yeshid/tasks/01-user-add.payload.json`) —
which is the right behavior for a smoke test (we can compare). Where it
diverges from the production payload is informative:

- The proposed skill marks selectors as uncached (cachedConfidence 0) instead
  of inheriting the resolved data-cy selectors. That's correct — the loop
  shouldn't trust evidence it didn't verify itself.
- It picks slightly different verification candidates. Diff-worthy.

The first **real** test of the loop will be Google Admin Console tomorrow,
where there's no ground-truth in the repo and the theory has to be built from
support docs alone.
