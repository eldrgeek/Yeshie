# Yeshie — Implementation Plan (CDP-First, TDD, Dark Factory)
**Spec:** SPECIFICATION.md Rev 13  
**Date:** 2026-03-30  
**Strategy:** Bottom-up TDD, CDP-first, dark factory — human writes zero code

---

## Operating Model

This project is built entirely by AI agents. No human writes or reads code.

**Three roles:**

| Role | Agent | Responsibility |
|------|-------|---------------|
| **Integrator** | Claude (Cowork, this session) | Owns the plan, writes bead specs, reviews results, maintains PROJECT-STATE.md, decides pass/fail |
| **Builder** | Claude Code (via cc-bridge) | Executes each bead: writes code, writes tests, makes tests pass, returns output report |
| **Reviewer** | Claude Code (second invocation) | Reads bead output against spec criteria, returns PASS or structured FINDINGS |

**Bead execution loop:**
1. Integrator writes bead spec (already in this file)
2. `cc-bridge-mcp:claude_code` executes the bead (workdir: ~/Projects/yeshie)
3. Builder returns output report
4. `cc-bridge-mcp:claude_code` runs reviewer pass on output
5. PASS → Integrator updates PROJECT-STATE.md, fires next bead
6. FINDINGS → Builder re-runs with findings appended, max 2 retries before Integrator intervenes
7. Escalate to human ONLY for: external credentials, account access, architectural pivots

**Timeout management:** claude_code has a ~4min ceiling. Beads are sized to complete in under 3 minutes of agent execution. Long operations are broken into sub-beads or run as background shell processes.

**AI timeline calibration:** A well-specified bead takes one agent session (5–20 min wall clock including review). A poorly-specified bead takes 3 sessions. The plan eliminates ambiguity upfront. Total estimated wall clock to Phase 6 (I can drive it myself via MCP): ~4 hours.

---

## North Star

I (Claude, the AI project lead) can navigate to any website, run an exploration payload that builds a site model, and then accept natural language task descriptions that get compiled into payloads and executed — returning structured results. No human writes code at any point in that loop. The YeshID payloads are the proof-of-concept. Claude.ai, Grok, and ChatGPT are the generalization test.

---

## Acceptance Tests — The 6 YeshID Payloads

These files ARE the integration test suite. When all 6 pass against live app.yeshid.com, Phase 1 is complete.

| # | File | What it proves |
|---|------|---------------|
| 0 | `00-login.payload.json` | State detection, authenticated bypass |
| 1 | `01-user-add.payload.json` | Vuetify label resolution, form fill, snackbar confirmation |
| 2 | `02-user-delete.payload.json` | Table row selection, dialog confirmation |
| 3 | `03-user-modify.payload.json` | Find existing record, update fields |
| 4 | `04-site-explore.payload.json` | Full site map, affordance probing, site model output |
| 5 | `05-integration-setup.payload.json` | preRunChecklist, SCIM config flow |

Run all: `npm run test:integration`  
Run one: `npm run test:integration -- --payload 01-user-add`

---

## Architecture: CDP Executor

```
payload.json + params.json
        │
        ▼
  run-payload.js (Node.js entry point)
        │
        ▼
  PayloadExecutor
  ├── CDP connection (Puppeteer, connects to running Chrome)
  ├── StateAssessor (evaluates stateGraph signals against live page)
  ├── TargetResolver (6-step algorithm, reads abstractTargets)
  ├── StepExecutor (executes each action type with guards)
  │   ├── GuardEngine (MutationObserver pre/post/done phases)
  │   └── EventSimulator (framework-aware click/type/etc)
  └── ChainResult collector
        │
        ▼
  ChainResult JSON (stdout + written to chain-result.json)
        │
        ▼
  improve.js (merges resolved targets back into payload + site model)
```

**Key design decisions:**
- Connects to an ALREADY-RUNNING Chrome instance via `--remote-debugging-port=9222`
- Does NOT launch Chrome itself (Chrome is already open with apps logged in)
- All step types from runtime.model.json are implemented
- Abstract targets resolved via models/generic-vuetify.model.json strategies
- ChainResult is the single output — success or failure with full diagnostics
- This executor core becomes the content script when the extension is built later

---

## Phase 0 — Harness (~15 min)

**Goal:** Project scaffold with working test runner and payload schema validation.

**Done criteria:** `npm test` passes. Loads all 6 payload files, validates JSON structure, confirms required fields present.

