---
audience: silicon
document: decisions
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Decisions

## ADR Index

| ID | Title | Status |
|----|-------|--------|
| ADR-001 | Background worker as execution host | accepted |
| ADR-002 | Pre-bundled functions via executeScript (not eval) | accepted |
| ADR-003 | chrome.debugger Input.insertText for trusted input | accepted |
| ADR-004 | Three-layer hierarchical knowledge model | accepted |
| ADR-005 | JSON payloads (not code) | accepted |
| ADR-006 | Socket.IO (not plain WebSocket) | accepted |
| ADR-007 | Self-improvement via selector merge | accepted |

---

## ADR-001: Background Worker as Execution Host

**Status:** accepted | **Date:** 2025

**Context:** Chrome MV3 service workers (background scripts) survive page navigations. Content scripts die when a page navigates away. Multi-step web tasks require state across navigations.

**Decision:** All chain execution state lives in `background.ts`. Content scripts (`content.ts`) relay postMessages to the background worker, not execute steps themselves.

**Consequences:** Chain can span unlimited navigations without losing state. Content scripts are thin and stateless. Background worker must reconnect to Socket.IO after browser restart.

---

## ADR-002: Pre-bundled Functions via executeScript (not eval)

**Status:** accepted | **Date:** 2025

**Context:** YeshID (and many modern apps) set a strict CSP that blocks `eval()` and `new Function()`. Payload `js` steps contain code strings. Eval is the obvious execution path.

**Decision:** `chrome.scripting.executeScript` injects pre-bundled functions (compiled at extension build time) into the tab. The `PRE_RUN_DOMQUERY` function pattern-matches code strings and routes to the appropriate pre-bundled function.

**Alternatives considered:** `chrome.debugger Debugger.evaluateOnCallFrame` — more complex, requires active debugger session for every step.

**Consequences:** All `js` step patterns must be registered in advance. New DOM patterns require a new pre-bundled function and an extension rebuild. No arbitrary eval. CSP-hostile pages work correctly.

---

## ADR-003: chrome.debugger Input.insertText for Trusted Input

**Status:** accepted | **Date:** 2025

**Context:** Vue 3 `v-model` binds to the native `input` event and checks `event.isTrusted`. Programmatically dispatched `InputEvent` objects have `isTrusted: false` and are ignored, so text typed via `dispatchEvent` doesn't update Vue's reactive state.

**Decision:** Use `chrome.debugger` API → `Input.insertText` command. The Chrome DevTools Protocol `Input.insertText` produces genuine OS-level input events with `isTrusted: true`.

**Alternatives considered:** `nativeInputValueSetter` + synthetic events — works for React, fails for Vue 3. Shadow DOM injection — too complex, breaks site styling.

**Consequences:** Extension requires `debugger` permission in manifest. One `chrome.debugger` session per tab. Trusted events work with Vue 3, React, and plain HTML inputs.

---

## ADR-004: Three-Layer Hierarchical Knowledge Model

**Status:** accepted | **Date:** 2025

**Context:** Site-specific knowledge must be built from scratch for each new site. Framework patterns (Vuetify, React, etc.) are shared across sites using that framework. General web knowledge is universal.

**Decision:** Three JSON model layers: L1 (runtime.model.json — general web), L2 (generic-{framework}.model.json — framework patterns), L3 (sites/{domain}/site.model.json — site specific). Each layer inherits from the ones above. Resolution strategies at L1, framework DOM patterns at L2, cached selectors and state graph at L3.

**Alternatives considered:** Single monolithic site model — no knowledge reuse across sites. Code-based knowledge — harder to inspect, version, and merge.

**Consequences:** Adding a new Vuetify site starts with L2 Vuetify knowledge already loaded. A new framework requires a new L2 model but not L1 changes. L3 models start thin and fill in over time via self-improvement.

---

## ADR-005: JSON Payloads (not Code)

**Status:** accepted | **Date:** 2025

**Context:** Automation tasks need to be authored, inspected, versioned, parameterized, and self-improved. Code-based approaches (Playwright scripts, Selenium) are opaque to non-coders and hard to merge selector improvements back into.

**Decision:** Tasks are JSON payload files. Each step is a data object with `action`, `target`, `value`, `expected`. The payload is also the record that accumulates learned selectors (via `cachedSelector`, `cachedConfidence`).

**Consequences:** Payloads are readable, diffable, and self-improving. New action types require changes to `step-executor.ts` + tests. The `improve.js` script can merge ChainResult resolver data back into the payload as a simple JSON merge.

---

## ADR-006: Socket.IO (not plain WebSocket)

**Status:** accepted | **Date:** 2025

**Context:** Extension ↔ relay communication needs to survive transient disconnects (extension reload, relay restart). Plain WebSocket requires manual reconnection logic.

**Decision:** Socket.IO on both relay (`packages/relay/index.js`) and extension (`background.ts`). Socket.IO handles reconnection, event namespacing, and room/namespace routing.

**Consequences:** Socket.IO adds ~50KB to the relay bundle and extension. Reconnection is automatic. Extension reconnects after reload within seconds without losing the next incoming chain.

---

## ADR-007: Self-Improvement via Selector Merge

**Status:** accepted | **Date:** 2025

**Context:** Target resolution is expensive on first run (tries all 7 strategies). Subsequent runs should use the winning selector directly.

**Decision:** Each successful ChainResult includes `resolvedSelectors` — a map of target names to `{selector, confidence, resolvedVia, resolvedOn}`. The `improve.js` script merges these back into the payload's `target.cachedSelector` fields. After 5 runs at high confidence, payload promotes to `production` mode (no exploratory resolution, direct cached selector use).

**Consequences:** Payloads get faster over time automatically. The payload file is both the task definition and the accumulated knowledge store. Requires running `improve.js` after each successful chain run (not yet automated into the relay or MCP response handler).
