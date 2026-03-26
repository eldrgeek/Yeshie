# Gemini R2 Review: YESHIE-SPECIFICATION.md (Rev 7)

## Executive Summary
This review follows the Claude R3 and Gemini R1 reviews. Most architectural gaps have been filled, but critical edge cases regarding Chrome's Service Worker lifecycle, SSRF surface area in the MCP tools, and Shadow DOM encapsulation remain. No CRITICAL issues were found that would block the start of Phase 1, but the HIGH-severity security findings should be addressed in the next revision.

## Finding 1: Security - SSRF/Internal Network Probing via `browser_navigate`
**Severity: HIGH**
**What the spec says:** "The Stepper blocks `navigate` and `navto` actions that lead to domains not listed in the skill's `site` field or the user's configured safe-domains list. This prevents exfiltration attacks..."
**What's actually true:** This protection is explicitly limited to **saved skills** replayed by the Stepper. However, during the "Core Loop" (Workflow 2) where Claude is driving automation step-by-step via MCP tool calls, Claude can call `browser_navigate` with any arbitrary URL. If a malicious site or a prompt-injection attack tricks Claude into targeting `http://169.254.169.254` (cloud metadata) or `http://localhost:8080`, the extension will obediently navigate and potentially expose internal service headers or data to Claude (and thus the attacker).
**Recommended fix:** Implement a global "Navigation Guard" within the background worker's router that applies to ALL navigations (both MCP tool calls and skills). This guard must block access to private IP ranges (RFC 1918), localhost, and sensitive metadata IPs (e.g., `169.254.169.254`) unless the user has explicitly added them to a "Developer Allowlist" in settings.

## Finding 2: Service Worker Termination during Long-Running Skills
**Severity: MEDIUM**
**What the spec says:** "WebSocket keep-alive: Socket.IO's ping/pong (25s interval) keeps the worker active during connected periods... The keep-alive ping is a convenience, not a guarantee."
**What's actually true:** Chrome 110+ enforces a strict 5-minute maximum lifetime for service workers in many scenarios, and even with active WebSockets, the worker can be "hard killed" if it hasn't interacted with a Chrome API (like storage or tabs) recently. If a skill execution step is waiting for a slow page load or a 60s guard timeout, the worker might be terminated mid-wait. The current checkpointing system only triggers *after* a step succeeds.
**Recommended fix:** Use `chrome.alarms` to schedule a "heartbeat" or "watchdog" for any pending async operation (like a long guard wait). If the worker is killed, the alarm will wake it up, allowing it to check the state of the tab and resume the wait or trigger the recovery protocol.

## Finding 3: Closed Shadow DOM Automation Gap
**Severity: MEDIUM**
**What the spec says:** "Shadow DOM inside the page: ... If target is in a web component's shadow root, must observe the specific `shadowRoot`, not `document.body`."
**What's actually true:** This assumes the `shadowRoot` is `open`. If a custom element uses `{mode: 'closed'}`, `element.shadowRoot` is `null` and inaccessible to the extension's content script (even in an `ISOLATED` world). Many modern enterprise platforms (e.g., Salesforce, ServiceNow) use closed roots for encapsulation.
**Recommended fix:** To support closed Shadow DOM, the content script must inject a small "shim" into the `MAIN` world at `document_start` (via `chrome.scripting.registerContentScripts` with `world: 'MAIN'`) that intercepts `Element.prototype.attachShadow` and stores a reference to every created shadow root in a private `WeakMap`. The `ISOLATED` world content script can then be granted access to these roots for instrumentation and event simulation.

## Finding 4: Security - Exfiltration via `browser_execute_js`
**Severity: MEDIUM**
**What the spec says:** "Skill domain scoping... prevents exfiltration attacks where a malicious skill reads sensitive data via `store_to_buffer` and navigates to `https://attacker.com/`..."
**What's actually true:** Navigation is only one exfiltration vector. A malicious skill or a hijacked Claude session could use `browser_execute_js` (the "Arbitrary JS escape hatch") to `fetch()` or `XHR` data to an external server silently in the background without ever navigating the tab.
**Recommended fix:** The "Skill domain scoping" policy must also apply to any JS execution that attempts to make network requests. For `userScripts.execute`, the extension should ideally use a Content Security Policy (CSP) headers or intercept outgoing requests in the background script to ensure they align with the skill's declared `site` domains.

## Finding 5: Content Script "Orphaning" after Extension Update
**Severity: LOW**
**What the spec says:** (Mentions handling context invalidation gracefully)
**What's actually true:** In Chrome MV3, when an extension updates, all existing content scripts become "orphaned" and lose their connection to the background worker. Any subsequent tool calls to those tabs will fail with "Extension context invalidated" until the page is manually refreshed.
**Recommended fix:** In the background worker's `onInstalled` or startup handler, iterate through all active tabs and attempt to re-inject the content script using `chrome.scripting.executeScript`. If re-injection is blocked by the page's state, mark the tab as "Stale" in the tab registry and prompt the user to refresh via the Side Panel.

## Finding 6: Event Simulator - Shadow DOM Event Retargeting
**Severity: LOW**
**What the spec says:** (Describes framework-aware event sequences)
**What's actually true:** When dispatching events into elements inside a Shadow DOM, the `event.target` is retargeted as it crosses the shadow boundary. Some framework listeners (especially in React or Vue) rely on the event's path (`event.composedPath()`). If the simulator doesn't set `composed: true` and `bubbles: true` correctly for all synthetic events, framework listeners at the root or component level may fail to catch them.
**Recommended fix:** Explicitly specify that all synthetic events in the simulator must set `{ bubbles: true, composed: true }` to ensure they correctly propagate across shadow boundaries to framework-level listeners.

## Summary Table

| Finding | Title | Severity | Area |
|---------|-------|----------|------|
| 1 | SSRF via `browser_navigate` | HIGH | Security |
| 2 | Service Worker "Hard Kill" Timeout | MEDIUM | Chrome Internals |
| 3 | Closed Shadow DOM Inaccessibility | MEDIUM | Chrome Internals |
| 4 | Exfiltration via Arbitrary JS | MEDIUM | Security |
| 5 | Content Script Orphaning | LOW | Chrome Internals |
| 6 | Shadow DOM Event Retargeting | LOW | Event Simulator |

**Final Assessment:** No HIGH or CRITICAL *architectural* blockers were found. The specification is robust, but the identified security gaps (SSRF and Exfiltration) must be addressed before the implementation handles sensitive user data.
