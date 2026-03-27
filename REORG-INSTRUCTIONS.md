# Yeshie Spec Reorganization — Instructions for Claude

## Context

You are reorganizing SPECIFICATION.md (Rev 11) for the Yeshie Chrome extension project. This is a restructure, not a rewrite — no content should be lost, but the document's organizing principle is changing.

## The Problem

The current spec is organized by **component** (MCP server, relay, extension, etc.) with workflows listed as a flat peer group (Workflow 1-6). This creates several problems:

1. **Workflow 2 (the core loop) implicitly embeds Workflow 6 (WebSocket remote control)** — a developer can't trace how an MCP tool call reaches the extension without mentally composing the architecture diagram with Workflow 6. The transport layer is infrastructure that all remote workflows depend on, but it's presented as a peer workflow.

2. **The two primary user stories are tangled together** in Workflow 2: "Claude knows how to do something and executes it" vs. "Claude doesn't know and needs to learn." These are fundamentally different paths with different components involved.

3. **A sidebar escalation path is missing.** When a user types a natural language request in the sidebar that can't be parsed as a structured command, there's no specified mechanism for escalating to Claude for reasoning. The agreed design is **Option C**: the sidebar sends a `yeshie:task_request` message through the Socket.IO relay, and a listening Claude Code agent (or Agent Mail inbox) picks it up, reasons about it, and drives execution through the normal MCP tool path.

## The New Organizing Principle

Reorganize around **two primary stories**, with infrastructure described first:

### Layer 0: Transport Infrastructure
The Socket.IO relay, session management, reconnection, durable command ledger, failure modes. This is the foundation — describe it first. Current Workflow 6 content belongs here, plus the MCP server's role as a protocol translator.

### Story 1: "Claude Knows How" (Execute a Known Skill)
The fast path. A skill already exists in the Obsidian vault. Trace the complete flow:
- **Entry points**: (a) Claude Desktop/Code calls an MCP tool, (b) User types a structured command in the sidebar, (c) User types natural language in sidebar → escalation to Claude via relay (Option C — new)
- **Parameterization**: How a skill template becomes concrete steps
- **Transport**: How commands flow through the relay to the extension (reference Layer 0)
- **Execution**: Stepper receives steps, delegates to content scripts, guards verify DOM state, results flow back
- **Result return**: StepExecutionResult back through the chain to the caller

### Story 2: "Claude Doesn't Know" (Learn and Create a Skill)
The slow path. No skill exists. Claude needs to:
- Detect the knowledge gap (site knowledge check)
- Research the site (current Workflow 3 — Website Researcher)
- Explore the DOM interactively (page instrumentation, readControls, readPage)
- Compose steps one at a time with guard verification
- Verify the composed script end-to-end
- Save as a reusable skill (dual-format .yeshie + standalone .js)
- Generalize with parameters

### Cross-Cutting Concerns
These apply to both stories:
- Guard pattern and MutationObserver mechanics
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

## Constraints

- **No content loss.** Every section, interface definition, failure mode, MCP tool definition, and code example in the current spec must appear in the reorganized version. Use a checklist if needed.
- **Rev 12.** Increment the revision number and document what changed in the Review Integration Log.
- **End-to-end traceability.** A developer should be able to read either Story 1 or Story 2 and know exactly which components talk to which, through what protocol, at every hop. No mental assembly required.
- **Methodology note.** Add a brief note to the Review Integration Log that this reorganization was prompted by an "end-to-end trace review" — a review pass type that was missing from the original Flywheel Phase 0 methodology. Future review rounds should include: "For each workflow, trace the complete message flow naming every component, protocol, and message type at each hop. Flag anywhere the spec forces the reader to infer a connection."

## Source File

The current spec is at: `SPECIFICATION.md` in this project directory (Rev 11, ~1,780 lines).

## Approach

Use the spec-writer skill if available. Read the full current spec before proposing any changes. Consider using APR (Analyze/Propose/Refine) — analyze the current structure, propose the new outline, get confirmation, then execute the rewrite.
