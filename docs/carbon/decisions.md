---
audience: carbon
document: decisions
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Why We Built It This Way

This is a log of the significant architectural decisions that shaped Yeshie — the choices that might otherwise look arbitrary, and the reasoning that made them make sense.

---

## ADR-001: Background Worker as Execution Host

**When:** 2025

The central challenge of browser automation is that websites are multi-page. You can't add a user to YeshID in a single page — you navigate to the people list, navigate to a form, navigate to a confirmation page. Each navigation is a hard boundary.

Chrome extensions have two types of scripts. Content scripts live inside a webpage — they can read the DOM, click things, intercept events. But they die the moment the page navigates somewhere else. If you're mid-task and a navigation happens, a content-script-based executor has no memory of what it was doing.

**We chose to:** run all chain execution from the extension's *background worker* — a persistent service worker that stays alive across page navigations.

Content scripts became thin relays: they receive events from the DOM and forward them to the background worker over `chrome.runtime.sendMessage`. The background worker owns all the state.

**The tradeoff:** Service workers in Chrome MV3 can sleep after inactivity. We added a 24-second keepalive alarm to prevent this. The background worker also needs to reconnect to the relay's Socket.IO server after Chrome restarts, which adds a small reconnection delay.

---

## ADR-002: Pre-bundled Functions via executeScript (not eval)

**When:** 2025

Some steps in a task involve dynamic DOM queries — code that asks "which row in this table has 'Jane Smith' in the name column?" You'd naturally write this as a JavaScript string in the payload and eval it in the tab context.

YeshID has a strict Content Security Policy that blocks eval. `eval()`, `new Function()`, dynamic script tags — all rejected. Trying to use them throws a CSP error and the step fails.

**We chose to:** compile all possible DOM query functions into the extension at build time, and inject them via `chrome.scripting.executeScript`. This is trusted code coming from the extension (not from an eval'd string), so CSP doesn't apply.

The `PRE_RUN_DOMQUERY` function acts as a dispatcher: it reads the code string from the payload step, pattern-matches it, and calls the appropriate pre-compiled function. "Does this code look like a row-find? Run `PRE_FIND_ROW_AND_CLICK`. Does it look like a checkbox interaction? Run the checkbox handler."

**The tradeoff:** You can't write arbitrary JavaScript in a payload step and have it run. Any new DOM interaction pattern needs to be added as a pre-bundled function and the extension must be rebuilt. This is a real constraint, but it turned out to be acceptable — the patterns that actually come up are finite and stable.

---

## ADR-003: chrome.debugger Input.insertText for Trusted Input

**When:** 2025

Vue 3's reactive data binding listens for the native `input` event. When you type in a field, the browser fires this event with `isTrusted: true` — a flag that says "this came from a real human, not a script." Vue only updates its state in response to trusted events.

When automation code fires `element.dispatchEvent(new InputEvent('input', ...))`, the browser sets `isTrusted: false`. Vue sees this and ignores it. The text appears in the field visually (because the DOM value was set directly), but Vue's data model doesn't update. The form effectively has invisible data.

**We chose to:** use `chrome.debugger Input.insertText` — a Chrome DevTools Protocol command. CDP operates at the browser engine level, below the JavaScript event system. Events produced this way are indistinguishable from real keystrokes; they're marked `isTrusted: true`.

**The tradeoff:** The extension needs the `debugger` permission in its manifest. In some Chrome versions, attaching the debugger shows a small banner in the browser UI ("DevTools is debugging this tab"). This is slightly jarring but functionally invisible during normal use. It's a fair trade for reliable input across all frameworks.

---

## ADR-004: Three-Layer Hierarchical Knowledge Model

**When:** 2025

When you want to automate a new website, where do you start? Starting from zero for every site is expensive — every site would need its own complete automation logic. But making a single monolithic "web automation" system means you can't capture site-specific quirks without polluting everything else.

**We chose to:** organize knowledge into three explicit layers:

- **L1** (`models/runtime.model.json`) — knowledge that's true for any website: what types of actions exist, what resolution strategies to try, what signals indicate success or failure.
- **L2** (`models/generic-vuetify.model.json`) — knowledge about a specific UI framework: how Vuetify labels inputs, how Vuetify dialogs behave, what a Vuetify dropdown looks like in the DOM.
- **L3** (`sites/{domain}/site.model.json`) — knowledge about one specific website: where YeshID puts the people list, what "delete" is called, how authentication works.

When you encounter a new Vuetify app, you inherit L1 and L2 immediately. You only need to discover L3 from scratch.

**The tradeoff:** Maintaining three separate files adds complexity. The resolution code has to load and merge all three layers at runtime. But the payoff is clear: four YeshID tasks were built much faster because the Vuetify patterns from L2 were already known.

---

## ADR-005: JSON Payloads (not Code)

**When:** 2025

Automation tasks could be represented as code (Playwright scripts, Selenium tests, etc.) or as data (structured JSON files). Code is more powerful — you can write any logic. Data is more inspectable and more self-improving.

**We chose to:** use JSON payload files. Each step is a data object: `{action: "click", target: {name: "Onboard button"}}`. The executor interprets these objects, not evals them.

This decision unlocked self-improvement: after a successful run, the ChainResult includes the CSS selectors that were discovered. The `improve.js` script can merge these back into the payload file as `cachedSelector` fields. The payload file is simultaneously the task definition and the accumulated knowledge store. Code scripts can't do this — you can't easily merge "what worked" back into a Playwright script in a structured way.

**The tradeoff:** You can't express arbitrary conditional logic in a payload step. If a task requires "if this element exists, do X, otherwise do Y," that's not directly expressible. The `assess_state` action and the payload-level `preRunChecklist` cover most cases, but complex branching would need to be handled by Claude driving multiple sequential payloads rather than one payload with conditionals.

---

## ADR-006: Socket.IO (not plain WebSocket)

**When:** 2025

The relay needs to maintain a persistent connection with the Chrome extension. The extension can be reloaded (during development or on Chrome restart). The relay itself might restart. Plain WebSocket connections are lost during these events and don't reconnect automatically.

**We chose to:** use Socket.IO on both sides. Socket.IO handles reconnection automatically, provides event namespacing, and gives us a clean API for emitting/receiving structured events.

**The tradeoff:** Socket.IO adds size to both the relay and the extension bundle. It's overkill for a one-to-one local connection. But the reconnection handling alone justifies it — during development, the extension gets reloaded constantly, and manual reconnection logic would be a constant annoyance.

---

## ADR-007: Self-Improvement via Selector Merge

**When:** 2025

The first run of a new task is slow — the resolver has to try multiple strategies to find each element. If nothing is cached, every step might try 5 or 6 resolution strategies before finding the right one.

**We chose to:** merge successful resolution results back into the payload file after each run. The `improve.js` script reads the `resolvedSelectors` from a `ChainResult` and writes the winning selector and confidence back into the corresponding step's `target` object.

After enough successful runs at high confidence, the payload's mode automatically promotes to `production` — future runs go straight to the cached selector without any exploratory resolution. This is how 8-second tasks eventually become 2-second tasks.

**The tradeoff:** The payload file changes over time. Running `improve.js` is a manual step (not yet automated). If a website changes and a cached selector breaks, the system falls back to exploratory resolution — it doesn't silently fail. But the payload file then has a stale `cachedSelector` that needs to be updated. A future improvement would be to automatically invalidate stale selectors when resolution confidence drops below threshold.