**Bead 0 spec:**
```
Create the following in ~/Projects/yeshie:

1. package.json with:
   - name: "yeshie-executor"
   - type: "module"  
   - scripts: { "test": "node --experimental-vm-modules node_modules/.bin/jest", "test:integration": "jest --testPathPattern=integration" }
   - dependencies: puppeteer-core, zod
   - devDependencies: jest, @types/jest

2. src/types.ts — TypeScript interfaces:
   - PayloadMeta, Params, StateGraph, StateNode, AbstractTarget, Step, Payload (full payload shape)
   - ChainResult, ResolvedTarget, StepResult, ModelUpdates
   - Use zod schemas that mirror the interfaces for runtime validation

3. src/schema.ts — Zod schema for Payload validation, exported as PayloadSchema

4. run-payload.js — Entry point:
   node run-payload.js <payload-file> [params-json-string]
   Loads payload, validates against schema, prints "Schema valid: <payload name>" and exits 0
   On schema error: prints errors and exits 1

5. tests/unit/schema.test.ts:
   - describe("Payload schema validation")
   - it("validates 00-login.payload.json") — loads file, runs PayloadSchema.parse(), expect no throw
   - it("validates 01-user-add.payload.json") — same
   - it("validates 02-user-delete.payload.json") — same
   - it("validates 03-user-modify.payload.json") — same
   - it("validates 04-site-explore.payload.json") — same
   - it("validates 05-integration-setup.payload.json") — same
   - it("rejects payload missing required _meta field") — expect throw

6. jest.config.js pointing at tests/

Done: npm test exits 0, all 7 tests pass.
Note: zod schema should be permissive enough for the existing payloads — look at actual payload files to derive the schema, don't invent fields.
```

---

## Phase 1 — CDP Connection (~20 min)

**Goal:** Connect to running Chrome, navigate, detect page state.

**Done criteria:** `node run-payload.js sites/yeshid/tasks/00-login.payload.json` connects to Chrome on port 9222, evaluates the authenticated state signal, returns ChainResult with `success: true` and `statesObserved: ["authenticated"]` (or navigates to login if not authenticated).

**Bead 1 spec:**
```
Add to ~/Projects/yeshie:

1. src/cdp-connection.ts:
   - connect(port = 9222): connects to Chrome via puppeteer-core
   - getActivePage(): returns the currently active/focused page
   - navigateTo(url, waitUntil): navigates and waits
   - exports: { connect, getActivePage, navigateTo }

2. src/state-assessor.ts:
   - assessState(page, stateGraph): evaluates each state node's signals against live page
   - Signal types to implement: url_matches (pattern), element_visible (selector), element_text (selector + text)
   - Returns: { currentState: string | "unknown", confidence: number, signalsMatched: string[] }

3. src/executor.ts (skeleton):
   - class PayloadExecutor
   - constructor(payload, params)
   - async run(): Promise<ChainResult> — for now just runs assessState and returns result
   - async close()

4. Update run-payload.js to actually connect and run:
   - Connect to Chrome
   - Instantiate PayloadExecutor
   - Call executor.run()
   - Print ChainResult as JSON to stdout
   - Write chain-result.json to same directory as payload file
   - Close connection
   - Exit 0 on success, 1 on failure

5. tests/unit/state-assessor.test.ts:
   - Uses fixture HTML strings (not real network) via puppeteer page.setContent()
   - it("detects authenticated state when nav drawer present")
   - it("detects unauthenticated when on /auth URL")
   - it("returns unknown when no signals match")
   - it("handles url_matches pattern signal")
   - it("handles element_visible signal")

6. tests/integration/00-login.test.ts:
   - Requires CHROME_DEBUG_PORT=9222 env var or skips
   - Runs 00-login payload against live Chrome
   - Asserts ChainResult.success === true
   - Asserts statesObserved includes a recognized state

Done: npm test (unit) passes. npm run test:integration -- --testPathPattern=00-login passes against live Chrome.
```

---

## Phase 2a — Target Resolution Unit Tests (~25 min)

**Goal:** The 6-step resolution algorithm fully tested against fixture HTML.

**Done criteria:** `npm test` includes 20+ passing tests for target resolution. vuetify_label_match works on real Vuetify DOM structure.

