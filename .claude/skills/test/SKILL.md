---
name: yeshie:test
description: >
  Testing knowledge for the Yeshie project. Load this skill when you need to run
  tests, understand what each test suite covers, write new tests, or debug a failing suite.
  Trigger on: "run tests", "test suite", "vitest", "unit tests", "failing test",
  "write a test", "HEAL tests", "shadow-dom tests".
---

# Yeshie — Testing

## Quick Commands

```bash
# Run all tests
cd ~/Projects/yeshie && npm test

# Run a single file
npx vitest run tests/unit/target-resolver.test.ts

# Run in watch mode (development)
npx vitest tests/unit/target-resolver.test.ts

# Run with verbose output
npx vitest run --reporter=verbose
```

All tests use **Vitest** with JSDOM. No browser needed — they run in Node.

---

## Test Suites

All files live in `tests/unit/`. Current count: 19 files, 176+ tests.

### Core Logic

| File | What it covers |
|------|---------------|
| `target-resolver.test.ts` | 7-step semantic resolution chain; Vuetify patterns; cached selectors; confidence scoring |
| `step-executor.test.ts` | All action type handlers (`navigate`, `type`, `click`, `wait_for`, `read`, `js`, etc.) |
| `dry-run.test.ts` | Pre-flight resolution checker — validates all abstractTargets resolve before running |
| `schema.test.ts` | Payload JSON schema validation — required fields, param types, mode values |

### Behavior Suites (integration-style, JSDOM)

| File | What it covers |
|------|---------------|
| `yeshid-behavior.test.ts` | YeshID-specific DOM patterns (Vuetify `div.mb-2` sibling labels, edit-form table rows, generated IDs) |
| `gadmin-behavior.test.ts` | Google Admin DOM patterns |
| `shadow-dom.test.ts` | Shadow DOM traversal for targets inside shadow roots |
| `login-flow.test.ts` | Auth detection (session expiry), `PRE_CHECK_AUTH`, `waitForAuth` flow, mid-chain recovery, Google SSO redirect detection |

### Infrastructure

| File | What it covers |
|------|---------------|
| `relay-chat.test.ts` | Relay chat inject/await protocol; heartbeat monitoring; response buffer |
| `background-actions.test.ts` | Background worker action dispatch; `PRE_RUN_DOMQUERY` pattern matching; pre-bundled fn routing |
| `runtime-contract.test.ts` | L1 model contract — action types and resolution strategies defined in `models/runtime.model.json` |
| `payload-coverage.test.ts` | Every task payload file validates against schema and has all required fields |
| `improve-script.test.ts` | `improve.js` merge logic — resolvedOn/resolvedVia/cachedSelector write-back; ESM compatibility |

### UI Components

| File | What it covers |
|------|---------------|
| `chain-overlay.test.ts` | Progress overlay rendering; step state updates |
| `progress-panel.test.ts` | Side panel progress display |
| `sidepanel.test.ts` | Side panel chat UI; message rendering |
| `listener.test.ts` | Haiku listener in side panel — message routing, (C) marker detection, heartbeat emission |
| `teach-tooltip.test.ts` | Teach mode tooltip UI |
| `extract-docs.test.ts` | Doc extraction utility |

---

## Fixture Files

`tests/fixtures/` contains static HTML pages for DOM-dependent tests:

| Fixture | Used by |
|---------|---------|
| `vuetify-onboard.html` | `target-resolver.test.ts`, `yeshid-behavior.test.ts` — realistic Vuetify form with `div.mb-2` label patterns |
| `yeshid-login.html` | `login-flow.test.ts` — login page with redirect detection patterns |

To use a fixture in a test:
```typescript
import { readFileSync } from 'fs'
document.body.innerHTML = readFileSync('tests/fixtures/vuetify-onboard.html', 'utf8')
```

---

## HEAL Tests

"HEAL" (Help Extension Autonomously Learn) tests validate self-improving behavior:

- `improve-script.test.ts` covers the `improve.js` merge script that writes resolved selectors back to payloads
- Tests verify that after successful runs, `cachedSelector`, `cachedConfidence`, and `resolvedOn` are written correctly
- Also verifies that after 5 runs the payload mode promotes to `production`

---

## Writing New Tests

**Pattern for a new behavior test:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'

describe('my feature', () => {
  let document: Document

  beforeEach(() => {
    const dom = new JSDOM('<html>...')
    document = dom.window.document
  })

  it('resolves the target', () => {
    // ...
  })
})
```

**Key imports available:**
- `resolveTarget` from `../../src/target-resolver`
- `executeStep` from `../../src/step-executor`
- `dryRun` from `../../src/dry-run`

---

## Common Failures

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Cannot find module` error | Import path wrong (relative to test file) | Check path is `../../src/...` |
| JSDOM `window is not defined` | Accessing browser globals without JSDOM setup | Use `new JSDOM(...)` in `beforeEach` |
| Snapshot mismatch | Component output changed | Review change, then `npx vitest run --update` to update snapshots |
| `payload-coverage` fails | New payload file missing required field | Check `_meta.task`, `_meta.requiredParams`, `runId`, `site` |

