# Yeshie Failure Modes Review

Scope reviewed: `SPECIFICATION.md` Rev 9 and `PLAN.md`.

This review only lists failure modes that are not adequately handled by the current architecture/plan. Where the docs already define a mitigation, I excluded it unless a materially different gap remains.

## Findings

### FM-01
- Severity: CRITICAL
- Component affected: Background worker checkpoint/resume
- Failure scenario description: The service worker suspends or reloads after a step has been sent to the page but before the result is checkpointed. On wake-up, the worker resumes from the old checkpoint and replays the same non-idempotent step.
- What currently happens (if anything): The docs checkpoint only after step success and resume from `stepIndex + 1`, but they do not define an "in-flight step" record or exactly-once semantics for already-dispatched actions.
- What SHOULD happen: The system must distinguish `pending`, `committed`, and `completed` step states so wake-up can reconcile whether a step already ran.
- Specific fix recommendation: Add a write-ahead execution journal in `chrome.storage.local` with `runId`, `stepIndex`, `attempt`, `phase: dispatched|result_received|checkpoint_committed`, and make resume logic reconcile that journal before replaying any step.

### FM-02
- Severity: HIGH
- Component affected: Alarm-driven resume / skill executor
- Failure scenario description: An active skill wakes the service worker via alarm at the same time a reconnect handler or startup path also resumes the same checkpointed skill, causing double resume and concurrent execution of one run.
- What currently happens (if anything): The docs say alarms should reconnect and resume, and startup should also load checkpoints, but no single-flight resume lock is defined.
- What SHOULD happen: Only one resume path may own a given checkpointed run.
- Specific fix recommendation: Add a per-run mutex keyed by `runId` in the background worker and persist a `resumeOwner` / `resumeStartedAt` field so repeated wake-ups do not start a second executor.

### FM-03
- Severity: HIGH
- Component affected: Checkpoint persistence
- Failure scenario description: Chrome storage write partially succeeds or the worker crashes between writing new checkpoint fields, leaving a structurally valid but semantically mixed checkpoint.
- What currently happens (if anything): The spec validates schema and mentions atomic temp-key rename only in a plan risk note, not in the architecture or execution flow.
- What SHOULD happen: Checkpoint writes must be atomic from the reader's perspective.
- Specific fix recommendation: Implement two-phase checkpoint writes: write `checkpoint_tmp`, validate readback, then swap to `checkpoint`; include a monotonically increasing `version` and checksum.

### FM-04
- Severity: HIGH
- Component affected: Multi-step navigation skills
- Failure scenario description: A tab navigates away or reloads after a step intentionally triggered navigation, but before the next checkpointed step starts. The system cannot tell expected navigation from user interference or a redirect chain landing on the wrong page.
- What currently happens (if anything): The plan says "if skill step caused the navigation: expected, continue; if user navigated away: pause skill" but no mechanism is defined to attribute navigation cause.
- What SHOULD happen: The executor should know whether the current navigation was expected, which URL patterns are acceptable, and when to treat the resulting page as drift.
- Specific fix recommendation: Record an `expectedNavigation` contract per step with initiator step ID, allowed URL patterns, and deadline; reconcile `tabs.onUpdated` against that contract before resuming.

### FM-05
- Severity: HIGH
- Component affected: Tab lifecycle during multi-tab skills
- Failure scenario description: In a multi-tab skill, a non-active tab that will be needed later is manually closed or replaced before its `switch_tab` step.
- What currently happens (if anything): The docs cover active-tab closure, but not future dependency tabs tracked by pattern or tab ID.
- What SHOULD happen: The skill should fail early or re-resolve the target tab before reaching the step, with clear loss of buffered context if needed.
- Specific fix recommendation: Track all tab dependencies declared or inferred during a multi-tab run and validate them on every relevant `tabs.onRemoved` / `tabs.onUpdated` event; convert stale tab references into a resumable error before the next step.