**Bead 2a spec:**
```
Add to ~/Projects/yeshie:

1. src/target-resolver.ts:
   Implement TargetResolver class with method:
   resolve(page, abstractTarget, framework): Promise<ResolvedTarget>
   
   Six steps in order:
   Step 1 (cached): if cachedSelector && cachedConfidence >= 0.85 && age < 30 days → use it
   Step 2 (aria): search by aria-label, aria-role matching semanticKeys
   Step 3 (framework): if resolutionStrategy set, apply it from framework model
   Step 4 (contenteditable): match contenteditable elements by context
   Step 5 (css cascade): try each selector level 1-8 using semanticKeys as hints
   Step 6 (escalate): return { resolvedVia: "escalate", selector: null, confidence: 0 }
   
   Load models/generic-vuetify.model.json for vuetify strategies.
   Implement vuetify_label_match: find .v-label containing semanticKey text, walk to .v-input parent, return the input inside.

2. tests/fixtures/vuetify-form.html:
   A minimal Vuetify 3 form structure (static HTML, no JS needed) with:
   - A .v-input containing .v-label "First name" and an input
   - A .v-input containing .v-label "Last name" and an input  
   - A .v-input containing .v-label "Company email" and an input
   - A .v-btn with text "Create"
   - A .v-data-table__tr with sample user data
   - A .v-snack__content (hidden) with text "User added successfully"

3. tests/unit/target-resolver.test.ts:
   All tests use page.setContent(vuetifyFormHtml) — no network
   
   describe("Step 1: cached selector")
   - it("uses cached selector when confidence >= 0.85 and age < 30 days")
   - it("skips cache when confidence < 0.85")
   - it("skips cache when age > 30 days")
   - it("skips cache when cachedSelector is null")
   
   describe("Step 3: vuetify_label_match")
   - it("resolves first-name-input by label text 'First name'")
   - it("resolves last-name-input by label text 'Last name'")
   - it("resolves company-email-input by label text 'Company email'")
   - it("returns confidence 0.9 for vuetify_label_match")
   - it("returns resolvedVia: 'vuetify_label_match'")
   - it("handles case-insensitive label matching")
   
   describe("Step 2: aria")  
   - it("resolves by aria-label when present")
   - it("resolves by role + text combo")
   
   describe("Step 5: css cascade")
   - it("prefers data-testid over class name")
   - it("skips generated IDs matching /input-v-\\d+/")
   - it("skips generated IDs matching /_react_/")
   
   describe("Step 6: escalation")
   - it("returns escalate when all steps fail")
   - it("includes diagnostics in escalation result")

Done: npm test with all resolution tests passing.
```

---

## Phase 2b — Resolution Integration (~20 min)

**Goal:** Dry-run mode resolves all targets in a real payload without clicking anything.

**Done criteria:** `node run-payload.js sites/yeshid/tasks/01-user-add.payload.json --dry-run` prints each abstract target with which resolution step was used. No escalations.

**Bead 2b spec:**
```
1. Add --dry-run flag to run-payload.js:
   In dry-run mode: connect to Chrome, navigate to the payload's site URL, 
   resolve all abstractTargets, print resolution report, exit without executing steps.

2. Add resolveAll(page, payload) method to TargetResolver:
   Returns ResolutionReport: { targets: { [name]: ResolvedTarget }, allResolved: boolean, escalations: string[] }

3. Output format for --dry-run:
   {
     "dryRun": true,
     "payload": "01-user-add",
     "targets": {
       "first-name-input": { "selector": ".v-input:nth-child(1) input", "confidence": 0.9, "resolvedVia": "vuetify_label_match" },
       ...
     },
     "allResolved": true,
     "escalations": []
   }

4. tests/integration/dry-run.test.ts:
   - Runs --dry-run on 01-user-add against live Chrome/YeshID
   - Asserts allResolved === true
   - Asserts no escalations
   - Asserts each target has resolvedVia !== "escalate"

Done: dry-run passes with all targets resolved via vuetify_label_match or aria.
```

---

## Phase 3a — Core Step Execution (~25 min)

**Goal:** click, type, navigate execute with guards. 01-user-add fills the form.

**Done criteria:** `npm run test:integration -- --testPathPattern=01-user-add` passes. A real user is added to YeshID.

