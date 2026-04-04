# Yeshie — Documentation

This directory contains documentation for the Yeshie project in two parallel formats, plus existing visual resources.

---

## silicon/ and carbon/

The core documentation lives in two synchronized directories:

**`silicon/`** is written for LLMs and automated agents. Dense, structured, machine-parseable. Tables over prose, exact identifiers, minimal narrative. Optimized for fast orientation with minimal token use.

**`carbon/`** is written for human contributors. Narrative prose, explanations of the "why," analogies, onboarding guidance. Start here if you're new to the project.

Both contain the same six documents covering the same facts. The format differs; the content does not.

| Document | What it covers |
|----------|---------------|
| `overview.md` | What Yeshie is, its components, validated tasks |
| `architecture.md` | How the pieces connect and why they're built that way |
| `quickstart.md` | Getting everything running from scratch |
| `reference.md` | APIs, action types, payload format, file map |
| `state.md` | Current status — what works, what's pending |
| `decisions.md` | Architectural decisions and the reasoning behind them |

The `sync_version` field in each file's YAML frontmatter tells you if a pair has drifted — matching values mean they're in sync. See [`../AGENTS.md`](../AGENTS.md) for the full sync rules.

---

## Existing Resources (pre-dates silicon/carbon structure)

These were created before the structured documentation system and remain useful:

| File | What it covers |
|------|---------------|
| [`for-jan.md`](for-jan.md) | Plain-English overview for non-engineers — still a good intro |
| [`architecture.mermaid`](architecture.mermaid) | System component diagram |
| [`message-flow.mermaid`](message-flow.mermaid) | Step-by-step message flow diagram |
| [`knowledge-layers.mermaid`](knowledge-layers.mermaid) | The three-layer knowledge model |
| [`self-improvement.mermaid`](self-improvement.mermaid) | How Yeshie gets faster over time |
| [`excalidraw/`](excalidraw/) | Visual (whiteboard-style) versions of the diagrams |
| [`REVIEW-NOTES.md`](REVIEW-NOTES.md) | Issues and inconsistencies noted during earlier review |

---

## Where to Start

**If you're a new human contributor:** Read [`carbon/overview.md`](carbon/overview.md), then [`carbon/architecture.md`](carbon/architecture.md), then [`carbon/quickstart.md`](carbon/quickstart.md).

**If you're an AI agent:** Read [`silicon/overview.md`](silicon/overview.md) and [`silicon/state.md`](silicon/state.md) first. Check [`../AGENTS.md`](../AGENTS.md) for repo-specific operational notes.

**If you just want to run a task:** Go straight to [`carbon/quickstart.md`](carbon/quickstart.md) or [`silicon/quickstart.md`](silicon/quickstart.md).