### FM-06
- Severity: MEDIUM
- Component affected: Buffer/inter-tab state
- Failure scenario description: The service worker suspends during a multi-tab skill after `store_to_buffer` mutated in-memory state but before the next checkpoint, losing data needed by later tab steps.
- What currently happens (if anything): The spec says buffer is in memory during execution and persisted only in checkpoints after successful steps.
- What SHOULD happen: Buffer mutations that affect future steps should survive suspension even before the next action finishes.
- Specific fix recommendation: Persist buffer deltas immediately after `store_to_buffer` and before any `switch_tab` or long wait, or include buffer mutation in the write-ahead journal.

### FM-07
- Severity: CRITICAL
- Component affected: Socket.IO message correlation
- Failure scenario description: The relay or extension reconnects while an MCP tool call is pending; a late response from the pre-disconnect session arrives after retry or resume and is incorrectly matched to the new pending request.
- What currently happens (if anything): Message IDs exist, but no session epoch or run generation is attached to request/response correlation.
- What SHOULD happen: Responses from old connections must be rejected as stale.
- Specific fix recommendation: Add `sessionEpoch` and `runId` to every command/response and require the MCP bridge and extension to drop mismatched epochs instead of resolving pending futures.

### FM-08
- Severity: HIGH
- Component affected: MCP bridge pending futures
- Failure scenario description: Socket.IO disconnect occurs while FastMCP is awaiting a browser response, leaving the future unresolved until timeout even though the command can no longer complete on that transport.
- What currently happens (if anything): The plan returns timeout errors after waiting, but does not specify immediate cancellation of all pending futures on disconnect.
- What SHOULD happen: Pending tool calls should fail fast with transport-disconnected semantics.
- Specific fix recommendation: On Socket.IO `disconnect`, reject all unresolved pending futures with a typed transport error carrying `retryable: true` and original command metadata.

### FM-09
- Severity: HIGH
- Component affected: Relay queue / reconnect behavior
- Failure scenario description: The relay queues a command while the extension is asleep, then the MCP client retries due to timeout. When the extension wakes, both the original queued command and the retried command execute.
- What currently happens (if anything): The docs say remote-initiated commands queue until wake-up, but no deduplication or idempotency contract is defined across retries.
- What SHOULD happen: Only one logical command should execute.
- Specific fix recommendation: Make MCP retries reuse the original command ID and have relay/extension dedupe by `(clientId, commandId)` with TTL-based replay protection.

### FM-10
- Severity: CRITICAL
- Component affected: Relay restart / in-flight delivery
- Failure scenario description: The relay crashes or restarts after accepting a command from MCP but before durably persisting or forwarding it, producing ambiguous delivery: maybe lost, maybe delivered.
- What currently happens (if anything): Sessions are snapshotted, but message durability and ack semantics for in-flight commands are not specified.
- What SHOULD happen: Command delivery must have explicit acknowledgement stages so clients know whether to retry safely.
- Specific fix recommendation: Introduce relay-level `accepted`, `forwarded`, and `completed` acks backed by a durable message log or at least a persisted pending-message ledger keyed by command ID.

### FM-11
- Severity: HIGH
- Component affected: `chrome.scripting.executeScript` target selection
- Failure scenario description: A structured command targets a page such as `chrome://`, `chrome-extension://`, `devtools://`, `view-source:`, or the Chrome Web Store where content scripts or script injection are restricted.
- What currently happens (if anything): The spec discusses CSP and userScripts availability but does not define unsupported-page classification or UX for forbidden target schemes.
- What SHOULD happen: The executor should fail immediately with a typed "unsupported page" result and avoid retries or guard escalation.
- Specific fix recommendation: Add a central `isInjectableUrl()` gate before every command and surface a deterministic error with supported/unsupported schemes.