---

## End-to-End Tests

E2E tests run against the live extension through Yeshie — never via CiC or Chrome DevTools MCP.

### Pattern

Every E2E test follows this exact sequence:

```
1. INJECT   — Send a natural-language prompt to Haiku via the Yeshie side panel
              POST http://localhost:3333/chat/inject
              {"tabId": TAB_ID, "message": "Do the thing (C)"}

2. RESPONSE — Confirm Haiku acknowledged the task correctly
              GET  http://localhost:3333/chat/await?tabId=TAB_ID&timeout=60
              Assert: response.type === "response" and text matches expected intent

3. WORKFLOW — Haiku runs the payload/workflow autonomously
              Poll /chat/await with heartbeat monitoring until done
              Assert: no unexpected escalations, no mid-chain failures

4. CONFIRM  — Haiku reports completion in the sidebar
              Assert: final response contains success signal (e.g. "Done", "Complete", task-specific marker)
              Optionally assert DOM state on the target page via a follow-up Haiku read step
```

### Key Rules

- **Step 2 is not optional.** Confirm the right workflow was triggered before waiting for completion. A wrong workflow silently succeeding is a false pass.
- **Heartbeat = still working.** A timeout with a recent heartbeat (< 30s) is not a failure — keep awaiting.
- **Escalate ≠ failure.** If Haiku escalates, the test should surface it clearly, not mark it as a generic error.
- **Never use CiC or Chrome DevTools MCP** to assert page state — use a Haiku `read` step instead.

### Example Skeleton

```typescript
it('onboards a new user end-to-end', async () => {
  // 1. Inject
  await inject(tabId, 'Onboard user: Alice Example, alice@example.com (C)')

  // 2. Confirm correct workflow acknowledged
  const ack = await awaitResponse(tabId, 30)
  expect(ack.text).toMatch(/onboard|creating user/i)

  // 3. Wait for workflow to complete
  const result = await awaitCompletion(tabId, 120)
  expect(result.type).toBe('response')

  // 4. Confirm done in sidebar
  expect(result.text).toMatch(/done|complete|successfully/i)
})
```

Helper functions (`inject`, `awaitResponse`, `awaitCompletion`) live in `tests/helpers/yeshie.ts`.

---

## Direct Workflow Execution (During Development)

While proving out a new workflow, you do NOT need to go through Yeshie + Haiku. Running through the full stack is slow. Acceptable shortcuts during dev:

- Call `yeshie_run` directly with `inline_payload` or `payload_path` + params — bypasses H entirely
- Use `shell_exec` to curl the relay inject endpoint manually and inspect raw results
- Run `npx vitest` unit tests against the payload schema and step logic

**Switch to full E2E (inject → H → confirm) only once the workflow itself is proven.** The E2E test then validates H's understanding and conversational handling, not the underlying steps.

---

## Stress-Testing Haiku's Conversational Quality

Once workflows are stable, stress-test H by sending varied phrasings and edge-case inputs. The goal: confirm H routes correctly, doesn't over-clarify, and produces clean responses.

### Known failure patterns to test

| Pattern | Bad H behavior | Expected behavior |
|---------|---------------|------------------|
| Temporal shorthand | "immediately" → H asks "Immediately ASAP?" | Accept it, set start date = now, proceed |
| Synonym matching | "remove Alice" → H says "no payload found" | Match to offboard payload |
| Partial info | "onboard John" (no last name) | Ask for last name, not a full param dump |
| Over-confirmation | H reads back every param before acting | Confirm only what's notable; just do it if obvious |
| Escalate vs fail | Stuck workflow → H marks as generic error | H should set `escalate: true` with `failureContext` |
| Controller mode | Message ends with (C) → H sends pleasantries | Crisp response, heartbeats, no fluff |

### How to run a stress test

```typescript
// Example: temporal shorthand variations
const variants = [
  'Onboard Test User, test.user@mike-wolf.com, start immediately',
  'Onboard Test User, test.user@mike-wolf.com, start now',
  'Onboard Test User, test.user@mike-wolf.com, start ASAP',
  'Onboard Test User, test.user@mike-wolf.com, start right away',
]

for (const msg of variants) {
  const ack = await injectAndAck(tabId, msg)
  // Should NOT ask for clarification on the start date
  expect(ack.text).not.toMatch(/asap\?|immediately\?|right away\?/i)
  // Should proceed or ask only for genuinely missing info
}
```

Track failures in `memory/patterns.md` so they can inform future prompt improvements.
