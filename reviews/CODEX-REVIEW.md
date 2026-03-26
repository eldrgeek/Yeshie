# Independent Architectural Review: Yeshie

This review focuses on the seven requested areas and on behaviors that are specifically true in Chrome MV3, WXT, FastMCP, and Socket.IO as of March 25, 2026.

## 1. Chrome Extension MV3 Realities

### Finding 1.1: `chrome.scripting.executeScript` in `ISOLATED` world is not a general "JS snippet runner"

**What the spec says**

The spec says Claude will compose guarded JavaScript snippets as strings, send them through `browser_execute_js(code: str)`, and the extension will execute them via `chrome.scripting.executeScript` in the `ISOLATED` world, bypassing page CSP.

**What’s actually true**

- Chrome does run extension-injected scripts in an isolated world by default, and isolated-world execution is not governed the same way as page-authored inline scripts.
- But `chrome.scripting.executeScript()` does **not** execute arbitrary JavaScript strings. Chrome’s scripting API accepts a file or a function. The docs explicitly say runtime strings are only supported for `insertCSS()`, and you “can't execute a string using `scripting.executeScript()`.”
- That makes the current `browser_execute_js(code: str)` design invalid as written unless you add a second interpreter layer, which in MV3 quickly runs into CSP / remote-code / maintainability problems.

**What should change**

- Replace raw `code: str` execution with one of:
  - A fixed extension-side function plus structured arguments.
  - A constrained DSL / AST that the extension interprets.
  - A library of predeclared action primitives that Claude composes.
- If you keep arbitrary code generation, be explicit that this is not implemented with `executeScript(codeString)` because Chrome does not support that.

### Finding 1.2: `ISOLATED` world cannot reliably access page-owned JS state like React internals

**What the spec says**

The spec relies on `_valueTracker`, `_reactRootContainer`, and `__vue__` for framework detection and React-compatible input handling, while also saying guard scripts run in `ISOLATED` world.

**What’s actually true**

- Chrome content scripts live in isolated worlds. Chrome’s docs are explicit that JavaScript variables in content scripts are not visible to the page, and vice versa.
- Chrome’s own example shows properties attached to a DOM node are world-isolated, not truly shared JS state.
- In practice, that means page-owned expandos like React’s `_valueTracker`, a DOM root expando like `_reactRootContainer`, or Vue instance markers like `__vue__` are not reliable from isolated-world code.
- So the spec’s two core assumptions conflict:
  - “Run in isolated world”
  - “Read React/Vue internals from the page”

**What should change**

- Treat framework detection via page JS internals as a **main-world concern**, not an isolated-world concern.
- If Yeshie truly needs page internals, add a main-world bridge:
  - WXT `injectScript` or `world: 'MAIN'` for a tiny page-context probe/adapter.
  - Bridge results back to the parent content script with `CustomEvent` or `window.postMessage`.
- Otherwise, remove `_valueTracker`/`__vue__`/`_reactRootContainer` from the MVP path and rely on DOM-observable behavior only.

### Finding 1.3: The “bypasses page CSP” claim is directionally right but too broad

**What the spec says**

The spec repeatedly states that executing guard scripts with `chrome.scripting.executeScript` in `ISOLATED` world “bypasses page CSP.”

**What’s actually true**

- For extension-authored code injected through Chrome’s extension APIs, the page’s CSP is not the normal blocker the way it is for page inline scripts.
- But this is not a blanket CSP escape hatch:
  - It does not let you run arbitrary string code with `executeScript`.
  - It does not give isolated-world code access to page JS state.
  - If you switch to main-world `<script>` injection to touch framework internals, page CSP can become relevant again depending on technique.

**What should change**

- Rewrite the claim to:
  - “Extension scripts injected with `chrome.scripting.executeScript` can run even when the page CSP would block page-authored inline script, but this does not make `executeScript` a raw-code runner and does not remove isolated-world boundaries.”

### Finding 1.4: Service worker keepalive assumptions are too optimistic

**What the spec says**

The spec says MV3 workers suspend after about 30s idle, checkpoints after each step solve this, and Socket.IO ping/pong plus periodic storage writes keep the worker alive during long operations.

**What’s actually true**

