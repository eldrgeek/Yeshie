"""
Step 2 of the loop: read the corpus, ask Sonnet to produce theory.md.

The theory is the *conceptual* model. It is one layer of abstraction above
sites/<app>/site.model.json (which is mechanical: selectors, state graph).
The theory captures: why this app exists, what nouns/verbs make up its world,
how navigation and permissions flow, what failure modes the docs warn about,
and which skills would be highest-leverage to encode first.

Why this matters: skill generation that is grounded only in scraped HTML tends
to over-fit to whatever happens to be on the rendered page. A theory forces
the model to reason about the app at the level a competent admin would —
which makes the skills it proposes more durable across UI revisions.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

from llm import call_claude

LEARN_ROOT = Path(__file__).resolve().parent

# Per-corpus chunk ceiling. Keep total prompt under ~150k chars to stay well
# inside Sonnet's 200k context window with room for the system instructions.
PER_DOC_CAP = 12000
TOTAL_CAP = 150000

THEORY_PROMPT = """You are bootstrapping autonomous knowledge of the web application named "{display_name}" ({home_url}).

You are reading a corpus of documentation pages and (where available) existing structured site evidence (payload JSON files, site model JSON). Your job: produce a single Markdown document, theory.md, that captures the **conceptual model** of this application — strong enough that a downstream skill-generator can propose concrete UI automation skills against it without re-reading the corpus.

The theory must be MORE than a list of pages. It must capture how this app's world hangs together. Imagine handing it to a smart engineer who has never used the app, and they should be able to predict roughly how a given user-goal would map to a sequence of UI actions.

Output a Markdown file with this exact structure (use these headers verbatim):

```
---
app: {app}
display_name: {display_name}
home_url: {home_url}
generated_at: {generated_at}
corpus_entries: {n_entries}
confidence: <one of: low | medium | high — your honest read on how grounded this theory is>
---

# Theory of {display_name}

## 1. Purpose (one paragraph)
What is this application FOR? Who is the primary user persona? What is the job-to-be-done?

## 2. Mental Model (3-5 sentences)
How would a fluent user describe how the app "thinks"? E.g. "It's an identity directory with a workflow layer on top — every change to a person triggers a workflow that gates downstream provisioning."

## 3. Auth & Identity Model
- Login mechanism (SSO? local? MFA?)
- Session signals (how do you know you're authenticated?)
- Multi-tenant? Org-scoped?
- Is auth automatable end-to-end, or does it require a human prompt?

## 4. Entity Model
List the primary nouns and their relationships. Use a markdown table:

| Entity | Description | Key Attributes | Relationships |
|--------|-------------|----------------|---------------|

Then a short paragraph on which entity is the "center of gravity" — the one most operations revolve around.

## 5. Action Vocabulary
A matrix of verbs × entities. Rows = entities. Columns = action verbs (Create, Read/View, Update, Delete, plus app-specific verbs). Mark cells with the URL pattern or UI affordance, or "—" if absent.

## 6. Navigation Topology
- Top-level routes (URL patterns + what page each is)
- How users move between sections (top nav? side nav? deep links from emails?)
- Modal vs. full-page patterns
- Any "wizard" or multi-step flows worth flagging

## 7. State Machine
Key states an entity (or the session) passes through. Markdown list or mermaid pseudo-syntax — whatever is clearer.

## 8. UI Framework Fingerprint
- Framework family (Vuetify? Material? React? Custom?)
- Selector strategy hints (does the app use data-cy? aria-labels? class-based?)
- Anything about the DOM that future skill resolvers should know

## 9. Permissions / Roles
Who can do what. Even if the docs are vague, capture what they imply.

## 10. Failure Modes & Pitfalls
What do the docs warn about? What's easy to get wrong? What signals appear on failure (snackbars, banners, validation errors)? Anything counterintuitive?

## 11. Skill Candidates (RANKED)
List 5-10 concrete skills, ranked by **leverage × frequency / difficulty**. For each:
- **Name** (kebab-case, e.g. `user-add`)
- **Goal** (one sentence)
- **Estimated leverage** (high/medium/low) — how often will Mike or an agent want to do this?
- **Estimated difficulty** (high/medium/low) — how hairy is the UI flow?
- **Pre-requisites** (other skills or auth state needed first)
- **Verification signal** (how the skill will know it succeeded)

The top of the list is what the skill-proposer should encode first.

## 12. Open Questions
What is the corpus silent on? What do you *not* know that the next round of fetching or a probing crawl should answer?

## 13. Provenance
Bullet list of corpus entries that most informed each section. Be specific (cite slugs/URLs).
```

