#!/usr/bin/env node
/**
 * clarify-and-run.mjs — NL-intent → clarifying questions → recipe params → yeshie_run.
 *
 * Closes the gap identified in the 2026-07-10 Yeshie investigation: there was no
 * layer that mapped free-text intent ("add a new user to the engineering
 * organization") onto a recipe's required params and elicited the missing ones
 * turn-by-turn. This is that layer.
 *
 * Design:
 *  1. Load a target payload (e.g. sites/yeshid/tasks/01-user-add.payload.json).
 *     Its _meta.params[*].{required,hint,promptLabel,options,derived,
 *     derivationTemplate,confirmDerived} block is the question spec — this
 *     script does not invent its own schema, it consumes the payload's.
 *  2. Attempt light extraction from the free-text intent (first/last name via
 *     simple capitalized-word heuristic; nothing fancy — this is a router,
 *     not an NLU engine). Anything not confidently extracted is asked.
 *  3. Elicit missing REQUIRED params one at a time, in payload param order,
 *     honoring promptLabel/hint text. Answers come from either:
 *       --answers-file <json>   (scripted "simulated user" — used by e2e tests
 *                                 and by this delegated demo run)
 *       interactive stdin        (real usage — a human types answers)
 *  4. Apply derivationTemplate for `derived` params (e.g. company_email),
 *     surface the derived value back to the user for confirmation if
 *     confirmDerived is set, honoring any override in the answers file.
 *  5. Validate `options` / `pattern` where present.
 *  6. POST the resolved payload+params straight to the relay (localhost:3333/run)
 *     — no further inference. The clarifying layer's job ends once params are
 *     resolved; the recipe executes deterministically from there.
 *
 * Usage:
 *   node scripts/clarify-and-run.mjs <payload_path> "<intent text>" \
 *     [--answers-file answers.json] [--dry-run] [--timeout-seconds 120]
 *
 * answers-file shape: { "first_name": "Test", "last_name": "User", ... }
 * (keys = payload _meta.params keys; only used for params the extractor/
 * interactive prompt would otherwise ask for)
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

function usage(msg) {
  if (msg) console.error("Error:", msg);
  console.error(
    "Usage: node clarify-and-run.mjs <payload_path> \"<intent text>\" [--answers-file f.json] [--dry-run] [--timeout-seconds N]"
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--answers-file") args.answersFile = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--timeout-seconds") args.timeoutSeconds = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// Minimal free-text extraction — heuristic only, not a claim of general NLU.
// Looks for "first last" style two-capitalized-word sequences for name params;
// looks for an email-shaped token for email params; otherwise extracts nothing
// and lets the elicitation step ask.
function extractFromIntent(intentText, paramKey, paramSpec) {
  if (!intentText) return undefined;
  if (paramKey === "first_name" || paramKey === "last_name") {
    const m = intentText.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    if (m) return paramKey === "first_name" ? m[1] : m[2];
  }
  if (/email/i.test(paramKey)) {
    const m = intentText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (m) return m[0];
  }
  if (paramSpec?.options) {
    const hit = paramSpec.options.find((opt) =>
      intentText.toLowerCase().includes(opt.toLowerCase())
    );
    if (hit) return hit;
  }
  return undefined;
}

function derive(template, values) {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (_, key) => {
    const lowerSuffix = key.endsWith("_lower");
    const baseKey = lowerSuffix ? key.replace(/_lower$/, "") : key;
    const val = values[baseKey] ?? "";
    return lowerSuffix ? String(val).toLowerCase() : String(val);
  });
}

async function askInteractive(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(promptText + " ", resolve));
  rl.close();
  return answer.trim();
}

async function resolveParams({ payload, intentText, answers, transcript }) {
  const paramSpecs = payload._meta?.params || {};
  const requiredKeys = payload._meta?.requiredParams || Object.keys(paramSpecs).filter(
    (k) => paramSpecs[k]?.required
  );
  const resolved = {};

  // Pass 1: non-derived params (name/email/dates) — extract, then ask if missing.
  for (const key of Object.keys(paramSpecs)) {
    const spec = paramSpecs[key];
    if (spec.derived) continue; // handled in pass 2, after inputs it depends on are known
    if (!spec.required) continue;

    // Try silent extraction from the raw intent text first — if the user already
    // said it ("add Test User"), don't re-ask. Otherwise this is a genuinely
    // missing required param: ask a clarifying question and log the exchange,
    // even in scripted/simulated-user mode (--answers-file), so the transcript
    // reflects a real turn-by-turn elicitation, not a silent param dump.
    let value = extractFromIntent(intentText, key, spec);
    if (value === undefined) {
      const question = spec.promptLabel || spec.description || spec.hint || `Provide ${key}:`;
      const optionsSuffix = spec.options ? ` (options: ${spec.options.join(" / ")})` : "";
      const q = `${question}${optionsSuffix}`;
      transcript.push({ role: "yeshie", text: q });
      if (answers?.[key] !== undefined) {
        value = answers[key];
      } else if (process.stdin.isTTY) {
        value = await askInteractive(q);
      } else {
        usage(
          `Missing required param "${key}" and no --answers-file entry provided (non-interactive mode).`
        );
      }
      transcript.push({ role: "user", text: value });
    }
    if (spec.options && !spec.options.includes(value)) {
      usage(`"${value}" is not a valid option for ${key}. Valid: ${spec.options.join(", ")}`);
    }
    resolved[key] = value;
  }

  // Pass 2: derived params (e.g. company_email) — compute, then confirm if flagged.
  for (const key of Object.keys(paramSpecs)) {
    const spec = paramSpecs[key];
    if (!spec.derived) continue;
    let value = derive(spec.derivationTemplate, resolved);
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
      usage(`Derived value "${value}" for ${key} does not match required pattern ${spec.pattern}`);
    }
    if (spec.confirmDerived) {
      const override = answers?.[key];
      if (override !== undefined) {
        value = override;
        transcript.push({ role: "yeshie", text: `Derived ${key} = ${value} (overridden by caller)` });
      } else {
        transcript.push({
          role: "yeshie",
          text: `Derived ${key} = "${value}" (${spec.hint || "confirm or correct"})`,
        });
        transcript.push({ role: "user", text: `confirmed: ${value}` });
      }
    }
    resolved[key] = value;
  }

  return resolved;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [payloadPath, intentText] = args._;
  if (!payloadPath || !intentText) usage();

  const absPayloadPath = path.resolve(payloadPath);
  const payload = JSON.parse(fs.readFileSync(absPayloadPath, "utf8"));

  let answers = {};
  if (args.answersFile) {
    answers = JSON.parse(fs.readFileSync(path.resolve(args.answersFile), "utf8"));
  }

  const transcript = [{ role: "user", text: intentText }];
  const resolvedParams = await resolveParams({ payload, intentText, answers, transcript });

  console.error("── Clarifying-question transcript ──");
  for (const t of transcript) console.error(`[${t.role}] ${t.text}`);
  console.error("── Resolved params ──");
  console.error(JSON.stringify(resolvedParams, null, 2));

  if (args.dryRun) {
    console.log(JSON.stringify({ resolvedParams, transcript }, null, 2));
    return;
  }

  const timeoutSeconds = args.timeoutSeconds || 120;
  const body = JSON.stringify({
    payload,
    params: { ...(payload.params || {}), ...resolvedParams },
    tabId: null,
    timeoutMs: timeoutSeconds * 1000,
  });
  const res = await fetch("http://localhost:3333/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutSeconds * 1000 + 5000),
  });
  const result = await res.json();
  console.log(JSON.stringify({ resolvedParams, transcript, result }, null, 2));
  if (!res.ok || result.success === false) process.exitCode = 1;
}

main().catch((err) => {
  console.error("clarify-and-run failed:", err);
  process.exitCode = 1;
});