- Chrome terminates extension service workers after 30s of inactivity, after 5 minutes for a single request, or if a `fetch()` response takes over 30s.
- Chrome docs say receiving an event or calling an extension API resets the idle timer.
- Chrome 116 added: **active WebSocket connections** extend service-worker lifetimes.
- Chrome 114 changed long-lived messaging behavior: **sending a message** over a long-lived connection keeps the worker alive; simply opening a port no longer does.
- Periodic storage writes are not a documented keepalive mechanism you should build around.
- Socket.IO only helps here if the transport is actually WebSocket at runtime. Its fallback behavior can matter.

**What should change**

- Design for worker death as normal, not exceptional.
- Do not rely on “storage writes keepalive.”
- If you keep Socket.IO, force `transports: ['websocket']` on the extension side.
- Keep step state in durable storage and make every in-flight command resumable or retryable by correlation ID.
- Add a minimum Chrome version if you depend on post-116 / post-120 lifetime behavior.

### Finding 1.5: Storage usage in the spec will hit quota and lifecycle edges

**What the spec says**

The spec uses `chrome.storage.local` for checkpoints, session IDs, tab registry, optional chat persistence, and hot-reload-safe state.

**What’s actually true**

- `storage.local` is limited to 10 MB unless you request `"unlimitedStorage"`.
- `storage.session` is also 10 MB, in-memory only, and is cleared when the extension is disabled, reloaded, updated, or the browser restarts.
- The Storage API stores JSON-serializable values and has performance/throttling costs.
- Large chat logs, screenshots, DOM snapshots, and mutation logs will consume quota quickly.

**What should change**

- Keep `chrome.storage.local` for small control-plane state only:
  - checkpoints
  - session metadata
  - active tab pointer
- Move bulky artifacts to IndexedDB:
  - finalized step logs
  - screenshots
  - DOM mutation traces
  - long chat history
- Either request `"unlimitedStorage"` or explicitly scope retained data.

### Finding 1.6: Messaging gotchas are real even without a documented hard payload cap

**What the spec says**

The spec treats extension messaging as a general-purpose transport between content, background, sidebar, and relay bridge.

**What’s actually true**

- Chrome extension messaging is for JSON-serializable data.
- Async `onMessage` handlers have lifecycle caveats:
  - historically you must `return true` to keep the channel open;
  - promise-return support is only rolling out in newer Chrome versions.
- Large payloads like base64 screenshots or huge DOM maps are expensive to serialize and bounce through multiple extension contexts.

**What should change**

- Keep runtime messages small and typed.
- Pass opaque IDs for large blobs and store the actual payload elsewhere.
- Use long-lived ports or a dedicated in-page channel only where you truly need streaming behavior.

### Finding 1.7: `document_idle` plus framework probes is not a reliable readiness strategy

**What the spec says**

The content script injects at `document_idle`, then waits for `_reactRootContainer`, `__vue__`, `ng-version`, or a 5s timeout.

**What’s actually true**

- `document_idle` is not “page fully ready.” Chrome defines it as some point between `document_end` and just after `window.onload`, optimized for load speed.
- SPAs can still be hydrating or routing after that point.
- `ng-version` is a DOM attribute and can work.
- `_reactRootContainer` and `__vue__` are not reliable from isolated-world code.

**What should change**

- Replace framework-expando readiness with:
  - document lifecycle checks,
  - route-change detection,
  - mutation-settling heuristics,
  - explicit wait primitives per task.
- If you need framework internals, move that detection to a main-world helper.

## 2. WXT Framework Specifics

### Finding 2.1: WXT does support the basic sidebar architecture

**What the spec says**

The spec assumes WXT can inject a sidebar as a content-script UI, isolate it with shadow DOM, and mount React inside it.

**What’s actually true**

- WXT explicitly supports three content-script UI patterns:
  - integrated
  - shadow root
  - iframe
- WXT explicitly documents `createShadowRootUi`.
- WXT explicitly documents React mounted inside `createShadowRootUi`, including the need to create a wrapper `div` before `ReactDOM.createRoot(...)`.
- WXT also supports `cssInjectionMode: 'ui'`, which is the intended mode for shadow-root content-script UIs.

**What should change**