Calibration rules:
- If the corpus is thin or contradictory, set `confidence: low` and say so explicitly in §12. Do NOT manufacture detail.
- If existing-evidence files (payload JSONs, site.model.json) are in the corpus, prefer them as ground truth for §3, §6, §7, §8 — they encode what actually works against the live app.
- Keep the document under 4000 words. Tight is better than exhaustive.

Now read the corpus below and produce theory.md. Output ONLY the markdown document, no preamble, no postamble, no fence around the whole thing.

=========== CORPUS ===========
{corpus}
=========== END CORPUS ===========
"""


def build_corpus_text(app: str) -> tuple[str, int]:
    docs_dir = LEARN_ROOT / app / "docs"
    index_path = docs_dir / "_corpus.json"
    if not index_path.exists():
        raise FileNotFoundError(f"Run fetcher first — no {index_path}")
    index = json.loads(index_path.read_text())

    repo_root = LEARN_ROOT.parent
    chunks = []
    total = 0
    for entry in index:
        if "error" in entry:
            chunks.append(f"\n\n### [FETCH ERROR] {entry['url']}\n{entry['error']}\n")
            continue
        path_rel = entry.get("path")
        if not path_rel:
            continue
        # Resolve from repo root for existing-evidence; from learn/ for fetched docs
        candidate = repo_root / path_rel
        if not candidate.exists():
            candidate = LEARN_ROOT / path_rel
        if not candidate.exists():
            continue
        try:
            text = candidate.read_text(errors="replace")
        except Exception:
            continue
        if len(text) > PER_DOC_CAP:
            text = text[:PER_DOC_CAP] + f"\n\n[... truncated, original {len(text)} chars ...]"
        header = f"\n\n=== {entry.get('kind', 'doc').upper()}: {entry.get('title') or entry.get('slug')} ===\nSource: {entry.get('final_url') or entry.get('url')}\n\n"
        chunk = header + text
        if total + len(chunk) > TOTAL_CAP:
            chunks.append(f"\n\n[... corpus truncated at {TOTAL_CAP} chars; {len(index) - len(chunks)} entries unread ...]")
            break
        chunks.append(chunk)
        total += len(chunk)
    return "".join(chunks), total


def theorize(app: str) -> Path:
    cfg = yaml.safe_load((LEARN_ROOT / "apps" / f"{app}.yaml").read_text())
    corpus, corpus_chars = build_corpus_text(app)
    print(f"  corpus: {corpus_chars} chars")

    from datetime import datetime, timezone
    prompt = THEORY_PROMPT.format(
        app=app,
        display_name=cfg["display_name"],
        home_url=cfg["home_url"],
        generated_at=datetime.now(timezone.utc).isoformat(),
        n_entries=corpus.count("\n=== "),
        corpus=corpus,
    )

    # Stash the prompt for repeatability / fallback if the LLM call fails.
    prompt_path = LEARN_ROOT / app / "docs" / "_theory_prompt.txt"
    prompt_path.write_text(prompt)
    print(f"  prompt stashed at {prompt_path}")

    print(f"  calling claude -p (sonnet) ... this may take 30-90s")
    output = call_claude(prompt, model="sonnet", timeout=900)

    theory_path = LEARN_ROOT / app / "theory.md"
    theory_path.write_text(output)
    print(f"  wrote {theory_path}")
    return theory_path


if __name__ == "__main__":
    app = sys.argv[1] if len(sys.argv) > 1 else "yeshid"
    theorize(app)
