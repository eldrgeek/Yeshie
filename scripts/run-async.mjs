#!/usr/bin/env node
/**
 * Async (fire-and-forget) Yeshie recipe runner.
 *
 * Submits a payload to the relay's POST /run/async, gets a job id back
 * immediately, then polls GET /run/result/:id until the ChainResult settles.
 * This is the escape hatch for recipes whose run exceeds the ~60s synchronous
 * MCP cap — e.g. chat.deepseek.com with DeepThink reasoning on (30–60s of
 * chain-of-thought before the answer).
 *
 * USAGE:
 *   # Poll to completion (default). Path is relative to sites/ or absolute.
 *   node scripts/run-async.mjs chat.deepseek.com/tasks/01-submit-prompt.payload.json
 *
 *   # Override recipe params (client-side {{param}} interpolation):
 *   node scripts/run-async.mjs claude.ai/tasks/02-open-project.payload.json \
 *        --param project_name="Yeshie Songs"
 *
 *   # Fire and return the id without waiting (true fire-and-forget):
 *   node scripts/run-async.mjs <recipe> --submit-only
 *
 *   # Poll an already-submitted job:
 *   node scripts/run-async.mjs --poll <id>
 *
 * FLAGS:
 *   --param k=v        set a recipe param (repeatable)
 *   --submit-only      submit, print the id as JSON, exit 0 (don't poll)
 *   --poll <id>        skip submit; just poll this id to completion
 *   --timeout-ms N     relay-side run timeout (default 300000 = 5 min)
 *   --poll-ms N        client poll interval (default 3000)
 *   --max-wait-ms N    client give-up wall clock (default 360000 = 6 min)
 *   --json             print only the final ChainResult as JSON (quiet progress)
 *
 * ENV:
 *   YESHIE_RELAY       relay base URL (default http://localhost:3333)
 */
import fs from 'node:fs';
import path from 'node:path';

const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const ROOT = path.join(process.env.HOME, 'Projects/yeshie/sites');
const args = process.argv.slice(2);

const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--param' && args[i + 1]) {
    const eq = args[i + 1].indexOf('=');
    if (eq > 0) params[args[i + 1].slice(0, eq)] = args[i + 1].slice(eq + 1);
  }
}
const quiet = flag('json');
const log = (...a) => { if (!quiet) console.error(...a); };

const interpolate = (obj, p) => {
  if (typeof obj === 'string') return obj.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in p ? p[k] : `{{${k}}}`));
  if (Array.isArray(obj)) return obj.map((o) => interpolate(o, p));
  if (obj && typeof obj === 'object') { const r = {}; for (const k of Object.keys(obj)) r[k] = interpolate(obj[k], p); return r; }
  return obj;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(recipeArg) {
  const file = path.isAbsolute(recipeArg) ? recipeArg : path.join(ROOT, recipeArg);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Resolve fully client-side: the payload's own `params` block supplies defaults
  // (e.g. base_url), CLI --param values override. Any {{token}} left unmatched
  // would break the step (navigate with no url), so merge before interpolating.
  const merged = { ...(raw.params || {}), ...params };
  const payload = interpolate(raw, merged);
  const timeoutMs = parseInt(opt('timeout-ms', '300000'), 10);
  const res = await fetch(`${RELAY}/run/async`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, timeoutMs }),
  });
  const data = await res.json();
  if (res.status !== 202 || !data.id) throw new Error(`submit failed (HTTP ${res.status}): ${JSON.stringify(data)}`);
  return data.id;
}

async function poll(id) {
  const pollMs = parseInt(opt('poll-ms', '3000'), 10);
  const maxWaitMs = parseInt(opt('max-wait-ms', '360000'), 10);
  const start = Date.now();
  let lastStep = '';
  for (;;) {
    const res = await fetch(`${RELAY}/run/result/${encodeURIComponent(id)}`);
    if (res.status === 404) throw new Error(`run ${id} not found (expired or bad id)`);
    const run = await res.json();
    if (run.status === 'running') {
      const step = run.progress ? `step ${run.progress.stepIndex + 1}/${run.progress.totalSteps} (${run.progress.action})` : 'running…';
      if (step !== lastStep) { log(`[${Math.round((Date.now() - start) / 1000)}s] ${step}`); lastStep = step; }
      if (Date.now() - start > maxWaitMs) throw new Error(`client gave up after ${maxWaitMs}ms (job still running server-side; poll again with --poll ${id})`);
      await sleep(pollMs);
      continue;
    }
    return run; // done | error
  }
}

(async () => {
  const pollId = opt('poll', null);
  let id = pollId;
  if (!id) {
    const recipe = args.find((a) => !a.startsWith('--') && (a.endsWith('.json') || a.includes('/')));
    if (!recipe) { console.error('ERROR: pass a recipe path (relative to sites/ or absolute), or --poll <id>'); process.exit(2); }
    id = await submit(recipe);
    log(`submitted → id=${id}`);
    if (flag('submit-only')) { console.log(JSON.stringify({ id, status: 'running' })); process.exit(0); }
  }
  const run = await poll(id);
  if (quiet) {
    console.log(JSON.stringify(run.result ?? { status: run.status, error: run.error }, null, 2));
  } else {
    const r = run.result || {};
    const steps = (r.stepResults || []).map((s) => `${s.stepId}:${s.status}`).join(' ');
    log(`\n=== ${run.status.toUpperCase()} ===`);
    if (steps) log('steps:', steps);
    if (r.buffer) log('buffer:', JSON.stringify(r.buffer, null, 2));
    if (run.error) log('error:', run.error);
    console.log(JSON.stringify(run.result ?? { status: run.status, error: run.error }));
  }
  const green = run.status === 'done' && (run.result?.success !== false) && (run.result?.goalReached !== false);
  process.exit(green ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