- Keep the sidebar-as-content-script approach. It is compatible with WXT.
- Be precise in implementation notes:
  - use `createShadowRootUi`
  - use `cssInjectionMode: 'ui'`
  - mount React into a wrapper inside the shadow-root container

### Finding 2.2: WXT’s content-script UI HMR does not match the spec’s implied dev ergonomics

**What the spec says**

The spec leans on WXT for “excellent HMR” and asks for developer-sideloaded iteration with a shadow-DOM sidebar.

**What’s actually true**

- WXT’s current docs show:
  - Integrated UI: HMR `❌`
  - Shadow Root UI: HMR `❌`
  - IFrame UI: HMR `✅`
- So the exact pattern Yeshie wants for the sidebar, React inside shadow DOM, does **not** get true HMR according to WXT’s own docs.

**What should change**

- Stop assuming “excellent HMR” for the in-page sidebar.
- Update the dev workflow section to say:
  - shadow-root sidebar changes generally require extension reload and/or page refresh;
  - if fast UI iteration is a priority, an iframe-hosted dev shell is the HMR-friendly option.

### Finding 2.3: WXT is a good fit for a main-world bridge, which the spec currently lacks

**What the spec says**

The spec assumes isolated-world execution is sufficient for everything.

**What’s actually true**

- WXT documents both:
  - `world: 'MAIN'` for main-world content scripts
  - `injectScript` as the recommended cross-browser way to inject page-context scripts while keeping a parent content script that still has extension API access
- This is directly relevant because the spec wants framework internals and page-owned state that isolated-world code cannot safely read.

**What should change**

- Add a “page bridge” subsystem:
  - parent content script stays isolated and handles extension messaging;
  - tiny main-world helper handles page-internal probing/event interop;
  - bridge with `CustomEvent` / `postMessage`.

### Finding 2.4: WXT’s default timing/registration behavior should be called out explicitly

**What the spec says**

The spec assumes `document_idle` content-script injection and per-page initialization.

**What’s actually true**

- WXT content scripts default to `runAt: 'documentIdle'`.
- WXT also supports `registration: 'manifest'` or `registration: 'runtime'`.

**What should change**

- Keep static manifest registration for the always-on instrumentation layer.
- Reserve runtime registration or `chrome.scripting` execution for exceptional cases, not the normal control plane.

## 3. FastMCP / Python MCP Server

### Finding 3.1: FastMCP tools can work with a persistent relay connection, but only if you use server lifespan/state explicitly

**What the spec says**

The spec uses simple `@mcp.tool()` decorators and describes the MCP server as “pure translator” and “stateless.”

**What’s actually true**

- FastMCP absolutely supports shared process lifetime state through its `lifespan` hook.
- The official Python SDK docs show creating a typed app context in `lifespan` and accessing it from tools via `ctx.request_context.lifespan_context`.
- So a shared `socketio.AsyncClient`, request registry, and timeout manager can live there.

**What should change**

- Implement the relay bridge as a lifespan-managed singleton inside each MCP server process.
- Tools should enqueue a request through that bridge and await a correlated response, not open their own ad hoc socket per call.

### Finding 3.2: The spec’s “MCP server is stateless” claim is false in the architecture that follows

**What the spec says**

The spec says the MCP server is stateless and restart-seamless.

**What’s actually true**

- The moment a FastMCP process owns:
  - a persistent Socket.IO client
  - pending request futures
  - request/response correlation IDs
  - reconnect behavior
it is no longer stateless in the operational sense.
- This is especially true for STDIO mode, where each Claude session may spawn its own MCP server instance and therefore its own relay connection.
- A restart is not seamless for in-flight calls unless you explicitly rebuild the pending-call state machine.

**What should change**

- Reword the architecture:
  - “Tool logic is thin; bridge state is process-local.”
- Specify behavior for:
  - MCP process restart with in-flight calls
  - relay reconnect while tools are awaiting responses
  - duplicate responses
  - cancellation / timeout propagation

### Finding 3.3: SSE is no longer the best network transport to emphasize

**What the spec says**

The spec lists STDIO or SSE for the MCP server.

**What’s actually true**

- The official Python SDK now says Streamable HTTP is the recommended production transport.
- The docs also note that SSE transport is being superseded by Streamable HTTP transport.