### FM-12
- Severity: HIGH
- Component affected: `chrome.scripting.executeScript` in sandboxed / special frames
- Failure scenario description: The target element is in a frame where injection fails because of sandboxing, opaque origin, or missing host permission for that frame.
- What currently happens (if anything): The spec only says iframe interactions are unsupported; it does not define how injection failures are distinguished from selector failures.
- What SHOULD happen: Execution should return a specific frame-access error, not a misleading guard timeout.
- Specific fix recommendation: Catch injection errors separately, include frame metadata in diagnostics, and map them to `unsupported_frame`, `sandboxed_frame`, or `permission_denied` error codes.

### FM-13
- Severity: MEDIUM
- Component affected: Frame targeting / multi-frame pages
- Failure scenario description: `executeScript` runs in the wrong frame on a page with same-origin subframes, so the selector lookup fails even though the element exists in another frame.
- What currently happens (if anything): The docs assume main-document-only behavior but do not require frame-aware diagnostics before failing.
- What SHOULD happen: The system should tell Claude or the user that the element appears to be outside the main frame instead of returning a generic stale selector failure.
- Specific fix recommendation: Before guard timeout, inspect frame tree metadata and include `sameOriginFrameCount` / `crossOriginFrameCount`; if non-main-frame matches are plausible, emit a dedicated unsupported-iframe diagnostic.

### FM-14
- Severity: HIGH
- Component affected: `chrome.storage.local` usage
- Failure scenario description: Storage becomes unavailable or writes start failing despite `unlimitedStorage` due to enterprise policy, profile corruption, disk-full conditions, or transient runtime errors.
- What currently happens (if anything): The docs discuss byte quota, not write failures from non-quota causes.
- What SHOULD happen: Checkpointing and settings writes should surface a fatal persistence error and stop any run that requires durable recovery.
- Specific fix recommendation: Wrap all storage writes with typed error handling, perform startup writability probes, and block resumable skill execution when durable state cannot be written.

### FM-15
- Severity: MEDIUM
- Component affected: Storage growth management
- Failure scenario description: Chat history, tab registry, session state, and repeated checkpoints accumulate indefinitely, causing degraded performance or storage churn even if hard quota is removed.
- What currently happens (if anything): Cleanup is defined for stale checkpoints and chat history, but not for tab registry versions, retry journals, pending commands, or per-run diagnostics blobs.
- What SHOULD happen: All durable state should have bounded retention and compaction rules.
- Specific fix recommendation: Define retention/size caps per keyspace, especially for diagnostics, run journals, and session recovery metadata; add startup compaction and telemetry counters.

### FM-16
- Severity: CRITICAL
- Component affected: Concurrent skills across tabs
- Failure scenario description: Two tabs run skills simultaneously and both use shared singleton background state such as one global active tab pointer, one checkpoint key, one heartbeat alarm, or one current failure dialog.
- What currently happens (if anything): The docs mention concurrent skills as a reason to keep buffer out of storage, but the checkpoint design still appears singular (`checkpoint`), and no per-run state model is defined.
- What SHOULD happen: Concurrent executions must be isolated by run ID and tab set.
- Specific fix recommendation: Replace singleton execution state with `runs/{runId}` records, per-run checkpoints, per-run alarms or a multiplexed scheduler, and per-run UI status channels.

### FM-17
- Severity: HIGH
- Component affected: Shared tab routing
- Failure scenario description: Simultaneous skills issue commands to the same tab or to tabs matching the same URL pattern, causing interleaving actions and corrupted assumptions.
- What currently happens (if anything): No tab-level locking or ownership model is specified.
- What SHOULD happen: A tab should either be exclusively leased to one run, or commands should be serialized under an explicit arbitration policy.
- Specific fix recommendation: Add tab leases with run ownership and conflict errors for competing runs; require `switch_tab` resolution to honor those leases.

