# Yeshie Documentation Review Notes

*Reviewed April 2026. Issues found across CLAUDE.md, README.md, VISION.md, SPECIFICATION.md, PROJECT-STATE.md.*

---

## Fixed (in this docs folder)

These inconsistencies were resolved in the new documentation rather than by modifying existing files.

**Layer count**: The README and CLAUDE.md both describe Yeshie as a "three-layer system," but VISION.md describes five distinct layers (1, 2a, 2b, 3, and 4). For the docs here, we simplified to three numbered layers (1, 2, 3) consistent with the README and the actual file structure (`runtime.model.json`, `generic-vuetify.model.json`, `site.model.json`). The VISION.md subdivisions (2a vs 2b, and Layer 4 for URL schemas) are future architecture that isn't implemented yet.

---

## Issues to Fix in Original Documents

### 1. README.md — file structure omits `packages/` (easy fix, low risk)

The README's file structure section shows:
```
yeshie/
├── models/
└── sites/
```

But the actual code lives in `packages/extension/` (the Chrome extension) and `packages/relay/` (the relay server). This is the most important code in the project, and it's invisible in the README's map.

**Suggested fix**: Add `packages/` to the README file tree, even as a collapsed entry.

---

### 2. README.md — `05-integration-setup` presented as working (easy fix, low risk)

The README table shows all six payloads as if they're all usable:
```
| 05-integration-setup.payload.json | Connect a SaaS service via SCIM/API | ... |
```

But CLAUDE.md and PROJECT-STATE.md both clearly say this task is "NOT RUN" and unvalidated. A reader could run this payload and be surprised when it fails.

**Suggested fix**: Add a note to the table row: `(⚠ not yet validated)`.

---

### 3. CLAUDE.md — layer count vs VISION.md (flag, don't fix)

CLAUDE.md describes a "three-layer architecture" but VISION.md's north-star vision has a more nuanced breakdown (2a/2b split, Layer 4 for URL schemas). These documents intentionally describe different things (current vs. future state), but this isn't clearly labeled.

**Suggested fix**: Add a one-line note near the layer description in CLAUDE.md: *"See VISION.md for the full multi-layer north-star architecture."*

---

### 4. SPECIFICATION.md — architecture no longer matches current implementation (already flagged, but incomplete)

SPECIFICATION.md (Rev 11) opens with a disclaimer saying it's not the current source of truth, but the body still describes:
- A Python/FastMCP MCP server (current: Node.js cc-bridge-mcp)
- An Obsidian vault for skill storage (current: JSON payload files)
- A VPS Socket.IO relay on Contabo (current: local relay on localhost:3333)

The opening disclaimer is good, but someone skimming might miss it. The document is too large to easily navigate.

**Suggested fix**: Move the disclaimer to the very top as a prominent banner, and consider whether this document is worth maintaining at all vs. archiving it.

---

### 5. Naming inconsistency: "CoWork" in README.md

The README uses "CoWork" (the Claude desktop tool) as if it's a component internal to Yeshie that reads models and generates payloads. Example: *"CoWork reads this before generating any payload"* and *"CoWork encounters a new Vuetify app."*

This conflates the external AI tool (Claude/CoWork) with the Yeshie project itself, which could confuse readers about what Yeshie does vs. what Claude does.

**Suggested fix**: Replace "CoWork" with "Claude (or any MCP-capable LLM)" in the README, and clarify that Yeshie provides the tools, not the reasoning.

---

### 6. `improve.js` command format inconsistency (minor)

CLAUDE.md shows:
```bash
node ~/Projects/yeshie/improve.js \
  sites/yeshid/tasks/03-user-modify.payload.json \
  /tmp/chain-result.json
```

README.md shows:
```bash
node improve.js sites/yeshid/tasks/01-user-add.payload.json chain-result.json
```

These are functionally the same (absolute vs. relative paths), but inconsistent presentation could confuse someone trying to follow the instructions.

**Suggested fix**: Standardize to one format in both places. The CLAUDE.md absolute-path version is clearer about where to run the command from.

---

## No Action Needed

- **176 tests**: CLAUDE.md and PROJECT-STATE.md both say 176/176 — consistent ✓
- **`packages/debugger-bridge/`**: Mentioned in PROJECT-STATE.md but not in CLAUDE.md's file structure. This is likely intentional — the debugger bridge is a sub-package that doesn't need its own top-level listing.
- **`00-login.payload.json`**: Not mentioned in the "running payloads" section of CLAUDE.md because it's a prerequisite that runs automatically (noted as `"prerequisite": "00-login.payload.json"` in other payloads), not something you invoke directly. This is correct behavior, just not explicitly documented.
- **VISION.md**: Explicitly aspirational. No cleanup needed — the document describes what the project is *trying to become*, not what it currently is.