**What should change**

- Keep STDIO for local Claude Code sessions.
- If you expose the MCP server over the network, prefer Streamable HTTP instead of centering SSE.

### Finding 3.4: Tool design needs bridge semantics, not just decorators

**What the spec says**

Tool definitions are presented as straightforward async decorator functions.

**What’s actually true**

- The decorator syntax is fine.
- The hard problem is not the decorator. It is the bridge semantics:
  - correlate request to extension response
  - handle multi-tab routing
  - await reconnect/retry safely
  - avoid leaking pending futures on disconnect

**What should change**

- Add a concrete bridge contract to the spec:
  - request ID generation
  - pending future map
  - per-request timeout
  - cancellation
  - reconnect behavior
  - idempotent retry rules

## 4. Guard Pattern Robustness

### Finding 4.1: Virtualized lists will break selector-based waiting in common cases

**What the spec says**

The spec uses `document.querySelector(selector)` plus a `MutationObserver` to wait until an element is present/visible/enabled.

**What’s actually true**

- In virtualized UIs, the target row may not exist in the DOM until scrolled into view.
- Worse, a recycled DOM node may match the selector while representing a different row than before.
- MutationObserver alone does not solve “the right record is not currently rendered.”

**What should change**

- Add a separate strategy for virtualized content:
  - scroll/search loop
  - row identity assertions on text/data keys
  - retry until the right record is materialized

### Finding 4.2: The guard cannot see through page shadow DOM

**What the spec says**

The guard uses `document.querySelector()` and observes `document.body`.

**What’s actually true**

- `document.querySelector()` does not cross shadow-root boundaries.
- MutationObserver on `document.body` does not automatically give you deep semantic visibility into open shadow roots, and closed shadow roots are off-limits.
- The spec lists page Shadow DOM traversal as a non-goal for MVP, but the guard is presented as if it were generally robust.

**What should change**

- State the limitation plainly in the guard section, not just in non-goals.
- Return a specific “target may be inside shadow DOM” diagnostic when applicable.
- If this becomes important, add an opt-in deep-query strategy for open shadow roots only.

### Finding 4.3: Canvas/WebGL and many SVG-heavy apps are outside this guard model

**What the spec says**

The spec assumes DOM structure analysis is the main control strategy and screenshots are a fallback.

**What’s actually true**

- Canvas/WebGL UIs may have no meaningful DOM target to query or click.
- SVG-heavy apps often use elements where `offsetParent` is not a reliable visibility signal.
- Hit regions may depend on transforms, clipping, or overlay layers.

**What should change**

- Add an explicit fallback ladder:
  - DOM action
  - DOM + coordinate hit-test
  - screenshot / visual inspection
  - CDP / debugger path for hard cases

### Finding 4.4: The visibility/enabled checks are too weak for modern UIs

**What the spec says**

Visibility is `offsetParent !== null`; enabled is `!el.disabled`; attributes watched are `disabled`, `class`, `style`, `aria-disabled`.

**What’s actually true**

- `offsetParent` is not a universal visibility test:
  - fails for some fixed-position/layout cases
  - is weak for SVG
- `disabled` misses:
  - `aria-disabled="true"`
  - `inert`
  - CSS `pointer-events: none`
  - obscured-by-overlay situations
- Many apps “disable” controls without using the native `disabled` property.

**What should change**

- Replace the guard’s state checks with a richer interactability test:
  - `getClientRects().length > 0`
  - computed style visibility/display/pointer-events
  - `closest('[inert]')`
  - `aria-disabled`
  - center-point `elementFromPoint` hit test

### Finding 4.5: Body-scoped observation can miss SPA transitions and document churn

**What the spec says**

The guard observes `document.body`.

**What’s actually true**

- Some apps replace major DOM roots during route transitions.
- A body-bound observer can become stale if the relevant subtree is torn down/recreated.

**What should change**

- Observe `document.documentElement` rather than only `document.body`, and rebind on navigation-like events where needed.

## 5. Event Simulation Completeness

### Finding 5.1: Drag-and-drop is missing

**What the spec says**

The event section covers click, text input, contenteditable, select/checkbox/radio, file upload, and scroll.