### FM-18
- Severity: HIGH
- Component affected: Extension update / reload lifecycle
- Failure scenario description: The extension updates or is manually reloaded while a session is active and a skill is waiting for Claude/user input or a pending browser response.
- What currently happens (if anything): The spec says "handle context invalidation gracefully" and "persist all state," but it does not define how pending promises, waiting fix requests, or resumed Socket.IO subscriptions are reconciled after reload.
- What SHOULD happen: Reload should reconstruct enough run state to either resume safely or fail closed with a clear message to Claude and the user.
- Specific fix recommendation: Persist a `runState` machine including `waitingForClaude`, `waitingForUser`, `pendingCommandId`, and `lastKnownTransportState`; on startup, reconcile each state explicitly instead of treating reload as generic checkpoint resume.

### FM-19
- Severity: MEDIUM
- Component affected: Extension version compatibility
- Failure scenario description: A relay/MCP message created by a newer extension version is resumed by an older or different version after reload, or vice versa, leading to schema mismatch on checkpoint/session restore.
- What currently happens (if anything): No checkpoint or message schema versioning is defined beyond skill version.
- What SHOULD happen: Persisted run/session state should be versioned and migrations or hard-fail behavior should be explicit.
- Specific fix recommendation: Add `schemaVersion` to checkpoints, run journals, session payloads, and pending relay messages; refuse resume on incompatible major versions.

### FM-20
- Severity: CRITICAL
- Component affected: FastMCP wait semantics
- Failure scenario description: FastMCP times out waiting for the browser while the extension later completes the action successfully; Claude sees failure and may retry, causing duplicate side effects.
- What currently happens (if anything): The docs provide `job_status` for long-running tools, but not for ordinary tool calls that cross the timeout boundary unexpectedly.
- What SHOULD happen: Once a command is accepted, completion should remain queryable even if the original tool call times out.
- Specific fix recommendation: Route every browser action, not just long skills, through a job registry when dispatch succeeds but response is pending; return `status: in_progress` plus `job_id` instead of a hard timeout once dispatch is confirmed.

### FM-21
- Severity: HIGH
- Component affected: Browser-response timeout / extension execution
- Failure scenario description: The background worker dispatches a command to the page, then the page hangs or the worker restarts; FastMCP times out, but the extension may still be mid-execution with no cancellation semantics.
- What currently happens (if anything): No cancellation protocol is defined from MCP timeout back to relay/extension/page.
- What SHOULD happen: Timed-out commands should be cancellable or at least marked orphaned so late completion cannot mutate run state.
- Specific fix recommendation: Add a `cancel_command` message and orphan tracking; if cancellation cannot stop execution, the extension must quarantine any late result unless the original run still owns that command ID.

### FM-22
- Severity: MEDIUM
- Component affected: Content script installation / upgrade
- Failure scenario description: After extension install or update, pre-existing tabs that match host permissions lack the latest content script/instrumentation until navigation or manual reload.
- What currently happens (if anything): The plan covers Chrome restart reinjection, but not explicit `runtime.onInstalled` handling for already-open tabs on first install/update.
- What SHOULD happen: Existing injectable tabs should be enumerated and instrumented immediately where allowed, with unsupported tabs reported.
- Specific fix recommendation: Add `chrome.runtime.onInstalled` logic that queries existing tabs and reinjects or pings content scripts version-aware; mark tabs needing reload when Chrome forbids injection.

### FM-23
- Severity: HIGH
- Component affected: Shadow DOM / cross-origin iframe diagnostics
- Failure scenario description: A selector fails because the control is inside closed shadow DOM or a cross-origin iframe, but the failure is escalated to Claude as a stale selector problem, wasting retries and fix attempts.
- What currently happens (if anything): The spec names these limitations, but no concrete detection path or distinct error code is defined in the execution protocol.
- What SHOULD happen: Claude should receive a hard capability boundary, not a generic guard failure.
- Specific fix recommendation: Extend `GuardDiagnostics` with `likelyClosedShadowDom`, `likelyCrossOriginIframe`, and `capabilityBoundary` fields and bypass normal self-healing retries when those are true.

