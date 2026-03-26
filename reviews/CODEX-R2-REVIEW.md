## Finding 1: Content Scripts Cannot Own `chrome.scripting` / `chrome.userScripts` Injection
**Severity: HIGH**
**What the spec says:**
> "**5. Guard Executor:** Executes browser actions using two paths: ... `chrome.scripting.executeScript({ func, args, world: 'MAIN' })` ... `chrome.userScripts.execute({ js: [{code}] })` ..."  
> "Background Worker ... delegates to content script"

**What's actually true:**
Chrome documents that content scripts can directly access only a limited API set (`dom`, `i18n`, `storage`, and parts of `runtime`). "Content scripts are unable to access other APIs directly." That means `chrome.scripting` and `chrome.userScripts` are not directly callable from the content script; they must be invoked from an extension context such as the service worker or another extension page. The `chrome.scripting` API itself is documented as an extension API that injects into a target tab/frame, and `chrome.userScripts` is likewise an extension API, not a content-script API.  
Documentation: [Content scripts capabilities](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [chrome.scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [chrome.userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)

**Recommended fix:**
Change the execution architecture so the background/service worker owns both injection paths:
- Content script handles already-injected page instrumentation and local DOM work.
- Background worker calls `chrome.scripting.executeScript(...)` and `chrome.userScripts.execute(...)`.
- Content script communicates desired actions back to the background worker via `runtime.sendMessage()`.
- Remove or rewrite the sections that describe the content script itself as the direct caller of these APIs.

## Finding 2: FastMCP Lifespan State Access Pattern Is Wrong
**Severity: HIGH**
**What the spec says:**
> ```python
> @asynccontextmanager
> async def lifespan(app):
>     sio = socketio.AsyncClient(...)
>     await sio.connect('https://vpsmikewolf.duckdns.org')
>     app.state.sio = sio
>     app.state.pending = {}
>     yield
>     await sio.disconnect()
> ```

**What's actually true:**
FastMCP does support `lifespan=` on `FastMCP(...)`, but its documented pattern is to `yield` a dict from the lifespan and access that shared state in tools through `ctx.lifespan_context`. The FastMCP docs show `yield {"data": data}` and then `ctx.lifespan_context["data"]`. They do not document `app.state.sio` as the supported access pattern for FastMCP tool state. Using `app.state...` here is at best undocumented and at worst an `AttributeError`/integration mismatch when tools try to retrieve shared state.  
Documentation: [FastMCP lifespans](https://gofastmcp.com/servers/lifespan)

**Recommended fix:**
Rewrite the MCP example and the implementation contract to use FastMCP's documented context flow:
```python
from fastmcp import FastMCP, Context
from contextlib import asynccontextmanager
import socketio

@asynccontextmanager
async def lifespan(server):
    sio = socketio.AsyncClient(reconnection=True, reconnection_delay=1)
    pending = {}
    await sio.connect(RELAY_URL, auth={"token": RELAY_TOKEN})
    try:
        yield {"sio": sio, "pending": pending}
    finally:
        await sio.disconnect()

mcp = FastMCP("Yeshie Browser Tools", lifespan=lifespan)

@mcp.tool()
async def browser_click(..., ctx: Context) -> dict:
    sio = ctx.lifespan_context["sio"]
```

## Finding 3: The Lifespan Example Omits Relay Auth Even Though the Spec Requires Authenticated Socket.IO Connections
**Severity: MEDIUM**
**What the spec says:**
> "The relay validates the token on connection"  
> "The MCP server sends the same token via its Socket.IO client."  
> But the sample code uses: `await sio.connect('https://vpsmikewolf.duckdns.org')`

**What's actually true:**
The Socket.IO `auth` handshake field is valid for browser clients, and python-socketio also supports `connect(..., auth=...)`. The spec's security section requires token-authenticated relay connections, but the concrete FastMCP lifespan example omits the `auth` argument entirely, so an implementation copied from the spec would fail once relay auth is enforced.  
Documentation: [Socket.IO client `auth` option](https://socket.io/docs/v4/client-options/#auth), [python-socketio client API (`connect(..., auth=...)`)](https://python-socketio.readthedocs.io/en/latest/api.html)

**Recommended fix:**
Update the FastMCP example to include the auth payload explicitly, for example:
```python
await sio.connect(RELAY_URL, auth={"token": os.environ["YESHIE_RELAY_TOKEN"]})
```
Also state explicitly that the browser extension uses `io({ auth: { token } })` and the Python MCP bridge uses `AsyncClient.connect(..., auth={"token": ...})`.

## Finding 4: `chrome.userScripts` Enablement Requirements Are Outdated
**Severity: MEDIUM**
**What the spec says:**
> "`chrome.userScripts.execute()` ... requires the `userScripts` permission and 'Developer mode' enabled in `chrome://extensions`."  
> "Load unpacked from `chrome://extensions` with Developer mode enabled (required for `userScripts` permission)"

**What's actually true:**
Chrome's current `chrome.userScripts` docs say the enablement flow changed in Chrome 138. Before Chrome 138, users needed Developer mode enabled. In Chrome 138 and newer, the required control is the per-extension **Allow User Scripts** toggle on the extension details page. The docs also note that when the toggle is off, `chrome.userScripts` may be undefined. So the spec's "Developer mode is required" statement is no longer generally correct and will mislead implementers and testers on current Chrome builds.  
Documentation: [chrome.userScripts enablement](https://developer.chrome.com/docs/extensions/reference/api/userScripts)

**Recommended fix:**
Replace the current wording with version-aware guidance:
- Chrome 120-137: `userScripts` requires the permission plus Developer mode.
- Chrome 138+: `userScripts` requires the permission plus the extension's Allow User Scripts toggle.
Also add an explicit runtime availability check before calling `chrome.userScripts.execute()` and surface a user-facing error/fallback when unavailable.

## Finding 5: Side Panel Close Behavior Is Overstated for Older Chrome Versions
**Severity: MEDIUM**
**What the spec says:**
> "User clicks the icon again, presses `Escape`, or closes the side panel — the panel closes."  
> "Fallback: If Chrome Side Panel API is unavailable (unlikely on Chrome 114+) ..."

**What's actually true:**
`chrome.sidePanel.open()` exists in Chrome 116+ and must be called in response to a user action. `chrome.sidePanel.close()` was added much later, in Chrome 141+. So for a Chrome 116-140 target range, the spec cannot rely on a programmatic close path for "click again" or `Escape` unless the user closes the panel through Chrome's own UI. The workflow as written implies broader API support than Chrome actually provides.  
Documentation: [chrome.sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

**Recommended fix:**
Adjust the workflow language to be version-accurate:
- Chrome 141+: support explicit programmatic close via `chrome.sidePanel.close(...)`.
- Chrome 116-140: support programmatic open only; closing must be user-driven via Chrome UI unless you fall back to an in-page overlay.
If "toggle" is a hard requirement, either raise the minimum Chrome version for full side-panel behavior or define a pre-141 fallback UX.

## Finding 6: `chrome.storage.local` Quota Notes Are Outdated and Misstate `unlimitedStorage`
**Severity: LOW**
**What the spec says:**
> "`chrome.storage.local`: Default quota is 5MB. Extension manifest includes `unlimitedStorage` permission (raises to ~10MB+)."

**What's actually true:**
Chrome's current storage docs say `storage.local` is **10 MB** by default in Chrome 114+ (5 MB only in Chrome 113 and earlier). The docs also state that `storage.local.QUOTA_BYTES` is ignored if the extension has `unlimitedStorage`. So the spec understates the default quota for modern Chrome and mischaracterizes `unlimitedStorage` as a bump to roughly 10 MB instead of effectively removing that `storage.local` quota cap.  
Documentation: [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

**Recommended fix:**
Replace the storage note with:
- `chrome.storage.local` default quota is 10 MB on Chrome 114+.
- It was 5 MB on Chrome 113 and earlier.
- With `unlimitedStorage`, the `storage.local` byte quota is ignored.
Then revisit any checkpoint/chat-history sizing assumptions derived from the old 5 MB number.

## Summary

| # | Title | Severity | Area |
|---|---|---|---|
| 1 | Content Scripts Cannot Own `chrome.scripting` / `chrome.userScripts` Injection | HIGH | Chrome API / runtime |
| 2 | FastMCP Lifespan State Access Pattern Is Wrong | HIGH | FastMCP / runtime |
| 3 | The Lifespan Example Omits Relay Auth | MEDIUM | Socket.IO / MCP |
| 4 | `chrome.userScripts` Enablement Requirements Are Outdated | MEDIUM | Chrome API |
| 5 | Side Panel Close Behavior Is Overstated for Older Chrome Versions | MEDIUM | Chrome API |
| 6 | `chrome.storage.local` Quota Notes Are Outdated | LOW | Chrome API |

High-severity issues remain. I did **not** find a new WXT monorepo or entrypoint-layout error in Rev 7: the documented `entrypoints/background.ts`, `entrypoints/content.ts`, and `entrypoints/sidepanel/index.html` patterns are consistent with current WXT docs. Reference: [WXT entrypoints guide](https://wxt.dev/guide/essentials/entrypoints).

I also did **not** find a problem with the Socket.IO `auth` handshake shape itself: `io({ auth: { token } })` is correct on the JS client side, and python-socketio supports `connect(..., auth={...})`. Likewise, python-socketio does support `AsyncClient.call(...)` for ack-based request/response patterns, but the current spec does not actually depend on `sio.call()` anywhere. References: [Socket.IO client API](https://socket.io/docs/v4/client-api/), [python-socketio docs](https://python-socketio.readthedocs.io/en/latest/).