**Bead 3a spec:**
```
1. src/guard-engine.ts:
   guardedAction(page, guardSpec, actionFn, timeoutMs = 10000): Promise<StepResult>
   - pre phase: wait for selector to match guardSpec state (visible, enabled, text)
   - Uses page.waitForSelector or MutationObserver-equivalent via page.evaluate
   - do phase: calls actionFn with the element
   - post phase: checks post guardSpec immediately
   - Returns StepResult { success, guardPassed, durationMs, error?, diagnostics? }

2. src/event-simulator.ts:
   Framework-aware event dispatch for:
   - click(page, selector): mousedown → mouseup → click → focus sequence
   - type(page, selector, value, clearFirst): React _valueTracker workaround + full event sequence
   - navigate(page, url, waitUntil): puppeteer page.goto wrapper

3. src/step-executor.ts:
   executeStep(page, step, params, resolvedTargets): Promise<StepResult>
   Handles action types: click, type, navigate
   Resolves step.target via resolvedTargets map if present, else uses step.selector directly
   Applies param interpolation ({{first_name}} → params.first_name)

4. Wire into PayloadExecutor.run():
   For each step: resolve target if abstract, execute step, collect StepResult
   On step failure: retry up to 2x with backoff, then mark ChainResult failed with diagnostics
   Collect all StepResults into ChainResult

5. tests/integration/01-user-add.test.ts:
   - Params: { first_name: "Yeshie", last_name: "Test", company_email: "yeshie-test-<timestamp>@example.com" }
   - Runs full payload
   - Asserts ChainResult.success === true
   - Asserts ChainResult.modelUpdates.resolvedTargets has entries for all abstractTargets
   - Asserts snackbar confirmation was observed (stepsExecuted includes a read step result with "successfully")

Done: npm run test:integration -- --testPathPattern=01-user-add passes. Real user created in YeshID.
```

---

## Phase 3b — Remaining Step Types (~20 min)

**Goal:** All step types implemented. 00-login and full explore work.

**Done criteria:** 00-login and 04-site-explore pass integration tests.

**Bead 3b spec:**
```
Add to step-executor.ts:
- wait_for: page.waitForSelector with guardSpec state
- read: page.evaluate to extract textContent from selector, store to buffer
- assess_state: call StateAssessor.assessState(), branch to onMatch/onMismatch steps
- hover: page.hover with pre-guard
- scroll: page.evaluate element.scrollIntoView()
- probe_affordances: hover each button/icon in selector container, collect tooltip texts, store to buffer
- assert: evaluate selector text, compare to expected value
- select: page.select for dropdowns, click for checkboxes

Update PayloadExecutor to handle assess_state branching:
- When assess_state step has onMismatch and currentState doesn't match expect.state, 
  execute onMismatch steps before continuing

tests/integration/00-login.test.ts — already passing, verify still passes
tests/integration/04-explore.test.ts:
- Runs 04-site-explore payload
- Asserts ChainResult.success === true  
- Asserts ChainResult.modelUpdates.statesObserved.length >= 3
- Asserts output contains affordance data

Done: both integration tests pass.
```

---

## Phase 3c — js action + full suite (~15 min)

**Goal:** js action works. 02-delete and 03-modify pass.

**Bead 3c spec:**
```
Add to step-executor.ts:
- js: page.evaluate(code) with store_to_buffer support
  Template interpolation applied to code string before execution

tests/integration/02-delete.test.ts — runs and passes
tests/integration/03-modify.test.ts — runs and passes

Also add tests/integration/05-integration.test.ts:
- 05-integration-setup has a preRunChecklist
- Test that PayloadExecutor surfaces the checklist items in ChainResult before attempting execution
- If checklist items exist and --skip-checklist not passed, ChainResult returns { needsChecklist: true, items: [...] }
```

---

## Phase 4 — Full Suite Milestone (~15 min)

**Goal:** All 6 payloads pass. Phase 1 complete.

**Bead 4 spec:**
```
1. Add npm run test:integration script that runs all 6 integration tests in sequence
2. Fix any failures found (likely param interpolation edge cases or timing issues)
3. Add a summary reporter that prints:
   PAYLOAD SUITE RESULTS
   ✅ 00-login         2.1s
   ✅ 01-user-add      4.3s  
   ✅ 02-user-delete   3.8s
   ✅ 03-user-modify   3.2s
   ✅ 04-site-explore  8.1s
   ⚠️  05-integration  needs-checklist
   
   5/5 executable payloads passed.

Done: All 6 payloads run. The 5 fully-automated ones pass. 05-integration correctly returns needs-checklist.
```

