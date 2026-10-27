# Relay

## Extension instances and routing (2026-09-13)

The relay keeps every Yeshie extension instance connected at once, one per
Chrome profile. Each instance registers a stable `instanceId`, the signed-in
account email, its version, and its live windows and tabs. Full design:
[`docs/design/multi-connection-relay.md`](../../docs/design/multi-connection-relay.md).

- `POST /run`, `POST /run/async`, `POST /teach/start`, `/tabs/*` and
  `/chat/inject` accept `target`: a profile string (`"claude@mike-wolf.com"` or
  `"Profile 3"`), or `{ profile, instanceId, windowId, tabId, url, site }`.
- No target sends the job to the default profile, `mw@mike-wolf.com`
  (`YESHIE_DEFAULT_PROFILE`).
- The relay refuses an ambiguous target with `409 ambiguous_target`, and names
  the candidates. It refuses a missing one with `404 target_not_found`. It
  never guesses.
- A tab lease allows one job per tab, and a second job on that tab gets
  `409 tab_leased`.
- Results come back only from the instance the job was sent to.
- `GET /instances` lists instances, windows, tabs, leases and jobs.
  `node scripts/yeshie-instances.mjs` prints the same as a table.
- `YESHIE_PROFILE_LABELS` (JSON, email → label) overrides the built-in labels
  `Default` (mw@) and `Profile 3` (claude@).

## Guides (`/teach/*`)

Guides are teach sessions with an identity (`guideId`). `POST /teach/start` with
`url`, `guideId`, `title`, or `closeOnDone` registers a guide; the extension
reports completion with socket `teach_done`. All guide HTTP endpoints require
`X-Dispatch-Token` (same as `~/.dispatch/relay.secret`) and allowed source IP.

| Method | Path | Notes |
|--------|------|--------|
| POST | `/teach/start` | `{steps, url?, guideId?, title?, closeOnDone?, notify?, target?}` → `{ok, tabId, guideId?}` |
| GET | `/teach/result/:guideId` | `?waitMs=` long-poll (max 240000). Settled guide includes `explanations`, `stepOutcomes`, `events` history via separate poll |
| GET | `/teach/events/:guideId` | `?since=<n>&waitMs=` long-poll; returns `{events, next}` (`explain` and `step` events) |
| POST | `/teach/reply/:guideId` | `{stepIndex, message?, action?: skip\|redo\|replace, step?}` → emits `teach_reply` to the extension running the guide |

**Explain:** each step tooltip has **Explain**. The human describes what they see;
the extension emits `teach_explain` (stored on the guide). The guiding session
polls `/teach/events` and answers with `/teach/reply` (`message`, or `action`
`skip` / `redo` / `replace`).

**Skip, already done:** per-step link records outcome `already` and advances
without ending the whole guide (whole-guide **Skip** is unchanged).

**Preconditions:** optional `alreadyDoneWhen` (same shape as `doneWhen`) and
`alreadyDoneNote` on a step. When the step opens, if that condition holds—or the
target is missing but `doneWhen` already holds—the tooltip shows “Already done”
briefly and auto-advances.

Client: `node scripts/guide.mjs` (`--wait`, `--events`, `--reply`). Guide JSON
may use short field names (`target`, `alreadyDoneWhen`, …); see script header.

## Attribution

`POST /run` and `POST /run/async` accept optional requester-attribution headers:

- `traceparent`: W3C trace context header (`00-<32hex>-<16hex>-<2hex>`). Malformed values are ignored.
- `x-agent-program`: calling agent program (for example, `cursor`).
- `x-agent-seat`: seat or worker identity.
- `x-agent-task`: task identifier.
- `x-on-behalf-of`: principal/user the caller is acting for.

Each run request writes a `run_requested` entry to `logs/conversations/<date>.jsonl` including:

- request IDs (`jobId`, `commandId`), route, trace/span, requester fields
- recipe identity (`site`, `recipe`) derived from payload metadata
- `param_names` only (never parameter values)

If no valid `traceparent` is provided, the relay logs `requester: "unattributed"`.
