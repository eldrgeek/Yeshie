# Claude R3 Review — Fresh-Context Architectural Audit

**Reviewer:** Claude Opus 4.6 (fresh context, no anchoring on previous review outputs)
**Spec:** YESHIE-SPECIFICATION.md Rev 6 (~1,350 lines)
**Focus:** Internal consistency, missing glue, implementability, issues missed by 4 prior rounds
**Date:** 2026-03-25

---

## Finding 1: ISOLATED vs MAIN World Contradiction

**Severity: HIGH — Internal contradiction, will cause runtime failure if wrong path chosen**

### What the spec says (two places):

**Hidden Requirements § Security (line ~1111):**
> "CSP handling: Guard scripts executed via `chrome.scripting.executeScript` in ISOLATED world, which bypasses page CSP. No `eval()` used."

**Content Script § Guard Executor (line ~814):**
> "Structured commands: Pre-bundled guard + event simulator functions executed via `chrome.scripting.executeScript({ func, args, world: 'MAIN' })`."

### Why this is a contradiction:

These two sections specify **opposite execution worlds**. The Guard Executor says MAIN world; the Hidden Requirements says ISOLATED world. Only one can be correct.

**MAIN world is required** because:
- The guard functions access page-level JavaScript objects (`_reactRootContainer`, `__vue__`, React's `_valueTracker`)
- The event simulator dispatches events that must be received by the page's framework event listeners
- `document.querySelector` in ISOLATED world returns DOM elements, but their JS prototype properties (like `_valueTracker`) are from the extension's JS context, not the page's
- React's internal fiber tree and Vue's reactivity system are only accessible from MAIN world

**ISOLATED world** is correct only for Yeshie's *own* UI isolation (the floating toggle overlay, if used), not for page interaction.

### Recommended fix:

Update Hidden Requirements to: "Structured command functions execute in MAIN world via `chrome.scripting.executeScript({ func, args, world: 'MAIN' })`. Since the function code is part of the extension package (not an inline string), CSP restrictions on the page do not block execution. The content script itself runs in ISOLATED world for Yeshie's own DOM manipulation."

---

## Finding 2: Framework-First vs Vanilla-First Contradiction

**Severity: MEDIUM — Review log contradicts spec body**

### What the spec says:

**Event Simulator section (line ~279):**
> "The simulator uses a **framework-first** approach: 1. Detect framework at init. 2. If detected, use framework-specific dispatch as primary. 3. If no framework or failure, fall back to vanilla."

**Review Integration Log Rev 4 (line ~1304):**
> "#8: Framework fallback — inverted to vanilla-first, framework-enhanced approach"

### The problem:

The Review Log claims this was "inverted to vanilla-first" but the actual Event Simulator section still describes framework-first. Either the log inaccurately describes what was done, or the text wasn't actually updated.

### Recommendation:

Framework-first is architecturally correct (React `_valueTracker` manipulation is not optional — it's required for React inputs to register changes). Update the Review Log entry to accurately reflect the current spec: the approach was *not* inverted; the framework-specific path was kept as primary with vanilla as fallback. Change the log to: "#8: Framework fallback — kept framework-first; vanilla dispatch is fallback when no framework detected or framework method fails."

---

## Finding 3: Missing `job_status` MCP Tool Definition

**Severity: HIGH — Referenced but never defined; implementer would have to guess the interface**

### What the spec says:

**Infrastructure § MCP Server (line ~1068-1069):**
> "Provide a `job_status(job_id)` tool that Claude can poll for completion."

### What's missing:

The MCP Tool Definitions section lists 15 tools but `job_status` is not among them. An implementer reading only the tool definitions would not know this tool exists. There's no interface for:
- What `job_id` looks like (UUID? incremental?)
- What the response structure is (status enum? progress percentage? partial results?)
- Whether it returns the final result when complete, or whether the original tool must be re-queried
- Timeout behavior if the job was abandoned

### Recommended fix:

Add to MCP Tool Definitions:

```python
@mcp.tool()
async def job_status(job_id: str) -> dict:
    """Poll the status of a long-running operation (e.g., skill_run).
    Returns: { status: 'in_progress' | 'completed' | 'failed' | 'not_found',
               progress?: { current_step: int, total_steps: int },
               result?: <final result when completed>,
               error?: <error details when failed> }
    Jobs expire after 5 minutes of inactivity."""
    ...
```

---

## Finding 4: Missing `browser_hover` MCP Tool Definition

**Severity: MEDIUM — Tool referenced in two places but never defined**

### What the spec says:

- Architecture diagram (line ~135): lists `browser.hover` in the MCP server's tool roster
- Local Command Set (line ~1019): defines `hover "selector"` as a local command

### What's missing:

No `browser_hover()` function exists in the MCP Tool Definitions section. An implementer would know hover exists locally but wouldn't know the MCP tool signature, what it returns, or whether it supports additional parameters (e.g., hover duration, position offset within element).

### Recommended fix:

Add between `browser_type` and `browser_navigate`:

```python
@mcp.tool()
async def browser_hover(selector: str, duration_ms: int = 0,
                        tab_pattern: str | None = None) -> dict:
    """Hover over an element. Dispatches mouseenter + mouseover event sequence.
    duration_ms > 0 holds hover for that duration (useful for tooltips/dropdowns).
    Returns StepExecutionResult with any DOM mutations triggered by hover."""
    ...
```

---

## Finding 5: `guard.requires_action` Referenced but Never Defined

**Severity: HIGH — Selector health check logic depends on undefined field**

### What the spec says:

**Selector Health Check (line ~596):**
> "Stop checking at the first step whose selector has no match AND whose `guard.requires_action` is not set — this is likely a dynamically-rendered element."

### What's missing:

`requires_action` does not appear in:
- The guard YAML examples
- The `guardedAction()` function signature
- The `SkillCheckpoint` interface
- Any other interface or type definition

The paragraph *below* this reference (line ~606) introduces `dynamic: true` as the actual metadata hint for this purpose, but the health check algorithm references `requires_action` instead of `dynamic`. These appear to be two names for the same concept that were never reconciled.

### Recommended fix:

Replace `guard.requires_action` in the health check algorithm with the step-level `dynamic: true` annotation that's already defined later in the same section: "Stop checking at the first step whose selector has no match AND which is not annotated with `dynamic: true`."

---

## Finding 6: `networkidle` Wait Strategy Has No Implementation Path

**Severity: HIGH — Promised feature with no mechanism to implement it**

### What the spec says:

**`browser_navigate` tool (line ~696):**
> "wait_until options: 'domcontentloaded' (HTML parsed, default), 'load' (all resources), 'networkidle' (no requests for 500ms)."

### The problem:

`domcontentloaded` and `load` are standard DOM events — trivial to implement via `addEventListener`. But `networkidle` has no browser API equivalent in MV3 extensions. Puppeteer/Playwright implement this by intercepting the CDP network domain. In a Chrome extension:

- There is no equivalent to CDP's `Network.requestWillBeSent` / `Network.loadingFinished`
- `chrome.webRequest` can monitor network activity from the background worker, but it only sees requests matching the extension's `host_permissions`, and correlating "idle for 500ms" across all resource types is non-trivial
- The content script has no network monitoring capability
- Service Worker `fetch` event only intercepts the extension's own requests, not page requests

### Recommended fix:

Either:
**(a)** Document that `networkidle` is implemented via `chrome.webRequest.onCompleted` + a 500ms debounce timer in the background worker (and specify which request types count), OR
**(b)** Downgrade to a simpler heuristic: "After `load` event, wait an additional 500ms for DOM stability (no MutationObserver mutations for 500ms)" — which is achievable without network monitoring, OR
**(c)** Mark `networkidle` as post-MVP and remove from the tool's `wait_until` options.

Option (b) is recommended as it provides similar practical value without the complexity.

---

## Finding 7: `skills-index.json` Concurrent Update Race Condition

**Severity: MEDIUM — Will cause merge conflicts or data loss in multi-environment usage**

### What the spec says:

- MCP server can run on Mac or VPS (line ~1058)
- `skill_save` updates `skills-index.json` (line ~1095)
- Vault syncs via git between Mac and VPS (line ~1088-1093)
- "Merge conflicts unlikely (skills are append-only, knowledge is per-domain)" (line ~1091)

### The problem:

Individual `.yeshie` skill files ARE append-only and unlikely to conflict. But `skills-index.json` is a **single JSON file** that is rewritten on every skill save. If the MCP server saves a skill on the Mac and a separate instance saves on the VPS before git sync:
- Both modify the same `skills-index.json`
- Git cannot auto-merge JSON (no line-level semantics)
- The "latest commit wins" policy means one index entry is silently lost

### Recommended fix:

Change `skills-index.json` from a monolithic file to one of:
**(a)** **JSONL format** (one JSON object per line) — git can merge line additions, and appending is conflict-free.
**(b)** **Regenerable index** — treat the index as a cache that can be rebuilt from scanning `.yeshie` files. Add a `rebuild-index` command. If the index is stale or conflicted, regenerate it.
**(c)** **Per-domain index files** — `websites/{domain}/index.json` for site-specific skills, `skills/index.json` for cross-site. Reduces collision surface.

Option (b) is simplest and most robust. The index becomes a performance optimization, not a source of truth.

---

## Finding 8: Relay Authentication Mechanism Undefined

**Severity: MEDIUM — Security-critical path with zero specification**

### What the spec says:

**Hidden Requirements § Security (line ~1118):**
> "WebSocket authentication: Token-based auth stored in `chrome.storage.local`."

### What's missing:

- What kind of token? Pre-shared secret? JWT? API key?
- How is the token generated? By the relay? By the user?
- How does the MCP server authenticate with the relay? Same token? Different mechanism?
- What happens if the token is compromised?
- Is the token transmitted during the Socket.IO handshake or in a post-connect message?
- Does the relay validate the token on every message or just on connection?

For a single-user system, a pre-shared secret in the Socket.IO `auth` handshake parameter is sufficient. But this needs to be specified so the implementer doesn't have to design a security system from scratch.

### Recommended fix:

Add a "Relay Authentication" subsection:

```
Authentication: Pre-shared secret token.
- Token is a random string generated once and configured in both extension and relay.
- Extension sends token via Socket.IO handshake: `io({ auth: { token: "..." } })`
- MCP server sends same token via its Socket.IO client connection.
- Relay validates token on connection. Invalid token → disconnect with error code.
- Token stored in: extension → chrome.storage.local, MCP server → env variable,
  relay → env variable or config file.
- Token rotation: manual. Change on relay, update extension and MCP server configs.
```

---

## Finding 9: `browser_read_page(format='controls')` Duplicates `browser_read_controls`

**Severity: LOW — Confusing API surface, not a correctness issue**

### What the spec says:

**`browser_read_page` (line ~700-704):**
> "format='controls' returns interactive element map (same as readControls)."

**`browser_read_controls` (line ~708-713):**
> "Extract all currently visible interactive controls from the page HTML."

### The problem:

Two tools do the same thing. Claude (the consumer) has to decide which to call. The MCP server has to implement the same logic in two code paths. This adds confusion without adding capability.

### Recommended fix:

Remove `format='controls'` from `browser_read_page`. Keep `browser_read_controls` as the dedicated tool. `browser_read_page` focuses on semantic structure and text extraction only.

---

## Finding 10: `call_skill` Buffer Collision Semantics Undefined

**Severity: MEDIUM — Ambiguous data flow will cause subtle bugs**

### What the spec says (line ~940):

> "Returns the sub-skill's buffer values to the parent scope (merged, not overwritten)"

### The problem:

"Merged, not overwritten" is contradictory for key collisions. If parent has `buffer.result = "parent_data"` and sub-skill sets `buffer.result = "sub_data"`:
- "Merged" implies both coexist somehow
- "Not overwritten" implies parent value wins

But in practice, the sub-skill's output is usually what the caller wants. If the parent's values always win, there's no way for a sub-skill to return results.

### Recommended fix:

Specify explicitly: "Sub-skill buffer values are merged into parent scope. On key collision, sub-skill values take precedence (the sub-skill's output overwrites the parent's value for that key). To avoid unintended collisions, sub-skills should namespace their buffer keys (e.g., `login_result` instead of `result`)."

---

## Finding 11: Skill Step `condition` Field Has No Evaluation Spec

**Severity: MEDIUM — Feature used in examples but never defined**

### What the spec says:

**Skill file example (line ~883):**
```yaml
- action: type
  selector: "#issue_body"
  value: "{{body}}"
  condition: "{{body}}"
```

### What's missing:

- How is the condition evaluated? Truthy/falsy in JavaScript? In Python? In YAML?
- Does `""` (empty string after interpolation) evaluate as falsy? What about `"false"`, `"0"`, `"[]"`?
- Are comparison expressions supported? (e.g., `"{{count}} > 5"`)
- Does a failed condition skip the step silently, or log a skip?
- Is `condition` optional on all step types, or only certain ones?

### Recommended fix:

Add a "Step Conditions" subsection:

```
Steps can include an optional `condition` field. If present, the interpolated
value is evaluated as a truthy check before the step executes:
- Truthy: any non-empty string (after interpolation) that is not "false" or "0"
- Falsy: empty string, "false", "0", null, undefined (missing param)
- No expression evaluation — conditions are simple presence/absence checks
- If condition is falsy, the step is skipped (logged as "skipped: condition not met")
- All step types support `condition`
```

---

## Finding 12: Missing GuardSpec TypeScript Interface

**Severity: MEDIUM — Core abstraction used everywhere but never formally typed**

### The problem:

The spec defines `StepExecutionResult`, `SkillCheckpoint`, `PageControl`, `YeshieMessage` — all as TypeScript interfaces. But the guard configuration that appears in every skill step has no formal type:

```yaml
guard: { selector: "#submit-btn", state: { visible: true, enabled: true }, timeout: 15000 }
```

An implementer would need to infer the type from scattered YAML examples. The `state` object's allowed keys are only partially documented (visible, enabled, text, attribute — from the `guardedAction` function body).

### Recommended fix:

Add to the Guard section:

```typescript
interface GuardSpec {
  selector: string;          // CSS selector to watch for
  state?: {
    visible?: boolean;       // Element has non-zero dimensions and offsetParent
    enabled?: boolean;       // Element is not disabled
    text?: string;           // textContent includes this string
    attribute?: Record<string, string>;  // Element attributes match these values
  };
  timeout?: number;          // Override default 10000ms (range: 500-60000)
}
```

---

## Finding 13: Standalone JS Export Shape Unspecified

**Severity: LOW — Feature mentioned but not described enough to implement**

### What the spec says (line ~914):

> "Each `.yeshie` skill also generates a `.js` file with all guards and framework-aware event handling inlined. No dependency on the Yeshie extension — runs in any browser console."

### What's missing:

- Does the JS file export a function? Self-execute? Return a Promise?
- How are parameters passed? Function arguments? Global variables? `prompt()` calls?
- Does it include the full `guardedAction` implementation? The framework detection? The React `_valueTracker` workaround?
- What's the approximate size overhead per skill? (The guard + event simulator library is substantial)
- Can it run in Node.js or only in browser context?

### Recommended fix:

Add a brief description of the export format:

```
Standalone .js export is an async IIFE that:
1. Accepts parameters via a `PARAMS` object at the top of the file (user edits before running)
2. Inlines a minified version of: guardedAction(), framework detection, React/Vue event helpers
3. Executes all steps sequentially with guards
4. Logs step results to console
5. Browser-only (requires DOM APIs). Approximate overhead: ~5KB minified for the guard/event library.
```

---

## Finding 14: `aria-hidden="true"` Filtering May Hide Visible Overlays

**Severity: LOW — Edge case in readControls filtering**

### What the spec says (line ~1122):

> "Filter out elements with `display: none`, `visibility: hidden`, `aria-hidden="true"`, or zero `getBoundingClientRect()` dimensions"

### The problem:

`aria-hidden="true"` is an accessibility annotation, not a visibility indicator. Some sites set `aria-hidden="true"` on decorative elements that ARE visible (icons, animations, background graphics). More critically, some modal/overlay implementations set `aria-hidden="true"` on the *background content* while the modal is open — the background is still visible but marked as hidden from screen readers. Filtering on `aria-hidden` could accidentally remove the backdrop elements Claude needs to reason about.

### Recommended fix:

Remove `aria-hidden="true"` from the visibility filter. Instead, use only geometric checks (`getBoundingClientRect()` with non-zero dimensions) and CSS computed style checks (`display`, `visibility`, `opacity > 0`). The injection-pattern text stripping already handles the prompt-poisoning concern separately.

---

## Summary

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | ISOLATED vs MAIN world contradiction | **HIGH** | Internal consistency |
| 2 | Framework-first vs vanilla-first contradiction in review log | MEDIUM | Internal consistency |
| 3 | Missing `job_status` MCP tool definition | **HIGH** | Missing glue |
| 4 | Missing `browser_hover` MCP tool definition | MEDIUM | Missing glue |
| 5 | `guard.requires_action` referenced but never defined | **HIGH** | Missing glue |
| 6 | `networkidle` wait strategy has no implementation path | **HIGH** | Implementability |
| 7 | `skills-index.json` concurrent update race condition | MEDIUM | Implementability |
| 8 | Relay authentication mechanism undefined | MEDIUM | Implementability |
| 9 | `browser_read_page(format='controls')` duplicates `browser_read_controls` | LOW | API design |
| 10 | `call_skill` buffer collision semantics undefined | MEDIUM | Implementability |
| 11 | Skill step `condition` field has no evaluation spec | MEDIUM | Implementability |
| 12 | Missing `GuardSpec` TypeScript interface | MEDIUM | Missing glue |
| 13 | Standalone JS export shape unspecified | LOW | Implementability |
| 14 | `aria-hidden` filtering may hide visible overlays | LOW | Correctness |

**HIGH findings: 4** | MEDIUM: 7 | LOW: 3

---

*Review Revision: 1 — Claude Opus 4.6 R3 Fresh Context*
*Date: 2026-03-25*
