# Yeshie Spec Reorganization — Instructions for Claude

## Context

You are reorganizing SPECIFICATION.md (Rev 11) for the Yeshie Chrome extension project. This is a restructure, not a rewrite — no content should be lost, but the document's organizing principle is changing.

## The Problem

The current spec is organized by **component** (MCP server, relay, extension, etc.) with workflows listed as a flat peer group (Workflow 1-6). This creates several problems:

1. **Workflow 2 (the core loop) implicitly embeds Workflow 6 (WebSocket remote control)** — a developer can't trace how an MCP tool call reaches the extension without mentally composing the architecture diagram with Workflow 6. The transport layer is infrastructure that all remote workflows depend on, but it's presented as a peer workflow.

2. **The two primary user stories are tangled together** in Workflow 2: "Claude knows how to do something and executes it" vs. "Claude doesn't know and needs to learn." These are fundamentally different paths with different components involved.

3. **A sidebar escalation path is missing.** When a user types a natural language request in the sidebar that can't be parsed as a structured command, there's no specified mechanism for escalating to Claude for reasoning. The agreed design is **Option C**: the sidebar sends a `yeshie:task_request` message through the Socket.IO relay, and a listening Claude Code agent (or Agent Mail inbox) picks it up, reasons about it, and drives execution through the normal MCP tool path.

## The New Organizing Principle

Reorganize around a **core abstraction**, **two primary stories**, and **infrastructure layers**:

### Foundation: The Four-Phase Step Model

This is the central abstraction of the entire system. Establish it early — before transport, before stories, before components. Everything else in the spec implements, composes, or protects this model.

Every interaction with a web UI is expressed as a **Guarded Step** with four phases:

| Phase | Name | Question | Timing |
|-------|------|----------|--------|
| `pre` | **Guard** | "Is the UI ready for me to act?" | Before action. Retry with timeout. |
| `do` | **Action** | "What manipulation do I perform?" | Immediate. |
| `post` | **Assert** | "Did the action register?" | Immediate check after action. |
| `done` | **Await** | "Has the full effect resolved?" | Async. Separate timeout. Optional (defaults to `post`). |

The `post`/`done` distinction is critical for async web UIs. Example: clicking "Send" in a chat app — `post` verifies the send button changed to a stop button (action registered), while `done` waits for the stop button to disappear (LLM response complete, which could take 60 seconds).

**YAML representation** in `.yeshie` skill files:

```yaml
- id: send_message
  do: click
  selector: "button[aria-label='Send']"
  pre:
    selector: "button[aria-label='Send']"
    visible: true
    enabled: true
  post:
    selector: "button[aria-label='Stop']"
    visible: true
  done:
    selector: "button[aria-label='Stop']"
    visible: false
    timeout: 60s
```

**Two levels of specificity** — the same model works for both execution and learning:

- **Specific mode** (saved skills): Selectors are concrete CSS selectors learned from a site.
- **General mode** (learning/discovery): Selectors are replaced by natural-language descriptions of UI elements. Claude resolves descriptions to selectors by reading the DOM via `browser.readControls`, then bakes the resolved selectors into the saved skill.

```yaml
# General mode (during learning)
- id: send_message
  do: click
  target: "the send button or submit affordance"
  pre:
    target: "a send button"
    state: "visible and enabled"
  post:
    target: "a stop or cancel button"
    state: "appears"
```

**Condition combinators** for real-world sites:
- `any_of: [...]` — at least one condition must be true (handles selector variation across site versions)
- `none_of: [...]` — no condition may be true (e.g., "streaming indicator is gone")
- `all_of: [...]` — all conditions must be true (default when multiple conditions are listed)

**Compound tasks** use a preamble with branching:

```yaml
skill: send_grok_message
params:
  message: string

preamble:
  - id: check_tab
    do: find_tab
    pattern: "grok.com"
    branch:
      found: send_message
      not_found: open_grok

open_grok:
  - id: navigate
    do: navigate
    url: "https://grok.com"
    done:
      selector: "textarea[placeholder*='Ask']"
      visible: true
      timeout: 10s

send_message:
  - id: enter_prompt
    do: type
    selector: "textarea[placeholder*='Ask']"
    value: "{{params.message}}"
    pre:
      selector: "textarea[placeholder*='Ask']"
      visible: true
    post:
      selector: "button[aria-label*='Send']"
      enabled: true
  # ... remaining steps
```

**Story 1** is "execute a sequence of these steps." **Story 2** is "discover and compose these steps." The reader must understand the step model before either story is meaningful.