---

## Phase 5 — Self-Improvement (~20 min)

**Goal:** Successful runs write back to payload and site model. Second run is faster.

**Bead 5 spec:**
```
1. src/improve.ts (replace/enhance existing improve.js):
   mergeChainResult(payloadPath, chainResult, siteModelPath): void
   - For each resolvedTarget in chainResult.modelUpdates.resolvedTargets:
     - If confidence > existing cachedConfidence: update cachedSelector + cachedConfidence + resolvedOn
     - If age > 30 days: replace regardless
   - Increment payload._meta.runCount
   - Set payload._meta.lastSuccess to now
   - Advance execution_mode: runCount >= 5 → verification, runCount >= 10 → production
   - Write updated payload back to file
   - Write resolved targets to siteModelPath abstractTargets

2. Wire into run-payload.js: after successful run, call mergeChainResult automatically

3. tests/unit/improve.test.ts:
   - it("updates cachedSelector when new confidence higher")
   - it("does not update when existing confidence higher")
   - it("clears stale cache older than 30 days")
   - it("increments runCount")
   - it("advances mode to verification at runCount 5")
   - it("advances mode to production at runCount 10")
   - it("writes updated payload back to disk")

4. Verify with integration: run 01-user-add twice, assert second run has resolvedVia: "cached" for all targets.

Done: npm test passes including improve tests. Double-run shows cache hit on second execution.
```

---

## Phase 6 — MCP Interface (~25 min)

**Goal:** I (Claude via cc-bridge) can call skill_run and get a ChainResult.

**Done criteria:** `cc-bridge-mcp:claude_code` task "call the yeshie MCP server's skill_run tool with payload yeshid/01-user-add and params {first_name: 'MCP', last_name: 'Test', company_email: 'mcp-test@example.com'}" — succeeds and returns ChainResult.

**Bead 6 spec:**
```
1. mcp-server/server.py using FastMCP:
   
   Tools to implement:
   
   skill_run(payload_name: str, params: dict) -> dict
     Resolves payload_name to a file path (e.g. "yeshid/01-user-add" → sites/yeshid/tasks/01-user-add.payload.json)
     Runs: node run-payload.js <path> <params-json>
     Returns ChainResult as dict
   
   skill_save(name: str, steps: list, description: str, site: str) -> dict
     Writes a new .payload.json file to sites/<site>/tasks/<name>.payload.json
     Returns { saved: true, path: str }
   
   knowledge_query(site: str, topic: str = None) -> dict
     Returns contents of sites/<site>/site.model.json if exists
     Returns { found: false } if not
   
   browser_navigate(url: str) -> dict
     Runs a minimal navigate payload against live Chrome
     Returns { success: bool, finalUrl: str }
   
   browser_read_controls(url: str = None) -> list
     Navigates to URL (or uses active page), runs readControls
     Returns list of PageControl objects
   
   browser_screenshot(selector: str = None) -> dict
     Takes screenshot, returns base64 PNG

2. mcp-server/requirements.txt: fastmcp, subprocess (stdlib)

3. mcp-server/README.md: how to run (python server.py), how to configure in Claude Desktop

4. The MCP server runs the Node executor as a subprocess — no shared process, clean separation

Done: python mcp-server/server.py starts without error. Claude Code can call skill_run via cc-bridge.
```

---

## Phase 7 — Any Website (2 beads, ~30 min each)

### Bead 7a — Generalized Exploration

**Goal:** Point at any URL, get a site model back.

**Bead 7a spec:**
```
1. Create sites/generic/tasks/explore.payload.json:
   A parameterized exploration payload:
   params: { url, site_name }
   Steps:
   - navigate to url
   - assess_state (builds initial state: "homepage")
   - probe_affordances on nav, main, header elements
   - read page title, main heading
   - follow up to 5 nav links, assess_state at each, record URL patterns
   - return full statesObserved + affordances found
   
2. Update improve.ts to create a new site model from exploration ChainResult when none exists:
   - Creates sites/<site_name>/site.model.json from statesObserved
   - Populates initial abstractTargets from affordances found

3. tests/integration/explore-external.test.ts:
   Three tests (each can be skipped if URL not reachable):
   - it("explores claude.ai") — navigates, returns statesObserved with at least 2 states
   - it("explores grok.com") — same
   - it("explores chatgpt.com") — same
   Each asserts a valid site.model.json is written to sites/<site_name>/

Done: node run-payload.js sites/generic/tasks/explore.payload.json '{"url":"https://claude.ai","site_name":"claude-ai"}' produces sites/claude-ai/site.model.json
```