**What’s actually true**

- Modern apps often require full drag-and-drop sequences:
  - `dragstart`
  - `dragenter`
  - `dragover`
  - `drop`
  - `dragend`
- File drop zones often listen for `drop` with a `DataTransfer`, not just `input[type=file].files`.

**What should change**

- Add a distinct drag-and-drop action family, including file-drop support using `DataTransfer`.

### Finding 5.2: Clipboard paste flows are underspecified

**What the spec says**

Clipboard handling is not really described beyond text/contenteditable input.

**What’s actually true**

- Apps often respond specifically to paste flows:
  - clipboard content population
  - focus target selection
  - `paste`
  - sometimes `beforeinput` / `input`
- Automa includes clipboard permissions and clipboard blocks. That is an actual capability gap versus the spec.

**What should change**

- Add clipboard primitives:
  - read clipboard
  - write clipboard
  - paste into focused target
- Treat this as separate from “type text.”

### Finding 5.3: Context menu / right-click support is missing

**What the spec says**

The spec defines click/hover but not secondary-button interactions.

**What’s actually true**

- Many web apps expose key actions only through context menus.
- Those flows often require `mousedown`/`mouseup` with `button: 2`, `contextmenu`, and sometimes follow-up keyboard navigation.

**What should change**

- Add `right_click` / `open_context_menu` primitives with explicit event sequencing.

### Finding 5.4: Pointer/touch events are missing for mobile-style UIs

**What the spec says**

Click sequences are mouse-oriented.

**What’s actually true**

- Responsive apps and mobile-emulated pages often rely on:
  - `pointerdown` / `pointerup`
  - `touchstart` / `touchend`
  - `pointerType`
- Automa’s event catalog includes touch events. The spec does not.

**What should change**

- Add pointer/touch action support or explicitly narrow MVP to desktop-pointer pages only.

### Finding 5.5: Keyboard/composition coverage is incomplete

**What the spec says**

The spec mentions Puppeteer `USKeyboardLayout` and synthetic key events during typing.

**What’s actually true**

- Some editors rely on more than `keydown`/`keyup`/`input`:
  - `beforeinput`
  - composition events for IME
  - form-submit-on-Enter behavior
- Automa also has a debugger/CDP path for key dispatch in some modes; the spec does not describe a fallback when synthetic keyboard events are insufficient.

**What should change**

- Add:
  - `beforeinput` coverage for editors that need it
  - a future CDP fallback path for keyboard-sensitive apps
  - explicit non-goal language if IME/composition is deferred

## 6. Socket.IO vs Alternatives

### Finding 6.1: Socket.IO gives useful features, but the spec still needs app-level ACK/replay

**What the spec says**

The relay is a pure Socket.IO message bridge with reconnect support.

**What’s actually true**

- Socket.IO guarantees message ordering.
- By default, delivery is **at most once**.
- The official docs say missed server events are not automatically replayed to disconnected clients, and additional guarantees must be implemented in the application.
- Connection-state recovery exists, but it “will not always be successful” and still requires application-level resynchronization.

**What should change**

- If you keep Socket.IO, add:
  - application ACKs
  - durable message IDs
  - explicit replay/resync rules
  - bounded recovery window

### Finding 6.2: Socket.IO is probably heavier than this relay needs

**What the spec says**

Socket.IO is chosen for reconnection, multiplexing, and fallback transport.

**What’s actually true**

- The relay is described as stateless message passing with minimal business logic.
- For that shape, plain WebSocket plus a small typed envelope is often enough.
- Socket.IO adds Engine.IO framing and features you may not need.
- In MV3 specifically, Chrome documents **WebSocket** as extending worker lifetime; that maps cleanly to native WebSocket and only conditionally to Socket.IO depending on transport configuration.

**What should change**

- Preferred change: replace Socket.IO with plain WebSocket (`ws`) unless you know you need rooms/namespaces/recovery helpers.
- If you keep Socket.IO:
  - force WebSocket transport on the extension side,
  - avoid relying on long-polling fallback,
  - document why Socket.IO is worth the added protocol layer.

### Finding 6.3: If the relay stays stateless, Socket.IO connection-state recovery adds limited value