The existing spec concepts map onto this model:
- The current **guard pattern** (MutationObserver) is the implementation of the `pre` phase
- The current **StepExecutionResult** reports `post` outcomes (and should be extended for `done`)
- The current **action types** (click, type, navigate, etc.) are the `do` vocabulary
- Failure modes FM-01 through FM-30 are largely about what happens when `pre`, `post`, or `done` fail

### Layer 0: Transport Infrastructure
The Socket.IO relay, session management, reconnection, durable command ledger, failure modes. This is the foundation — describe it first. Current Workflow 6 content belongs here, plus the MCP server's role as a protocol translator.

### Story 1: "Claude Knows How" (Execute a Known Skill)
The fast path. A skill already exists in the Obsidian vault. Trace the complete flow:
- **Entry points**: (a) Claude Desktop/Code calls an MCP tool, (b) User types a structured command in the sidebar, (c) User types natural language in sidebar → escalation to Claude via relay (Option C — new)
- **Parameterization**: How a skill template becomes concrete steps
- **Transport**: How commands flow through the relay to the extension (reference Layer 0)
- **Execution**: Stepper receives steps, executes each four-phase step (pre/do/post/done), delegates to content scripts, results flow back
- **Result return**: StepExecutionResult back through the chain to the caller

### Story 2: "Claude Doesn't Know" (Learn and Create a Skill)
The slow path. No skill exists. Claude needs to:
- Detect the knowledge gap (site knowledge check)
- Research the site (current Workflow 3 — Website Researcher)
- Explore the DOM interactively (page instrumentation, readControls, readPage)
- Compose steps one at a time — each step uses the four-phase model in **general mode** (natural-language targets), with Claude resolving targets to specific selectors
- Verify the composed script end-to-end
- Save as a reusable skill (dual-format .yeshie + standalone .js) with specific selectors
- Generalize with parameters

### Cross-Cutting Concerns
These apply to both stories:
- Guard pattern implementation (MutationObserver — the `pre` phase engine)
- Assert/Await implementation (the `post` and `done` phase engines)
- Failure modes (FM-01 through FM-30)
- Checkpoint/resume for service worker suspension
- Cross-tab coordination (current Workflow 4)
- Multi-tab orchestration (current Workflow 5)
- Event simulation and framework detection

## Specific Additions

### Sidebar Escalation Path (Option C)
When the sidebar receives natural language it can't parse locally:
1. Sidebar sends `yeshie:task_request` message via `chrome.runtime.sendMessage` to background worker
2. Background worker forwards through Socket.IO to relay
3. Relay routes to a listening Claude Code agent (connected via MCP server) or Agent Mail inbox
4. Claude reasons about the request, then drives execution through normal MCP tool calls
5. Results flow back through the relay to the extension, which updates the sidebar UI

Define the `yeshie:task_request` message type (distinct from `yeshie:command`).

### Reference User Story: "Ask Grok about the weather"

Include this (or a refined version) in the spec as a worked example showing how the four-phase step model, the transport layer, and Story 1 all connect. The user says "Ask Grok what the weather is today." The full flow:

1. **Entry**: User speaks to Claude (Desktop, Code, or sidebar escalation)
2. **Skill lookup**: Claude finds `send_grok_message` skill in the vault (or falls through to Story 2 if none exists)
3. **Preamble**: Yeshie checks if Grok is open via `find_tab`. Branches to `open_grok` or `send_message`.
4. **Step execution**: Each step runs through all four phases — `pre` checks element readiness, `do` performs the action, `post` verifies immediate effect, `done` awaits async completion.
5. **Result**: The scraped response is returned through the transport chain to Claude, who presents it to the user.

This example grounds the abstract model in something a developer can trace end-to-end.

## Constraints

- **No content loss.** Every section, interface definition, failure mode, MCP tool definition, and code example in the current spec must appear in the reorganized version. Use a checklist if needed.
- **Rev 12.** Increment the revision number and document what changed in the Review Integration Log.
- **End-to-end traceability.** A developer should be able to read either Story 1 or Story 2 and know exactly which components talk to which, through what protocol, at every hop. No mental assembly required.
- **Methodology note.** Add a brief note to the Review Integration Log that this reorganization was prompted by an "end-to-end trace review" — a review pass type that was missing from the original Flywheel Phase 0 methodology. Future review rounds should include: "For each workflow, trace the complete message flow naming every component, protocol, and message type at each hop. Flag anywhere the spec forces the reader to infer a connection."

## Source File

The current spec is at: `SPECIFICATION.md` in this project directory (Rev 11, ~1,780 lines).

## Approach

Use the spec-writer skill if available. Read the full current spec before proposing any changes. Consider using APR (Analyze/Propose/Refine) — analyze the current structure, propose the new outline, get confirmation, then execute the rewrite.
