# Thinking Router

## Purpose

This document describes a **later-phase optimization** for Yeshie: hierarchical model orchestration that chooses between a fast path and a deep-reasoning path.

It is **not** the next implementation milestone.

The current priority is to make the execution/runtime contract canonical so that:
- the extension runtime, tests, and self-improvement loop agree on what happened
- surprise is reported as structured evidence, not inferred from scattered error strings
- exploration and task execution produce stable traces that a future router can trust

## Why It Is Deferred

The router depends on capabilities the project does not fully have yet:

1. A shared runtime contract.
The production extension runtime and the Node-side test/runtime logic still have overlapping responsibilities. A router built on top of inconsistent result shapes will make bad escalation decisions.

2. First-class surprise evidence.
Before routing between "fast" and "slow" thinking, Yeshie needs structured evidence such as:
- target resolution miss
- URL/state mismatch
- unexpected modal or page branch
- recovery path used

3. Autonomous exploration.
The north star is still "learn a new website." That requires navigation-driven exploration and site-model growth before multi-model orchestration becomes the bottleneck.

## Recommended Sequence

### Phase 1: Runtime Unification
- Extract a shared contract for:
  - target resolution results
  - step execution results
  - model updates
  - surprise evidence
- Make tests and improvement logic consume that contract.

### Phase 2: Structured Surprise
- Have the extension/runtime return explicit surprise evidence in `chain_result`.
- Normalize surprise categories:
  - `target_not_found`
  - `guard_timeout`
  - `url_mismatch`
  - `state_mismatch`
  - `unexpected_ui`

### Phase 3: Exploration-Led Learning
- Replace curated exploration with navigation-driven discovery.
- Persist discovered states, transitions, and outcome signatures into `site.model.json`.

### Phase 4: Minimal Router
- Add a simple policy:
  - use cached verified path when available
  - escalate on specific surprise evidence
  - record which path succeeded

### Phase 5: Multi-Model Distillation
- Add explicit fast/slow model routing.
- Distill successful slow-path traces into Layer 3 hints and cached solutions.

## Future Architecture

### Tier 1: Reflex
- Small, fast model
- Used when the current page/goal pair has a verified path and low surprise
- Output: payload or next-step plan using cached site knowledge

### Tier 2: Reasoning
- Larger, slower model
- Triggered by explicit surprise evidence or missing verified paths
- Output: exploration or recovery strategy

### Tier 3: Evaluator
- Post-run analysis
- Distills successful traces back into Layer 3

## Router Preconditions

Do not implement the full router until these are true:
- target resolution behavior is shared across production and test/runtime paths
- `chain_result` includes structured surprise evidence
- `improve.js` and `site.model.json` use the same canonical update fields
- at least one exploration flow is navigation-driven rather than route-list driven

## Example Future Workflow

1. User asks to add a user on a known site.
2. Router sees a verified page/goal path in Layer 3.
3. Reflex path runs first.
4. Runtime returns structured surprise evidence because the expected target is missing.
5. Router escalates to the reasoning path.
6. Reasoning path resolves the anomaly and succeeds.
7. Evaluator stores the successful trace as improved Layer 3 knowledge.
8. Later runs return to the fast path.
