#!/usr/bin/env node
// sw-guard — find Yeshie extension service workers that Chrome is holding
// paused at start, resume them, and raise an alarm.
//
//   node scripts/sw-guard.mjs            # check, resume paused workers, write state
//   node scripts/sw-guard.mjs --dry-run  # check and report only
//
// Why this exists (2026-09-13): both profiles' Yeshie workers stopped
// connecting to the relay and did not come back. The cause was a CDP client on
// Chrome's debug port (chrome-devtools-mcp, through Puppeteer). It
// auto-attaches to every new target with waitForDebuggerOnStart:true, so Chrome
// holds each new worker before its first line of script until that client
// sends Runtime.runIfWaitingForDebugger. When the client is stalled (the Mac
// was swapping at ~97%), the resume never arrives. An MV3 worker that restarts
// then stays frozen with no `chrome` bindings. A runIfWaitingForDebugger from
// any other client releases it, and that is what this guard sends.
// The prevention is ~/Projects/_estate/bin/chrome-devtools-mcp-nopause, a CDP
// proxy that stops the MCP from pausing targets. This guard catches any other
// client that does the same thing. ESTATE.md changelog 2026-09-13 has the evidence.
//
// A running worker answers `typeof chrome` with "object". A worker paused at
// start answers "undefined". A worker that answers nothing within the timeout
// is also resumed, because that is how the second profile presented on
// 2026-09-13 and a resume brought it back. runIfWaitingForDebugger on a
// running worker is a no-op.
//
// Every resume is reported to soma-errors (POST /api/errors, kind "system"),
// which files one deduplicated WORKQUEUE ticket, because a resume means some
// client paused a worker and did not release it. That client is the bug.
//
// Env: YESHIE_EXT_ID (default oicficnhfjffhcahjpeibmeofbinlbfp),
//      CDP_URL (default http://127.0.0.1:9222),
//      YESHIE_RELAY_URL (default http://127.0.0.1:3333),
//      SOMA_ERROR_SERVICE_URL (default http://localhost:4300),
//      YESHIE_SW_GUARD_STATE (default ~/Projects/SOMA/state/yeshie-sw-guard.json).
// Exit codes: 0 checked (whether or not it resumed anything) · 1 guard error.
// An unreachable debug port is exit 0 with cdp:false in the state file,
// because a closed debug Chrome is a normal state, not a guard failure.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXT = process.env.YESHIE_EXT_ID || 'oicficnhfjffhcahjpeibmeofbinlbfp';
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const RELAY = process.env.YESHIE_RELAY_URL || 'http://127.0.0.1:3333';
const ERRORS = (process.env.SOMA_ERROR_SERVICE_URL || 'http://localhost:4300').replace(/\/+$/, '');
const STATE = process.env.YESHIE_SW_GUARD_STATE
  || path.join(os.homedir(), 'Projects/SOMA/state/yeshie-sw-guard.json');
const DRY = process.argv.includes('--dry-run');
const TIMEOUT_MS = 6000;

const now = () => new Date().toISOString();
const log = (...a) => console.log(now(), '[sw-guard]', ...a);

function readPrev() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}

function writeState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  const tmp = `${STATE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, STATE);
}

async function relayProfiles() {
  try {
    const r = await fetch(`${RELAY}/instances`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    return (d.instances || []).map(i => i.profile);
  } catch {
    return null;
  }
}

// Never throws: a broken alarm path must not stop the resume.
async function alarm(workers) {
  try {
    const r = await fetch(`${ERRORS}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        app: 'yeshie',
        kind: 'system',
        route: 'sw-guard',
        action: 'resume-paused-service-worker',
        message: 'A CDP client paused a Yeshie extension service worker at start and did not resume it; sw-guard resumed it. Find the client on :9222 that auto-attaches with waitForDebuggerOnStart.',
        extra: { workers },
      }),
    });
    const j = await r.json().catch(() => ({}));
    log('alarm filed', r.status, j.ticketId || '');
  } catch (e) {
    log('alarm failed:', e.message);
  }
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waits = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    const w = d.id && waits.get(d.id);
    if (w) { waits.delete(d.id); w(d); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const i = ++id;
    waits.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (waits.delete(i)) resolve({ timeout: true }); }, TIMEOUT_MS);
  });
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return { ws, send, opened };
}

async function main() {
  const prev = readPrev();
  const state = {
    ts: now(),
    cdp: false,
    workers: [],
    relayProfiles: null,
    resumedThisRun: 0,
    resumedTotal: prev.resumedTotal || 0,
    lastResumedAt: prev.lastResumedAt || null,
    lastResumed: prev.lastResumed || null,
  };

  let ver;
  try {
    ver = await (await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(4000) })).json();
  } catch {
    state.relayProfiles = await relayProfiles();
    writeState(state);
    return;
  }
  state.cdp = true;

  const { ws, send, opened } = connect(ver.webSocketDebuggerUrl);
  await opened;
  try {
    const { result } = await send('Target.getTargets');
    const sws = (result?.targetInfos || []).filter(
      t => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${EXT}/`));
    for (const t of sws) {
      const w = { targetId: t.targetId, context: t.browserContextId, status: 'unknown', action: 'none' };
      state.workers.push(w);
      const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
      const sid = a.result?.sessionId;
      if (!sid) { w.status = 'attach-failed'; continue; }
      const r = await send('Runtime.evaluate', { expression: 'typeof chrome' }, sid);
      const v = r.result?.result?.value;
      w.status = r.timeout ? 'unresponsive' : v === 'object' ? 'running' : v === 'undefined' ? 'paused-at-start' : `eval:${v}`;
      if (w.status !== 'running' && !DRY) {
        const rr = await send('Runtime.runIfWaitingForDebugger', {}, sid);
        w.action = rr.timeout ? 'resume-timeout' : 'resumed';
        state.resumedThisRun++;
      }
      await send('Target.detachFromTarget', { sessionId: sid });
    }
  } finally {
    ws.close();
  }

  state.relayProfiles = await relayProfiles();
  if (state.resumedThisRun) {
    state.resumedTotal += state.resumedThisRun;
    state.lastResumedAt = state.ts;
    state.lastResumed = state.workers.filter(w => w.action !== 'none');
    log(`RESUMED ${state.resumedThisRun} Yeshie worker(s):`, JSON.stringify(state.lastResumed),
      'relay profiles:', JSON.stringify(state.relayProfiles));
    await alarm(state.lastResumed);
  } else if (state.workers.some(w => w.status !== 'running')) {
    log('non-running worker(s), dry run:', JSON.stringify(state.workers));
  }
  writeState(state);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(now(), '[sw-guard] error', err?.stack || err);
  process.exit(1);
});
