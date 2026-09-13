# Multi-connection relay: many extension instances, routed jobs, tab leases

_Authored 2026-09-13 by Claude (Opus 5, CCc session 36bb11ed) at Mike Wolf's request:
"change the way that the websocket connection works so it can distinguish windows
tabs and profiles and manage multiple interactions."_

## Problem

Before this change the relay held exactly one extension socket (`extensionSocket`).
When a second extension connected, the relay disconnected the first one. Mike's
Chrome runs Yeshie in two profiles: Default (mw@mike-wolf.com) and Profile 3
(claude@mike-wolf.com). The two kept taking the connection from each other, so
which account a job ran as depended on which profile had reloaded most recently. On
2026-09-13 Profile 3 held the connection and could not see the GitHub tab a job
needed. A job could also have acted in a tab signed in as the wrong account. The
workaround was to reload Yeshie in the Default profile.

## Design

### 1. Instances

An **instance** is one Yeshie extension running in one Chrome profile. Every
instance stays connected at the same time.

When the extension connects, it sends this in the socket.io handshake `auth`:

| field | meaning |
|---|---|
| `role` | `"extension"` (unchanged) |
| `instanceId` | A UUID generated once and kept in `chrome.storage.local`. `chrome.storage.local` is separate for each profile, so each profile gets its own stable id that survives restarts and reloads. |
| `profile.email` | The signed-in Chrome account, from `chrome.identity.getProfileUserInfo({accountStatus:'ANY'})`. This needs the `identity` and `identity.email` permissions. The value is `null` if the profile is not signed in. |
| `profile.label` | An optional label set in `chrome.storage.local.yeshieProfileLabel`. |
| `buildVersion` | The manifest version (unchanged). |

The extension then sends an `instance_state` event holding the full list of its
windows and tabs (`windowId`, `tabId`, `url`, `title`, `active`, `focused`). It
sends this on connect, and again 250 ms after any tab or window event (created,
removed, updated, activated, attached, detached, focus changed). A full snapshot is
simpler to keep correct than deltas, and it is small (tens of tabs).

The relay labels each profile. It takes the extension-sent label if one exists.
Otherwise it looks up the email in a label map. The default map is
`mw@mike-wolf.com → Default` and `claude@mike-wolf.com → Profile 3`. The
`YESHIE_PROFILE_LABELS` environment variable (JSON) overrides the map. If neither
source gives a label, the relay uses the email.

**Reconnects.** A connection that reuses an `instanceId` replaces the older socket
for that same instance. This happens, for example, after a service-worker restart.
The older socket is told `superseded` and disconnected. Connections with different
`instanceId`s never replace each other. That rule removes the flap.

**Legacy builds.** An extension build older than this change sends no `instanceId`.
The relay registers it as `legacy:<socket id>` with an unknown profile.

### 2. Routing: every job resolves to exactly one instance, or is refused

A job may carry `target`: `{ instanceId?, profile?, windowId?, tabId?, url?, site? }`.
`profile` matches an email, a label, or an instance id, case-insensitively. A bare
string target is treated as `profile`. The existing top-level `tabId` is still read
as `target.tabId`.

The relay resolves the target in four steps:

1. **Choose the candidate instances.**
   - If `instanceId` or `profile` is given, filter by it. No match means the job is
     refused with `target_not_found`.
   - If only tab-level selectors are given (`tabId`, `windowId`, `url`, `site`), all
     instances are candidates. The relay searches every profile so that it can
     detect ambiguity across profiles.
2. **No target at all → default profile.** The default profile is
   `YESHIE_DEFAULT_PROFILE`, which defaults to `mw@mike-wolf.com`. An instance
   matches if its email is that address or its label is `Default`.
   - Exactly one match: the job routes there. This keeps today's behavior.
   - More than one match: refused, `ambiguous_target`.
   - No match, and exactly one instance is connected, and that instance is a
     legacy build with an unknown profile: the job routes there. This keeps an old
     single-profile setup working. The response says so with `legacyFallback: true`.
   - Otherwise: refused, `default_profile_not_connected`. The error lists the
     profiles that are connected. The relay does not fall back to another account.
3. **Tab-level selectors must match exactly one tab.**
   - `tabId` matches that tab id, and also `windowId` if one is given.
   - `site` matches a tab whose host equals the site, or is a subdomain of it.
   - `url` matches a tab whose URL contains the string.
   - `windowId` alone routes to the active tab of that window.
   - Zero matching tabs: refused, `target_not_found`. One exception keeps legacy
     builds working: if exactly one candidate is connected and it has never
     reported tabs, a named `tabId` is trusted.
   - More than one matching tab, in the same profile or across profiles: refused,
     `ambiguous_target`. The error lists every candidate (`instanceId`, profile,
     `tabId`, `url`) so the caller can name one.
4. **Profile given, no tab named.** If exactly one instance matches, the job goes
   there with no `tabId`. The extension then picks the tab inside its own profile,
   using the same base_url-first logic as today. An extension can only see its own
   profile's tabs, so this can never cross accounts. If two instances match (for
   example, two builds in one profile), the job is refused as `ambiguous_target`.

HTTP status codes:
- `503 Extension not connected`: no instance is connected at all. This matches the
  old message.
- `404`: `target_not_found`.
- `409`: `ambiguous_target`, `default_profile_not_connected` or `tab_leased`.

Every refusal body carries `code`, `error` (a sentence) and `candidates` or
`connected`.

### 3. Jobs and tab leases

- Every job has an id (`commandId`). The pending map records the instance the job
  was sent to. A `chain_result` or `chain_error` is accepted only from that
  instance's socket, so a result can never reach the wrong caller.
- **Lease.** A lease is an exclusive claim on one tab, keyed
  `instanceId:tabId → jobId`.
  - When the relay has resolved a tab itself, it takes the lease before dispatch.
    If another job already holds that tab, the new job is refused with `409
    tab_leased` and the holder's job id.
  - When the extension picks the tab itself (step 4 above), it asks with
    `lease_tab {commandId, tabId}` before running. The relay grants the lease or
    refuses it, and on refusal the extension returns `chain_error`. The request is
    idempotent for the job that already holds the lease. If an older relay does not
    answer within 3 s, the extension proceeds without a lease.
- A lease is released when the job settles: result, error, timeout, or the
  instance disconnecting. A disconnect rejects only that instance's jobs. Jobs on
  other instances keep running.
- Jobs on different tabs or different instances run concurrently. The extension
  already keys runs by `runId`.

### 4. Visibility

- `GET /instances` returns every instance with its profile, version, windows, tabs
  and connect time, plus the list of active leases.
- `GET /status` keeps `extensionConnected` and `buildVersion`, and adds an
  `instances` summary and a `leases` count.
- The CLI `node scripts/yeshie-instances.mjs [--json]` prints the same listing as a
  table.
- The MCP tool `yeshie_status` (in `cc-bridge-mcp/yeshie-server.js`) shows the
  listing. The MCP tool `yeshie_run` accepts `target`.

### 5. Compatibility

- Callers that send no `target` get the default-profile rule, which is today's
  behavior in Mike's setup.
- Callers that send a top-level `tabId` are routed to whichever instance owns that
  tab.
- Recipes are unchanged.
- The socket.io `client` role (`skill_run`, `get_status`, `extension_status`) and
  `inject_chat` route the same way.

### Non-goals

- Cross-machine instances. The relay on the VPS is separate.
- Authenticating instances. Any local process can already connect as `extension`,
  so this change makes routing correct but does not make it secure.
