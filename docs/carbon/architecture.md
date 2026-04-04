---
audience: carbon
document: architecture
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# How Yeshie Works

This document explains how the pieces fit together and, crucially, *why* they're built the way they are. A lot of the design reflects hard-won lessons about what doesn't work with Chrome extensions and modern JavaScript frameworks.

---

## The Request Journey

Here's what happens when Claude runs the "modify user" task:

```
Claude
  → calls yeshie_run() MCP tool
    → cc-bridge MCP server (~/Projects/cc-bridge-mcp/server.js)
      → HTTP POST to relay (localhost:3333)
        → Socket.IO WebSocket to extension background worker
          → chrome.scripting.executeScript into live Chrome tab
            → ChainResult flows back the same path to Claude
```

Each arrow is a deliberate architectural choice. Let's walk through why.

---

## The Extension: Why a Background Worker?

The key insight is that Chrome extensions have two kinds of scripts: *content scripts* that live inside a webpage, and a *background worker* that lives behind the scenes.

Content scripts die when you navigate to a new page. That's a problem for multi-step automation: if you're filling out a form and one of the steps navigates to a confirmation page, a content-script-based executor loses all its state mid-task.

The background worker (`packages/extension/src/entrypoints/background.ts`) persists across page navigations. It holds the entire chain state — which step it's on, what params it's working with, what it's learned so far — and survives no matter how many times the page changes. Content scripts become thin message relays that just pass DOM events back to the background worker.

---

## The Typing Problem: Why chrome.debugger?

Modern JavaScript frameworks like Vue 3 have a security check: they only respond to "trusted" keyboard events — ones that come from an actual human, not a script. When you call `element.dispatchEvent(new InputEvent(...))` programmatically, the browser marks it as `isTrusted: false`, and Vue's reactive state ignores it. The text appears in the input box visually but the data binding doesn't update.

The solution is `chrome.debugger Input.insertText`. This is a Chrome DevTools Protocol command that simulates input at the OS level — the browser can't tell it apart from a real keypress. The extension uses this for all typing operations, which is why they work correctly on Vue 3, React, and plain HTML forms alike.

The tradeoff: the extension needs the `debugger` permission, which triggers a "DevTools has been attached" banner in some Chrome versions. It's a minor UX issue in exchange for reliable input across all frameworks.

---

## The CSP Problem: Why Pre-bundled Functions?

Modern web apps often set a Content Security Policy (CSP) that blocks JavaScript evaluation at runtime. YeshID specifically blocks `eval()` and `new Function()`. This is a problem because some automation steps involve dynamic DOM queries — code that needs to run in the context of the page.

The solution: instead of eval-ing code strings at runtime, we compile all possible DOM query functions into the extension at build time and inject them with `chrome.scripting.executeScript`. This bypasses CSP because the code is coming from the extension (which is trusted), not from a string being eval'd.

The `PRE_RUN_DOMQUERY` function acts as a router: it pattern-matches the code string from the payload step and calls the appropriate pre-bundled function. It's a bit like a switch statement that says "if the step mentions `find(r =>`, run the row-finding function; if it mentions `checkbox`, run the checkbox handler."

The tradeoff: any new type of DOM query pattern requires adding a new pre-bundled function and rebuilding the extension. You can't just write arbitrary JavaScript in a payload step and expect it to work.

---

## The Knowledge System: Three Layers

Yeshie's knowledge about websites is organized into three layers, each more specific than the last:

**Layer 1 — General web knowledge** (`models/runtime.model.json`)
Things that are true on any website: what action types exist, what resolution strategies to try, how to interpret DOM structure. This never changes unless the web platform itself changes.

**Layer 2 — Framework knowledge** (`models/generic-vuetify.model.json`)
Patterns specific to a UI framework. Vuetify (which YeshID uses) puts form labels in `div.mb-2` elements above the inputs — not inside them. Vuetify dialogs and dropdowns have specific DOM structures. Knowing these patterns means you can navigate a new Vuetify app without starting from scratch.

**Layer 3 — Site knowledge** (`sites/{domain}/site.model.json`)
Everything specific to one website. In YeshID: "deleting a user" is called "offboarding" and is hidden in a "Manage" dropdown; the save button says "Confirm" not "Save"; the people list lives under "Organization" in the sidebar. This layer starts thin and fills in as tasks run successfully.

When Yeshie encounters a new site, it inherits all the knowledge from L1 and L2 immediately. L3 accumulates over time.

---

## Target Resolution: How Elements Are Found

Finding the right element on a page is a 7-step cascade. Each step is tried in order; the first one that finds a match with confidence ≥ 0.85 wins:

1. **Cached selector** — "Last time, this element was at `[aria-label='Search']` with 92% confidence." If still there, use it directly. This is the fast path after the first run.
2. **Vuetify `.v-label`** — look for the label inside a Vuetify input component
3. **`div.mb-2` sibling** — YeshID's pattern: the label lives in the element just above the input
3b. **Table-row label** — for edit forms where labels are in `<td>` cells next to their inputs
4. **`aria-label` or `placeholder`** — standard accessibility attributes
5. **Button text matching** — for clickable elements
6. **Explicit CSS fallbacks** — a list of selectors specified directly in the payload

The cascade is ordered by confidence: cached knowledge is most reliable, explicit CSS is most fragile. Resolution automatically learns which strategies work — after enough successful runs, the cached path handles almost everything.

---

## Self-Improvement: How It Gets Faster

After a successful chain run, the relay returns a `ChainResult` that includes every element that was found, how it was found, and with what confidence. The `improve.js` script merges this back into the payload file, updating the `cachedSelector` and `cachedConfidence` fields.

The next run starts with the winning selectors pre-loaded. After five successful runs at high confidence, the payload promotes to "production" mode: it stops doing exploratory resolution entirely and goes straight to the cached path. This is why timing improves from ~8 seconds to ~2 seconds over a handful of runs.

---

## Auth Recovery: What Happens When Sessions Expire

YeshID uses Google SSO. If the session expires mid-chain, the site redirects to `/login`. Without handling this, the chain would just fail confusingly.

The extension handles this explicitly:
- Before any chain starts, `PRE_CHECK_AUTH` runs to verify the session is active
- If any `navigate` step detects a redirect to `/login`, it returns `auth_required` instead of continuing
- The chain loop intercepts this, calls `waitForAuth`, and retries the failed step after re-authentication
- `waitForAuth` navigates to the login page, clicks "Sign in with Google", optionally selects the right Google account automatically (if `google_account_email` is in the params), and polls until it's back at the app with the nav drawer visible

This logic is implemented and unit-tested, but hasn't been validated against a real expired session yet — that test is on the pending list.
