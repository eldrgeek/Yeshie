#!/usr/bin/env node
/**
 * YeshID "add a new user" end-to-end test — instruct-then-verify, live mutation.
 *
 * PHILOSOPHY (same as tests/integration/github-recipes.mjs — read that file's
 *   header first): this drives the REAL relay -> extension -> content-script
 *   path against a live app.yeshid.com session, not a mocked/jsdom fixture.
 *   A green run here means the whole stack actually works today, not that a
 *   snapshot from some past date still parses.
 *
 * WHAT THIS EXERCISES (closes the gap from the 2026-07-10 investigation):
 *   1. sites/yeshid/tasks/00-login.payload.json — session check (onMatch:
 *      "exit_success" early-exit, added 2026-07-10; verifies without a full
 *      SSO click-through when already authenticated).
 *   2. scripts/clarify-and-run.mjs — the NL-intent clarifying-question layer:
 *      feeds a vague intent ("add a new user to the engineering organization"),
 *      confirms it asks for every required param instead of guessing, and
 *      accepts scripted answers via --answers-file (this test's stand-in for
 *      a live human/chat turn).
 *   3. sites/yeshid/tasks/01-user-add.payload.json — the actual onboarding
 *      mutation: navigate to People, click "Create person" (route changed to
 *      /organization/people/create 2026-07 — fixed this session), fill the
 *      form, submit, and verify via the Vuetify data-table pagination footer
 *      ("1-N of TOTAL") that the org's total person count went up by exactly 1.
 *
 * THIS IS A REAL MUTATION. Every run creates one new person in the live
 * app.yeshid.com org (mw@mike-wolf.com tenant), named
 * "Etwotest Run<letters>" (alpha-only, base-26-encoded timestamp — see runOnboard()) so it's unambiguous and disambiguated from any
 * other run. This test does NOT delete the person it creates — cleanup is a
 * deliberate separate, human-confirmed action (see AGENTS.md / this repo's
 * root CLAUDE.md: "never delete in a production org without Mike's say-so").
 * Do not add this to a CI job that runs unattended and unbounded; it is meant
 * to be run by a human (or an agent with explicit go-ahead) who understands
 * it will leave a new record behind each time.
 *
 * PRECONDITIONS:
 *   - Yeshie relay up at localhost:3333 with the extension connected
 *     (`curl -s localhost:3333/status` -> {"ok":true,"extensionConnected":true})
 *   - A live, already-authenticated app.yeshid.com session as mw@mike-wolf.com
 *     in the browser the extension is attached to (or the 00-login SSO
 *     click-through steps must be live-verified — they are NOT exercised by
 *     this test when a session already exists, since the login recipe exits
 *     early on the "authenticated" state; see KNOWN GAPS below).
 *
 * KNOWN GAPS (flagged, not silently swept under the rug):
 *   - 00-login.payload.json's actual Google-account-chooser click-through
 *     (steps s3-s6) has still never been exercised live by this test suite,
 *     because every run so far found an existing authenticated session and
 *     exited at s2. If the session cookie is ever cleared, the FIRST run
 *     after that will be the real test of s3-s6 — watch it closely.
 *   - start_date_preset options "Monday morning" / "Pick date & time" are not
 *     implemented (the live UI no longer has a preset menu — it's a plain
 *     optional date field, see 01-user-add.payload.json step s2b's note).
 *     This test only exercises "Immediately".
 *
 * USAGE:
 *   node tests/e2e/yeshid-add-user.e2e.mjs
 *   YESHIE_RELAY=http://localhost:3333 node tests/e2e/yeshid-add-user.e2e.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RELAY = process.env.YESHIE_RELAY || "http://localhost:3333";
const RESULTS_FILE = "/tmp/yeshid-add-user-e2e-result.json";

function log(...args) {
  console.log("[e2e:yeshid-add-user]", ...args);
}

async function preflight() {
  const res = await fetch(`${RELAY}/status`, { signal: AbortSignal.timeout(3000) }).catch(
    () => null
  );
  if (!res || !res.ok) {
    throw new Error(
      `Relay not reachable at ${RELAY}. Start it (com.yeshie.relay) and retry.`
    );
  }
  const status = await res.json();
  if (!status.ok || !status.extensionConnected) {
    throw new Error(
      `Relay up but extension not connected: ${JSON.stringify(status)}. ` +
        `Open Chrome with the Yeshie extension loaded (chrome-debug-restart) and retry.`
    );
  }
  log("preflight ok:", JSON.stringify(status));
}

async function runLogin() {
  const payloadPath = path.join(REPO_ROOT, "sites/yeshid/tasks/00-login.payload.json");
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  // 00-login.payload.json has no top-level `params` runtime object — only
  // `_meta.params[*].default`. Build the runtime params from those defaults
  // (this is what the yeshie_run MCP tool's own merge — `{...payload.params,
  // ...params}` — expects to already exist; login's payload just never had it).
  const metaDefaults = Object.fromEntries(
    Object.entries(payload._meta?.params || {})
      .filter(([, spec]) => spec.default !== undefined)
      .map(([key, spec]) => [key, spec.default])
  );
  const body = JSON.stringify({
    payload,
    params: { ...metaDefaults, ...(payload.params || {}) },
    tabId: null,
    timeoutMs: 60000,
  });
  const res = await fetch(`${RELAY}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(65000),
  });
  const result = await res.json();
  if (!res.ok || result.success === false) {
    throw new Error(`00-login failed: ${result.error || res.status}`);
  }
  log(
    `00-login ok (goalReached=${result.goalReached}, steps=${result.stepsExecuted}, ` +
      `states=${JSON.stringify(result.modelUpdates?.statesObserved)})`
  );
  return result;
}

async function runOnboard() {
  const payloadPath = path.join(REPO_ROOT, "sites/yeshid/tasks/01-user-add.payload.json");
  const answersPath = path.join(REPO_ROOT, "tests/e2e/.tmp-yeshid-add-user-answers.json");

  // company_email's derivationTemplate lowercases first/last name into
  // firstname.lastname@<domain> and validates against a [a-z]+\.[a-z]+ pattern
  // — no digits allowed. Encode the timestamp as base-26 letters (a-z) so each
  // run is still unique without breaking that pattern.
  const stamp = Date.now();
  let n = stamp;
  let lettersuffix = "";
  while (n > 0) {
    lettersuffix = String.fromCharCode(97 + (n % 26)) + lettersuffix;
    n = Math.floor(n / 26);
  }
  const answers = {
    first_name: "Etwotest",
    last_name: `Run${lettersuffix}`,
    backup_email: `e2etest.run${stamp}.throwaway@example.com`,
    start_date_preset: "Immediately",
  };
  fs.mkdirSync(path.dirname(answersPath), { recursive: true });
  fs.writeFileSync(answersPath, JSON.stringify(answers, null, 2));

  try {
    const clarifyScript = path.join(REPO_ROOT, "scripts/clarify-and-run.mjs");
    const { stdout } = await execFileAsync(
      "node",
      [
        clarifyScript,
        payloadPath,
        "add a new user to the engineering organization",
        "--answers-file",
        answersPath,
        "--timeout-seconds",
        "90",
      ],
      { cwd: REPO_ROOT, maxBuffer: 20 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    return { ...parsed, testPerson: answers };
  } finally {
    fs.rmSync(answersPath, { force: true });
  }
}

function assertOnboardResult(run) {
  const failures = [];
  const r = run.result;

  if (!r) failures.push("no ChainResult returned from clarify-and-run.mjs");
  if (r && r.success !== true) failures.push(`ChainResult.success was ${r.success}, expected true`);
  if (r && r.goalReached !== true) failures.push(`ChainResult.goalReached was ${r.goalReached}, expected true`);

  // The clarifying-question layer must have actually asked — not silently
  // filled every field from the answers file without a turn-by-turn exchange.
  const askedFields = (run.transcript || [])
    .filter((t) => t.role === "yeshie")
    .map((t) => t.text);
  const requiredPromptHints = ["first name", "last name", "email", "start"];
  const missingPrompts = requiredPromptHints.filter(
    (hint) => !askedFields.some((q) => q.toLowerCase().includes(hint))
  );
  if (missingPrompts.length) {
    failures.push(
      `clarifying layer did not visibly ask about: ${missingPrompts.join(", ")} ` +
        `(transcript: ${JSON.stringify(askedFields)})`
    );
  }

  // Bookend verification: total people count should have gone up by exactly 1.
  const initial = r?.buffer?.initial_active_people?.numericValue;
  const final = r?.buffer?.final_active_people?.numericValue;
  if (typeof initial !== "number" || typeof final !== "number") {
    failures.push(
      `bookend counts missing or non-numeric (initial=${initial}, final=${final})`
    );
  } else if (final !== initial + 1) {
    failures.push(`expected final count (${final}) to be initial (${initial}) + 1`);
  }

  // Submit step (s7) must not have hit its failureSignature.
  const s7 = (r?.stepResults || []).find((s) => s.stepId === "s7");
  if (!s7 || s7.status !== "ok") {
    failures.push(`submit step s7 status was ${s7?.status}, expected ok`);
  }

  // Confirmation message should read as a success (s8 read step).
  const confirmation = r?.buffer?.confirmation_message;
  if (!confirmation || !/success|created|added|onboard/i.test(confirmation)) {
    failures.push(`confirmation_message did not look like success: ${JSON.stringify(confirmation)}`);
  }

  return { failures, initial, final, confirmation };
}

async function main() {
  const startedAt = new Date().toISOString();
  let outcome = { pass: false };
  try {
    await preflight();
    const loginResult = await runLogin();
    const onboardRun = await runOnboard();
    const check = assertOnboardResult(onboardRun);

    outcome = {
      pass: check.failures.length === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      loginResult: { success: loginResult.success, goalReached: loginResult.goalReached },
      testPerson: onboardRun.testPerson,
      resolvedParams: onboardRun.resolvedParams,
      bookend: { initial: check.initial, final: check.final },
      confirmation: check.confirmation,
      failures: check.failures,
    };

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(outcome, null, 2));

    if (check.failures.length) {
      log("FAIL:");
      for (const f of check.failures) log("  -", f);
      log(`Person created (or attempted): ${JSON.stringify(onboardRun.testPerson)}`);
      log(`Full result: ${RESULTS_FILE}`);
      process.exitCode = 1;
      return;
    }

    log("PASS");
    log(`Person created: ${onboardRun.testPerson.first_name} ${onboardRun.testPerson.last_name} (${onboardRun.testPerson.backup_email})`);
    log(`People count: ${check.initial} -> ${check.final}`);
    log(`Full result: ${RESULTS_FILE}`);
  } catch (err) {
    outcome = { pass: false, startedAt, finishedAt: new Date().toISOString(), error: err.message };
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(outcome, null, 2));
    log("FAIL (exception):", err.message);
    process.exitCode = 1;
  }
}

main();
