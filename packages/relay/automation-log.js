// Automation action log — one JSONL line per executed Yeshie step.
// Authored 2026-09-17 by a Claude worker (Opus 5) for Mike Wolf's 2026-09-16 ruling:
// human active time = Screenpipe activity minus automation windows, so automation
// logs its own actions. Same file and format as mac-controller/automation_log.py:
//
//   ~/Library/Logs/soma-automation/actions.jsonl
//   {"ts","actor":"yeshie","kind":"step:<action>","target":"<site host>",
//    "duration_ms","session_id"?,"pid","ok"}
//
// Only the step kind and the site host are logged: never selectors, values,
// typed text, or URLs with paths or query strings.
// Failure-safe: every function swallows its own errors. SOMA_AUTOMATION_LOG=0
// disables; SOMA_AUTOMATION_LOG_DIR overrides the directory (tests use it).
import { appendFileSync, mkdirSync, statSync, readFileSync, renameSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const MAX_BYTES = 5 * 1024 * 1024;
const KEEP_ROTATED = 30;

export function logDir() {
  return process.env.SOMA_AUTOMATION_LOG_DIR || join(homedir(), 'Library', 'Logs', 'soma-automation');
}

function enabled() {
  return !['0', 'false', 'off', 'no'].includes(String(process.env.SOMA_AUTOMATION_LOG ?? '1').toLowerCase());
}

// Reduce a URL, base_url, or bare domain to a host. Anything else becomes undefined.
export function hostOf(value) {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    const host = u.hostname.toLowerCase();
    return (/^[a-z0-9.-]+$/.test(host) && host.includes('.')) || host === 'localhost' ? host : undefined;
  } catch {
    return undefined;
  }
}

function cleanKind(action) {
  return `step:${String(action || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32) || 'unknown'}`;
}

// Turn a ChainResult into log lines. Steps run sequentially, so each step's
// start is the chain start plus the durations of the steps before it.
export function linesForChain(result, settledAtMs = Date.now()) {
  const steps = (result && Array.isArray(result.stepResults)) ? result.stepResults : [];
  const total = Number(result && result.durationMs) || steps.reduce((s, r) => s + (Number(r?.durationMs) || 0), 0);
  let cursor = settledAtMs - total;
  const siteHost = hostOf(result && result.site);
  const sessionId = process.env.SOMA_SESSION_ID || undefined;
  const lines = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const dur = Math.max(0, Math.round(Number(step.durationMs) || 0));
    const start = cursor;
    cursor += dur;
    if (step.status === 'skipped') continue;
    const line = {
      ts: new Date(start).toISOString(),
      actor: 'yeshie',
      kind: cleanKind(step.action),
      duration_ms: dur,
      pid: process.pid,
      ok: step.status === 'ok',
    };
    const target = hostOf(step.url) || siteHost;
    if (target) line.target = target;
    if (sessionId) line.session_id = sessionId;
    lines.push(line);
  }
  return lines;
}

function rotateIfNeeded(path) {
  if (!existsSync(path)) return;
  const size = statSync(path).size;
  let firstDay;
  try {
    firstDay = (JSON.parse(readFileSync(path, 'utf8').split('\n', 1)[0] || '{}').ts || '').slice(0, 10) || undefined;
  } catch {
    firstDay = undefined;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (firstDay === today && size < MAX_BYTES) return;
  const dir = logDir();
  const stamp = firstDay || today;
  let target = join(dir, `actions-${stamp}.jsonl`);
  for (let n = 1; existsSync(target); n++) target = join(dir, `actions-${stamp}-${n}.jsonl`);
  renameSync(path, target);
  const rotated = readdirSync(dir).filter((f) => f.startsWith('actions-') && f.endsWith('.jsonl')).sort();
  for (const old of rotated.slice(0, -KEEP_ROTATED)) {
    try { unlinkSync(join(dir, old)); } catch { /* ignore */ }
  }
}

export function writeLines(lines) {
  try {
    if (!enabled() || !lines || !lines.length) return 0;
    const dir = logDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'actions.jsonl');
    rotateIfNeeded(path);
    appendFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { mode: 0o600 });
    return lines.length;
  } catch {
    return 0;
  }
}

// Called by the relay when a chain settles (chain_result / chain_error).
export function logChainSteps(result, settledAtMs = Date.now()) {
  try {
    return writeLines(linesForChain(result, settledAtMs));
  } catch {
    return 0;
  }
}