### FM-24
- Severity: MEDIUM
- Component affected: Open shadow DOM observation
- Failure scenario description: A target inside open shadow DOM appears after an earlier action, but the current guard observes only `document.body`; the element exists yet no mutation is seen, leading to avoidable timeout.
- What currently happens (if anything): The limitation is acknowledged, but the runtime plan still says implement `guardedAction` exactly on `document.body` without defining shadow-root observer registration strategy.
- What SHOULD happen: Guards should attach to discovered open shadow roots relevant to the selector path.
- Specific fix recommendation: Introduce a deep-selector resolver plus observer fan-out that walks open shadow roots and subscribes to them before entering the wait loop.

### FM-25
- Severity: HIGH
- Component affected: Skill YAML parsing
- Failure scenario description: A user-authored `.yeshie` file contains malformed YAML, duplicate keys, YAML anchors/aliases, or ambiguous scalar coercions that parse unexpectedly into a different skill shape.
- What currently happens (if anything): The docs require "safe YAML parser" and schema validation, but do not specify strict duplicate-key rejection, alias limits, or parser configuration that prevents surprising coercions.
- What SHOULD happen: Invalid or ambiguous skill files should be rejected deterministically with line/column diagnostics.
- Specific fix recommendation: Use a strict YAML loader configured to reject duplicate keys, custom tags, excessive alias expansion, and implicit dangerous coercions; report parser location in the returned error.

### FM-26
- Severity: HIGH
- Component affected: User-authored skill execution safety
- Failure scenario description: A skill creates an effective infinite loop or unbounded execution through `call_skill` chains, repeated waits, or huge step counts even without direct recursion.
- What currently happens (if anything): The docs cap `call_skill` depth and detect direct recursion, but do not cap total executed steps, wall-clock runtime, or repeated resume attempts across retries/fixes.
- What SHOULD happen: The executor should have global run budgets to stop pathological skills.
- Specific fix recommendation: Enforce per-run ceilings for total steps executed, total retries, total Claude-fix cycles, and wall-clock duration; persist counters in checkpoint state so limits survive restart.

### FM-27
- Severity: MEDIUM
- Component affected: Claude/user escalation state
- Failure scenario description: The extension is reloaded or disconnected while waiting for `skill_fix_step` or user dialog input, then later resumes the checkpoint with no memory of which escalation is outstanding.
- What currently happens (if anything): The timeout watchdog is described, but outstanding escalation state is not modeled durably.
- What SHOULD happen: On reload, the system should either restore the exact pending escalation or cancel it and surface that cancellation explicitly.
- Specific fix recommendation: Persist `escalationState` with target (`claude` or `user`), deadline, failed step, and correlation IDs; startup should restore timers or invalidate the escalation cleanly.

### FM-28
- Severity: HIGH
- Component affected: Relay session restore
- Failure scenario description: Relay restart restores session registry but not queued in-flight messages consistently, so the extension believes a session is restored while the MCP side still has pending commands that will never be answered.
- What currently happens (if anything): Session restore is defined, but queued-message recovery semantics are not.
- What SHOULD happen: Session restore must include pending-command reconciliation, not just session ID continuity.
- Specific fix recommendation: Persist pending command metadata per session and return it during restore so both MCP and extension can re-drive or cancel orphaned commands explicitly.

## Summary

The existing design already handles first-order failures like basic guard timeout, tab close of the active tab, relay disconnect, and service-worker wake-up. The largest remaining gaps are:

1. Exactly-once execution across suspend/reconnect/retry boundaries
2. Proper isolation for concurrent runs
3. Durable modeling of in-flight and waiting states
4. Clear capability-boundary errors for unsupported page/frame/shadow cases
5. Strict validation and execution budgets for user-authored skills