### Bead 7b — Task Payload Generation

**Goal:** Natural language → payload → execution.

**Bead 7b spec:**
```
1. src/payload-generator.ts:
   generatePayload(siteModel, taskDescription): Payload
   Uses Claude API (claude-sonnet-4-20250514) with the site model as context
   System prompt: "You are a Yeshie payload generator. Given a site model and task description, 
   generate a valid payload JSON. Use the abstractTargets from the site model. 
   Return only valid JSON matching the payload schema."
   Returns a Payload that passes PayloadSchema.parse()

2. Add generate command to run-payload.js:
   node run-payload.js --generate "send a message saying hello" --site claude-ai
   → Generates payload, saves to sites/claude-ai/tasks/generated-<slug>.payload.json
   → Immediately runs it
   → Returns ChainResult

3. tests/integration/generate.test.ts:
   - it("generates and executes a Grok message payload")
     task: "send the message 'What is 2+2?' to Grok"
     asserts: ChainResult.success === true
     asserts: a response was read from the page

Done: node run-payload.js --generate "send 'What is 2+2?' to Grok" --site grok produces a working payload and executes it.
```

---

## PROJECT-STATE.md Format

I maintain this file after every bead. It is the handoff document between beads.

```markdown
# Yeshie Project State
Updated: <ISO timestamp>
Phase: <current phase name>
Last bead: <id> — <name> — PASS/FAIL
Next bead: <id> — <name>

## Passing Tests
- unit/schema: 7/7
- unit/state-assessor: 5/5
...

## Integration Tests
- 00-login: PASS (2.1s)
- 01-user-add: PASS (4.3s)
...

## Blockers
none

## Next Bead Invocation
cc-bridge-mcp:claude_code task: "<paste bead spec here>"
workdir: ~/Projects/yeshie
```

---

## Reviewer Prompt Template

After each Builder run, fire a second claude_code invocation:

```
You are a code reviewer for the Yeshie project. Review the following bead output.

BEAD SPEC:
<paste bead spec>

DONE CRITERIA:
<paste done criteria from bead>

BUILDER OUTPUT:
<paste builder output>

Return exactly one of:
PASS — all done criteria met, tests pass, no regressions

FINDINGS:
- [BLOCKING] <description> — must fix before proceeding
- [WARNING] <description> — should fix but not blocking
- [NOTE] <description> — for future reference
```

---

---

## Architecture Revision: ClaudeInChrome as Runtime (2026-03-30)

**Discovery:** ClaudeInChrome tools work on already-open logged-in sessions with no Chrome debug port required. This is superior to CDP for our use case.

**Revised execution model:**

```
Payload JSON
     │
     ▼
Claude (Integrator) reads payload chain
     │  for each step:
     ├─ navigate → Claude in Chrome:navigate
     ├─ find element → Claude in Chrome:find (NL resolution = Steps 2+3 free)
     ├─ read state → Claude in Chrome:javascript_tool (evaluate signals)
     ├─ type/click → Claude in Chrome:form_input + javascript_tool
     ├─ read result → Claude in Chrome:get_page_text or javascript_tool
     └─ collect → ChainResult assembled in memory
     │
     ▼
ChainResult JSON → shell_exec writes to chain-result.json → improve.js merges
```

**What this means for beads:**

- Bead 1 (CDP Connection) → REPLACED: Claude executes 00-login payload directly using ClaudeInChrome tools
- Bead 2a (TargetResolver unit tests) → STILL NEEDED: the resolver logic runs as injected JS, needs tests
- Bead 2b (dry-run) → REPLACED: dry-run is Claude calling `find` on each abstractTarget
- Bead 3a-3c (step execution) → REPLACED: step execution IS the ClaudeInChrome tool calls
- run-payload.js → becomes a thin wrapper Claude uses to load+parse payload JSON, then hands off to Claude-as-runtime
- The Node.js executor still gets built for Phase 6 (MCP interface) but CDP is not needed — it shells out or uses a different transport

**Key insight:** `Claude in Chrome:find` with a natural language query IS the semantic resolution algorithm. "First name input in onboard form" resolves to the right element without any code. The 6-step algorithm becomes the fallback for when `find` fails, not the primary path.

