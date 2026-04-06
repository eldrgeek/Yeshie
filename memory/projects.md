# Active Projects

---

## Yeshie

**Location:** `~/Projects/yeshie`
**What it is:** Chrome MV3 extension + local relay server (port 3333). Claude sends payload JSON → extension executes autonomously in live browser tabs → returns ChainResult.

**Status as of 2026-04-06:** 4 YeshID payloads validated (01-04). Login flow implemented but not E2E tested. Frontier model expansion in progress.

**Current sprint:** Building frontier-model research workflow — Claude sends prompts to Claude.ai, ChatGPT, Gemini, Grok, DeepSeek; captures responses; enables synthesis. Three inner-loop improvements needed:
- ✅ `trustedType` extended for native textareas (nativeInputValueSetter + _valueTracker)
- ✅ `PRE_PAGE_SNAPSHOT` extended to include contenteditable elements
- 🔄 End-to-end testing on all 5 models (DeepSeek blocked by Cloudflare; Grok next)

**Key files:** `CLAUDE.md`, `CONTINUITY.md`, `PROJECT-STATE.md`, `SPECIFICATION.md`
**Tests:** 259/260 passing (`npm test` from `~/Projects/yeshie`)
**Build:** `cd packages/extension && npm run build`

---

## cc-bridge-mcp

**Location:** `~/Projects/cc-bridge-mcp/server.js`
**What it is:** MCP server that bridges Cowork/Claude to the Yeshie relay and host shell.
**Tools:** `shell_exec`, `claude_code`, `yeshie_run`, `yeshie_status`, `yeshie_listen`, `yeshie_respond`

---

## INTOO Work

**What it is:** Outplacement / job transition platform. Mike does strategy, content, and product work here.
**Artifacts:** Google Docs visible in tabs — "INTOO Advantage supplement", "Intoo Multiway Analysis", "Competitive Intelligence"
**Context:** Separate from Yeshie. When Mike switches to INTOO topics, context shifts completely.

---

## Memory System (this directory)

**Status:** Just initialized 2026-04-06.
**Goal:** Persistent context across all Cowork sessions. Mike has ADD — this replaces the continuity that's otherwise lost between conversations.
**Maintenance:** Add to `patterns.md` whenever something takes >10min to figure out. Update `mike.md` when communication patterns are discovered. Add new project files as needed.