**What the spec says**

The relay keeps a session registry and supports reconnection.

**What’s actually true**

- Socket.IO connection-state recovery can restore socket state for temporary disconnects, but it requires server-side storage of session/packet history for a window.
- If the relay is intentionally thin and not persisting real message history, its recovery story will still be mostly application-level resync.

**What should change**

- Decide explicitly:
  - Either the relay remains thin and replay is handled by application state elsewhere.
  - Or the relay becomes a short-window stateful broker and documents retention limits.

## 7. Practical Deployment

### Finding 7.1: “Developer sideloading” is viable, but the dev loop is not as smooth as the spec implies

**What the spec says**

The MVP uses developer sideloading and expects iterative development with WXT.

**What’s actually true**

- WXT dev mode uses `web-ext` to open a browser with the extension installed.
- During update testing, WXT’s docs still tell you that one manual/manual-like path is to reload the extension from `chrome://extensions`.
- Permission or host-permission changes can disable the extension until the user accepts them.

**What should change**

- Add an honest dev-loop section:
  - most background/content-script changes mean extension reload;
  - some changes also require page refresh or reinjection;
  - permission changes may temporarily disable the unpacked extension.

### Finding 7.2: Shadow-DOM sidebar HMR is not available in the chosen WXT pattern

**What the spec says**

The spec assumes WXT gives a strong HMR experience while also choosing a shadow-root sidebar.

**What’s actually true**

- WXT’s documented matrix says shadow-root content-script UI does **not** have HMR.

**What should change**

- Expect reload-driven development for the sidebar.
- If live UI iteration becomes painful, consider:
  - an iframe-hosted sidebar during development, or
  - a separate local React shell that mirrors the in-extension UI.

### Finding 7.3: Extension reloads invalidate some of the state model the spec wants to preserve

**What the spec says**

The spec wants hot-reload-safe state restoration during development.

**What’s actually true**

- On reload/update, extension service workers restart.
- `chrome.storage.session` is cleared when the extension is reloaded or updated.

**What should change**

- During development, anything that must survive reload goes in:
  - `storage.local` for small state
  - IndexedDB for bulky state
- Do not plan on `storage.session` surviving reloads.

### Finding 7.4: Existing-tab behavior needs to be documented

**What the spec says**

The spec assumes “content script injected into every page” and normal development iteration.

**What’s actually true**

- In practice, after extension reloads, existing tabs often need refresh/reinjection for the latest content-script behavior to be present consistently.

**What should change**

- Add a developer note:
  - after reloading the unpacked extension, refresh the target tab before debugging content-script/sidebar behavior.

## Bottom Line

The biggest architectural issue is not Socket.IO or WXT. It is the combination of:

- raw LLM-generated JS strings,
- `chrome.scripting.executeScript`,
- `ISOLATED` world execution,
- and dependence on page/framework internals like `_valueTracker`.

Those four things do not fit together in MV3 the way the spec currently assumes.

The cleanest correction is:

1. Keep the always-on extension logic in an isolated-world content script.
2. Add a tiny main-world bridge only where page-owned JS state is truly required.
3. Replace arbitrary JS string execution with structured actions or a constrained DSL.
4. Treat the relay/MCP bridge as operationally stateful, even if business logic remains thin.
5. Downgrade HMR expectations for the shadow-DOM sidebar.

## Sources

- Chrome `chrome.scripting` API: https://developer.chrome.com/docs/extensions/reference/api/scripting
- Chrome content scripts / isolated worlds: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome message passing: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- WXT content scripts: https://wxt.dev/guide/essentials/content-scripts
- WXT content-script options: https://wxt.dev/api/reference/wxt/interfaces/basecontentscriptentrypointoptions
- WXT browser startup: https://wxt.dev/guide/essentials/config/browser-startup
- WXT testing updates: https://wxt.dev/guide/essentials/testing-updates
- FastMCP / official MCP Python SDK: https://github.com/modelcontextprotocol/python-sdk
- Socket.IO delivery guarantees: https://socket.io/docs/v4/delivery-guarantees
- Socket.IO connection state recovery: https://socket.io/docs/v4/connection-state-recovery
- Automa repository: https://github.com/AutomaApp/automa
