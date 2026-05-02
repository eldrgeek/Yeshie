// Yeshie Local Relay Server
// Bridges cc-bridge MCP tools ↔ Chrome extension background worker
// Port 3333

import { createServer } from 'http';
import { Server } from 'socket.io';
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';

// ====================== Conversation Logger ======================

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOBS_STATE_FILE = join(__dirname, 'jobs-state.json');
const LOGS_DIR = join(__dirname, '..', '..', 'logs', 'conversations');

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function getSessionLogPath() {
  // One file per day, append all conversations
  const date = new Date().toISOString().slice(0, 10);
  return join(LOGS_DIR, `${date}.jsonl`);
}

function logConversation(entry) {
  try {
    ensureLogsDir();
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
    appendFileSync(getSessionLogPath(), line);
  } catch (e) {
    console.warn('[relay] Failed to log conversation:', e.message);
  }
}

// ====================== osascript notifier ======================

/**
 * Run osascript on the host to show a macOS notification.
 * Retries up to `retries` times with a 2s delay between attempts.
 * Returns true if a dispatch succeeded, false if all attempts failed.
 */
async function runOsascript(message, title = 'Yeshie', retries = 3) {
  const safeMsg = String(message).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeTitle = String(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `display notification "${safeMsg}" with title "${safeTitle}"`;
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise((resolve, reject) => {
        execFile('osascript', ['-e', script], { timeout: 5000 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      console.log(`[relay] notify dispatched (attempt ${i + 1}): ${message}`);
      return true;
    } catch (e) {
      console.warn(`[relay] notify attempt ${i + 1} failed: ${e.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.error(`[relay] notify failed after ${retries} attempts: ${message}`);
  return false;
}

// ====================== Server factory ======================

export function createRelay(port = 3333) {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  // Pending calls: commandId → { resolve, reject, timer }
  const pending = new Map();

  // HUD ask store
  const hudAsks = new Map();

  // Best-effort: surface the HUD panel (hud.py listens on :3334). Used whenever
  // a new job appears or a hud:ask is fired, so Mike actually sees the thing.
  function showHudPanel() {
    fetch('http://localhost:3334/show', { method: 'POST' }).catch(() => {});
  }

  // Track connected extensions — last registered is primary; others are fallbacks
  let extensionSocket = null;
  const extensionSockets = new Set();

  // Chat state (per-instance)
  let chatQueue = [];
  let pendingListener = null;            // { res, timer }
  let pendingResponders = new Map();     // chatId → { res, timer }
  let suggestionQueue = [];

  // ── HUD Job Tracking ──────────────────────────────────────────
  const jobMap = new Map();
  const DONE_DISMISS_MS = 10 * 60 * 1000;
  const ACK_TIMEOUT_MS  =  3 * 60 * 1000;

  function makeJob(job_id, session_title, description) {
    return { job_id, session_title, description, status: 'running',
             message: '', started_at: Date.now(), updated_at: Date.now(),
             ack_timer: null, dismiss_timer: null, snooze_timer: null };
  }

  function broadcastHud() {
    const jobs = [...jobMap.values()].map(j => ({
      job_id: j.job_id, session_title: j.session_title, description: j.description,
      status: j.status, message: j.message, started_at: j.started_at, updated_at: j.updated_at,
    }));
    io.emit('hud_update', { jobs });
  }

  function dismissJob(job_id) {
    const job = jobMap.get(job_id);
    if (!job) return;
    if (job.ack_timer)     clearTimeout(job.ack_timer);
    if (job.dismiss_timer) clearTimeout(job.dismiss_timer);
    if (job.snooze_timer)  clearTimeout(job.snooze_timer);
    jobMap.delete(job_id);
    broadcastHud();
  }

  function scheduleAutoDismiss(job_id) {
    const job = jobMap.get(job_id);
    if (!job) return;
    if (job.dismiss_timer) clearTimeout(job.dismiss_timer);
    job.dismiss_timer = setTimeout(() => dismissJob(job_id), DONE_DISMISS_MS);
  }

  function fireAlert(job_id, session_title, message) {
    const alertScript = join(__dirname, '..', '..', 'scripts', 'alert.sh');
    const child = spawn('bash', [alertScript, session_title, message, job_id],
                        { detached: true, stdio: 'ignore' });
    child.unref();
    console.log(`[relay] alert fired for job ${job_id}`);
    const job = jobMap.get(job_id);
    if (job) {
      if (job.snooze_timer) clearTimeout(job.snooze_timer);
      job.snooze_timer = setTimeout(() => {
        const j = jobMap.get(job_id);
        if (j && (j.status === 'blocked' || j.status === 'notified'))
          fireAlert(job_id, j.session_title, j.message);
      }, 5 * 60 * 1000);
    }
  }
  // ── end HUD Job Tracking ──────────────────────────────────────

  let lastListenerActiveAt = 0;          // timestamp of last listener activity (grace period for status)

  // Controller (C) channel — buffered responses and heartbeats for programmatic callers
  const controllerResponses = new Map();  // tabId → [{ response, chatId, ts }]
  const controllerHeartbeats = new Map(); // tabId → { status, step, ts }
  const controllerAwaiters = [];          // [{ tabId, res, timer }]
  const chatIdToTabId = new Map();        // chatId → tabId (retained after pendingResponder consumed, for second respond calls)

  // Job tracking — subprocesses report status here, Dispatch polls on each wake-up
  function loadJobsState() {
    try {
      if (existsSync(JOBS_STATE_FILE)) {
        const data = JSON.parse(readFileSync(JOBS_STATE_FILE, 'utf8'));
        const map = new Map(Object.entries(data));
        console.log(`[relay] Loaded ${map.size} job(s) from persisted state`);
        return map;
      }
    } catch (e) {
      console.warn('[relay] Failed to load jobs state:', e.message);
    }
    return new Map();
  }
  function persistJobsState() {
    try {
      const obj = Object.fromEntries(jobs);
      writeFileSync(JOBS_STATE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      console.warn('[relay] Failed to persist jobs state:', e.message);
    }
  }
  const jobs = loadJobsState();           // jobId → { id, title, status, step, result, error, createdAt, updatedAt }
  const JOB_TTL_MS = 30 * 60 * 1000;     // 30 minutes — auto-expire stale jobs

  // ── Smart notification (idle detection + countdown) ─────────────────────────
  const notifyTimers = new Map();   // jobId → intervalId
  const COUNTDOWN_S  = 30;          // auto-fire after this many seconds
  const IDLE_FIRE_S  = 10;          // also auto-fire if user idle >= this long
  const AX_INJECT    = '/Users/mikewolf/Projects/yeshie/scripts/yeshie-inject';

  function getIdleSecondsAsync() {
    return new Promise(resolve => {
      execFile('bash', ['-c', "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000)}'"],
        { timeout: 3000 }, (err, stdout) => resolve(err ? 0 : (parseInt(stdout.trim()) || 0)));
    });
  }

  function getFrontmostAppAsync() {
    return new Promise(resolve => {
      execFile('osascript',
        ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'],
        { timeout: 3000 }, (err, stdout) => resolve(err ? '' : stdout.trim()));
    });
  }

  async function isCdBusy() {
    const [idle, app] = await Promise.all([getIdleSecondsAsync(), getFrontmostAppAsync()]);
    return app.toLowerCase().includes('claude') && idle < IDLE_FIRE_S;
  }

  function clearNotifyTimer(jobId) {
    const t = notifyTimers.get(jobId);
    if (t !== undefined) { clearInterval(t); notifyTimers.delete(jobId); }
  }

  function fireInject(job) {
    clearNotifyTimer(job.id);
    const pyArgs = ['--session', job.session_title, '--save-restore', job.notify_message];
    console.log(`[relay] firing inject: job=${job.id} session="${job.session_title}"`);
    execFile(AX_INJECT, pyArgs, { timeout: 15000 }, (err, stdout, stderr) => {
      const cur = jobs.get(job.id) || job;
      let newStatus;
      if (err) {
        console.warn(`[relay] inject failed: ${err.message}\n${stderr}`);
        newStatus = 'needs_action';
      } else {
        console.log(`[relay] inject ok: ${stdout.trim()}`);
        newStatus = 'done';
      }
      const upd = { ...cur, status: newStatus, countdown_start: null, countdown_seconds: null, updatedAt: Date.now() };
      jobs.set(job.id, upd);
      persistJobsState();
      io.emit('job_update', upd);
      if (newStatus === 'needs_action') {
        showHudPanel();
      }
    });
  }

  function scheduleNotify(job) {
    clearNotifyTimer(job.id);
    const countdown_start = Date.now();
    const pending = { ...job, status: 'notify_pending', countdown_start, countdown_seconds: COUNTDOWN_S, updatedAt: countdown_start };
    jobs.set(job.id, pending);
    persistJobsState();
    io.emit('job_update', pending);
    showHudPanel();

    const iid = setInterval(async () => {
      const cur = jobs.get(job.id);
      if (!cur || cur.status !== 'notify_pending') { clearInterval(iid); notifyTimers.delete(job.id); return; }
      const elapsed_s = (Date.now() - countdown_start) / 1000;
      const idle      = await getIdleSecondsAsync();
      if (idle >= IDLE_FIRE_S || elapsed_s >= COUNTDOWN_S) {
        clearInterval(iid);
        notifyTimers.delete(job.id);
        fireInject(cur);
      }
    }, 2000);
    notifyTimers.set(job.id, iid);
  }

  async function scheduleOrInject(job) {
    if (!job.notify_message || !job.session_title) {
      showHudPanel();
      return;
    }
    if (await isCdBusy()) {
      scheduleNotify(job);
    } else {
      fireInject(job);
    }
  }

  function resetChatState() {
    if (pendingListener) {
      clearTimeout(pendingListener.timer);
      try { jsonReply(pendingListener.res, 200, { type: 'shutdown' }); } catch {}
      pendingListener = null;
    }
    for (const [, v] of pendingResponders) {
      clearTimeout(v.timer);
      try { jsonReply(v.res, 200, { type: 'shutdown' }); } catch {}
    }
    pendingResponders = new Map();
    chatQueue = [];
    suggestionQueue = [];
    controllerResponses.clear();
    controllerHeartbeats.clear();
    for (const aw of controllerAwaiters) clearTimeout(aw.timer);
    controllerAwaiters.length = 0;
    jobs.clear();
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  function jsonReply(res, status, obj) {
    if (res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  function resolveListener(msg) {
    if (!pendingListener) return false;
    clearTimeout(pendingListener.timer);
    const { res } = pendingListener;
    pendingListener = null;
    jsonReply(res, 200, msg);
    return true;
  }

  function genMsgId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Socket.IO connections
  io.on('connection', (socket) => {
    const who = socket.handshake.auth?.role || 'unknown';
    console.log(`[relay] connected: ${who} (${socket.id})`);

    if (who === 'extension') {
      extensionSockets.add(socket);
      extensionSocket = socket;
      console.log('[relay] extension registered');

      socket.on('disconnect', () => {
        extensionSockets.delete(socket);
        console.log('[relay] extension disconnected');
        if (extensionSocket === socket) {
          // Fall back to another connected extension socket if one exists
          extensionSocket = extensionSockets.size > 0
            ? [...extensionSockets][extensionSockets.size - 1]
            : null;
          if (extensionSocket) {
            console.log('[relay] fell back to previous extension socket');
          } else if (pending.size > 0) {
            // No fallback — fail in-flight runs immediately
            console.log(`[relay] rejecting ${pending.size} pending run(s) due to extension disconnect`);
            for (const [, p] of pending) {
              clearTimeout(p.timer);
              p.reject(new Error('Extension disconnected mid-run'));
            }
            pending.clear();
          }
        }
      });

      socket.on('chain_result', ({ commandId, result }) => {
        const p = pending.get(commandId);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(commandId);
        p.resolve(result);
      });

      socket.on('chain_error', ({ commandId, error, result }) => {
        const p = pending.get(commandId);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(commandId);
        if (result) { p.resolve(result); return; }
        p.reject(new Error(error));
      });

      socket.on('status_update', ({ commandId, stepIndex, totalSteps, action }) => {
        const p = pending.get(commandId);
        if (p) p.lastStatus = { stepIndex, totalSteps, action };
      });

      // Case 1: chain `notify` step — extension emits this, relay fires osascript
      socket.on('notify', ({ message, title }) => {
        runOsascript(message || 'Done', title || 'Yeshie');
      });
    }

    if (who === 'client') {
      socket.on('skill_run', ({ commandId, payload, params, tabId }, ack) => {
        if (!extensionSocket) {
          ack({ error: 'Extension not connected' });
          return;
        }
        console.log(`[relay] skill_run ${commandId} → extension`);
        extensionSocket.emit('skill_run', { commandId, payload, params, tabId });
        ack({ queued: true, commandId });
      });

      socket.on('get_status', ({ commandId }, ack) => {
        const p = pending.get(commandId);
        ack(p ? { status: 'running', ...p.lastStatus } : { status: 'not_found' });
      });

      socket.on('extension_status', (_, ack) => {
        ack({ connected: !!extensionSocket, id: extensionSocket?.id || null });
      });
    }

    // Any connected socket (regardless of role) may inject a chat message into
    // a specific tab's side-panel conversation for testing and automation.
    // The relay forwards inject_chat to the extension, which surfaces it in the
    // correct tab's conversation and routes it through the normal /chat flow.
    socket.on('inject_chat', ({ tabId, message }) => {
      if (!tabId || !message) {
        socket.emit('inject_ack', { ok: false, error: 'tabId and message required' });
        return;
      }
      if (!extensionSocket) {
        socket.emit('inject_ack', { ok: false, error: 'Extension not connected' });
        return;
      }
      logConversation({ event: 'injected_message', tabId, message });
      extensionSocket.emit('inject_chat', { tabId, message });
      socket.emit('inject_ack', { ok: true });
    });
  });

  // HTTP handler
  httpServer.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // Let Socket.IO/engine.io handle its own paths
    if (path.startsWith("/socket.io")) return;

    // --- Auth flow observability log ---
    // In-memory ring buffer for auth flow events from extension
    if (!global.__authLog) global.__authLog = [];
    const authLog = global.__authLog;

    if (path === '/log' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const entry = { ...body, receivedAt: new Date().toISOString() };
      authLog.push(entry);
      if (authLog.length > 200) authLog.shift();
      console.log('[log]', JSON.stringify(entry));
      jsonReply(res, 200, { ok: true });
      return;
    }

    if (path === '/log' && req.method === 'GET') {
      jsonReply(res, 200, authLog);
      return;
    }

    // --- Existing endpoints ---

    if (path === '/status' && req.method === 'GET') {
      jsonReply(res, 200, { ok: true, extensionConnected: !!extensionSocket, pending: pending.size });
      return;
    }

    if (path === '/run' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { payload, params, tabId, timeoutMs = 120_000 } = body;
      if (!extensionSocket) {
        jsonReply(res, 503, { error: 'Extension not connected' });
        return;
      }
      const commandId = Math.random().toString(36).slice(2) + Date.now();
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(commandId);
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          }, timeoutMs);
          pending.set(commandId, { resolve, reject, timer, lastStatus: null });
          extensionSocket.emit('skill_run', { commandId, payload, params, tabId });
          console.log(`[relay] HTTP skill_run ${commandId}`);
        });
        jsonReply(res, 200, result);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }


    // --- Tab management endpoints ---

    if (path === '/tabs/list' && req.method === 'GET') {
      if (!extensionSocket) { jsonReply(res, 503, { error: 'Extension not connected' }); return; }
      try {
        const tabs = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for list_tabs')), 10_000);
          extensionSocket.emit('list_tabs', (result) => {
            clearTimeout(timer);
            resolve(result);
          });
        });
        jsonReply(res, 200, tabs);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    if (path === '/tabs/open' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { url } = body;
      if (!url) { jsonReply(res, 400, { error: 'url required' }); return; }
      if (!extensionSocket) { jsonReply(res, 503, { error: 'Extension not connected' }); return; }
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for open_tab')), 20_000);
          extensionSocket.emit('open_tab', { url }, (result) => {
            clearTimeout(timer);
            if (result?.ok === false) reject(new Error(result.error || 'open_tab failed'));
            else resolve(result);
          });
        });
        jsonReply(res, 200, result);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    if (path === '/tabs/refresh' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { tabId } = body;
      if (!tabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }
      if (!extensionSocket) { jsonReply(res, 503, { error: 'Extension not connected' }); return; }
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for refresh_tab')), 10_000);
          extensionSocket.emit('refresh_tab', { tabId }, (result) => {
            clearTimeout(timer);
            if (result?.ok === false) reject(new Error(result.error || 'refresh_tab failed'));
            else resolve(result);
          });
        });
        jsonReply(res, 200, result);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    if (path === '/tabs/navigate' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { tabId, url } = body;
      if (!tabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }
      if (!url) { jsonReply(res, 400, { error: 'url required' }); return; }
      if (!extensionSocket) { jsonReply(res, 503, { error: 'Extension not connected' }); return; }
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for navigate_tab')), 20_000);
          extensionSocket.emit('navigate_tab', { tabId, url }, (result) => {
            clearTimeout(timer);
            if (result?.ok === false) reject(new Error(result.error || 'navigate_tab failed'));
            else resolve(result);
          });
        });
        jsonReply(res, 200, result);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    if (path === '/tabs/close' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { tabId } = body;
      if (!tabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }
      if (!extensionSocket) { jsonReply(res, 503, { error: 'Extension not connected' }); return; }
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for close_tab')), 10_000);
          extensionSocket.emit('close_tab', { tabId }, (result) => {
            clearTimeout(timer);
            if (result?.ok === false) reject(new Error(result.error || 'close_tab failed'));
            else resolve(result);
          });
        });
        jsonReply(res, 200, result);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    if (path === '/tabs/activate' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { tabId } = body;
      if (!tabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }
      if (!extensionSocket) { jsonReply(res, 503, { error: 'Extension not connected' }); return; }
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for activate_tab')), 10_000);
          extensionSocket.emit('activate_tab', { tabId }, (result) => {
            clearTimeout(timer);
            if (result?.ok === false) reject(new Error(result.error || 'activate_tab failed'));
            else resolve(result);
          });
        });
        jsonReply(res, 200, result);
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    // --- Notify endpoint (Case 2/3: called from bash or cc-bridge) ---

    if (path === '/notify' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { message, title } = body;
      if (!message) { jsonReply(res, 400, { error: 'message required' }); return; }
      const ok = await runOsascript(message, title || 'Yeshie');
      jsonReply(res, ok ? 200 : 500, { ok, message });
      return;
    }

    // ── HUD panel ──────────────────────────────────────────────────────────────


    // ── HUD ask / respond (human-in-the-loop confirm/failed/partial) ─────────
    if (path === '/hud/ask' && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const { message, timeout } = JSON.parse(body);
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          hudAsks.set(id, { id, message, response: null, createdAt: Date.now() });
          io.emit('hud:ask', { id, message });
          showHudPanel();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    const hudRespM = path.match(/^\/hud\/response\/([^/]+)$/);
    if (hudRespM && req.method === 'GET') {
      const id = hudRespM[1];
      const ask = hudAsks.get(id);
      if (!ask) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (ask.response === null) {
        res.end(JSON.stringify({ status: 'pending' }));
      } else {
        res.end(JSON.stringify({ status: 'answered', response: ask.response }));
      }
      return;
    }

    if (hudRespM && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        const id = hudRespM[1];
        const ask = hudAsks.get(id);
        if (!ask) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
        try {
          const { response } = JSON.parse(body);
          ask.response = response;
          io.emit('hud:answered', { id, response });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (path === '/hud' && req.method === 'GET') {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Yeshie HUD</title>
<style>
:root{--hud-scale:1}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#1a1a1a;color:#e0e0e0;font-size:calc(12px * var(--hud-scale));overflow:hidden;height:100vh;display:flex;flex-direction:column;transform-origin:top left;transform:scale(var(--hud-scale));width:calc(100% / var(--hud-scale));height:calc(100vh / var(--hud-scale))}
#header{padding:8px 12px;background:#111;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
#header h1{font-size:13px;font-weight:600;color:#aaa;letter-spacing:.5px}
#header span{font-size:10px;color:#555}
#jobs{flex:1;overflow-y:auto;padding:8px}
.empty{color:#555;text-align:center;padding:40px;font-size:11px}
.job{background:#242424;border-radius:6px;padding:8px 10px;margin-bottom:6px;border-left:3px solid #444;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start}
.job.running{border-color:#3b82f6}
.job.done,.job.completed{border-color:#3fb950}
.job.error,.job.failed{border-color:#f85149}
.job.blocked{border-color:#d29922}
.job.pending{border-color:#555}
.job.notify_pending{border-color:#8b5cf6}
.job.needs_action{border-color:#f97316}
.job-status.needs_action{color:#f97316}
.btn-copy{background:#f97316;color:#fff}.btn-copy:hover{background:#ea6c10}
.job-title{font-weight:500;font-size:12px;white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:1.25;min-width:0}
.job-meta{font-size:10px;color:#777;margin-top:2px}
.job-step{font-size:10px;color:#666;margin-top:3px;font-style:italic}
.job-progress-wrap{height:4px;background:#333;border-radius:2px;margin-top:5px;overflow:hidden;max-width:200px}
.job-progress-bar{height:100%;background:#3b82f6;border-radius:2px;transition:width .3s ease}
.job-status{font-size:10px;text-align:right;font-weight:600;align-self:start;white-space:nowrap;flex-shrink:0}
.job-status.running{color:#3b82f6}
.job-status.pending{color:#666}
.job-status.done,.job-status.completed{color:#3fb950}
.job-status.error,.job-status.failed{color:#f85149}
.job-status.blocked{color:#d29922}
.job-status.notify_pending{color:#8b5cf6}
#svc-strip{display:flex;flex-wrap:wrap;gap:6px;padding:6px 8px;border-top:1px solid #2a2a2a;font-size:9px;color:#888;align-items:center;flex-shrink:0}
#svc-strip:empty{display:none}
.svc-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:8px;background:#1c1c1c;border:1px solid #2a2a2a}
.svc-pill .svc-dot{width:6px;height:6px;border-radius:50%;background:#3fb950}
.svc-pill.failed .svc-dot,.svc-pill.error .svc-dot{background:#f85149}
.svc-pill.blocked .svc-dot{background:#d29922}
.svc-pill.notify_pending .svc-dot,.svc-pill.needs_action .svc-dot{background:#f97316}
.svc-pill.pending .svc-dot{background:#666}
.svc-pill .svc-name{color:#aaa}
.svc-pill.failed .svc-name,.svc-pill.error .svc-name{color:#f85149}
.job-elapsed{font-size:10px;color:#555;text-align:right}
.notify-row{margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.btn{padding:3px 9px;border-radius:4px;border:none;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit}
.btn-notify{background:#8b5cf6;color:#fff}.btn-notify:hover{background:#7c3aed}
.btn-stop{background:#383838;color:#999}.btn-stop:hover{background:#444;color:#ccc}
.countdown{font-size:10px;color:#7c3aed;font-variant-numeric:tabular-nums}

/* HUD Ask overlay */
#hud-ask-overlay{display:none;position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid #555;border-radius:12px;padding:18px 20px;min-width:300px;max-width:480px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.6)}
#hud-ask-message{color:#e0e0e0;font-size:13px;line-height:1.5;margin-bottom:14px}
#hud-ask-btns{display:flex;gap:10px;justify-content:center}
.hud-btn{padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity .15s}
.hud-btn:hover{opacity:.85}
.hud-btn-confirm{background:#22c55e;color:#fff}
.hud-btn-partial{background:#f59e0b;color:#fff}
.hud-btn-failed{background:#ef4444;color:#fff}
#btn-digest{padding:3px 9px;border-radius:4px;border:1px solid #444;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit;background:#2a2a2a;color:#888}
#btn-digest:hover{background:#333;color:#ccc}
</style></head>
<body>
<div id="header"><h1>YESHIE HUD</h1><div style="display:flex;align-items:center;gap:8px"><button id="btn-digest" onclick="copyDigest()">📋 Copy Digest</button><span id="conn">connecting…</span><span id="last-poll" style="font-size:9px;color:#444;margin-left:6px"></span></div></div>
<div id="jobs"><div class="empty">No active jobs</div></div><div id="svc-strip"></div>
<script src="/socket.io/socket.io.js"></script>
<script>
const jobsEl = document.getElementById('jobs');
const connEl = document.getElementById('conn');
const jobs = new Map();

function elapsed(ms) {
  const s = Math.floor(ms/1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s/60);
  if (m < 60) return m + 'm ' + (s%60) + 's';
  return Math.floor(m/60) + 'h ' + (m%60) + 'm';
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function notifyNow(id) {
  fetch('/jobs/' + id + '/notify', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).catch(()=>{});
}
function stopCountdown(id) {
  fetch('/jobs/' + id + '/notify/cancel', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).catch(()=>{});
}
function copyMsg(msg) {
  navigator.clipboard.writeText(msg).then(() => {
    const btn = event.target;
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy Message', 2000);
  }).catch(() => {
    fetch('/clipboard', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({text: msg})
    }).then(() => {
      const btn = event.target;
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy Message', 2000);
    });
  });
}

function buildDigest() {
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayMs = todayStart.getTime();
  const pad = n => String(n).padStart(2,'0');
  const d = new Date(now);
  const dateStr = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const all = [...jobs.values()];
  const active = all.filter(j => ['running','blocked','pending','notify_pending'].includes(j.status));
  const completedToday = all.filter(j => j.status === 'done' && j.updatedAt >= todayMs);
  const needsAction = all.filter(j => j.status === 'needs_action');
  const lines = [\`=== HUD Digest — \${dateStr} ===\`, ''];
  lines.push(\`ACTIVE (\${active.length})\`);
  if (active.length) {
    active.forEach(j => {
      const el = elapsed(now - j.createdAt);
      let extra = '';
      if (j.step && j.progress != null) extra = \` (\${j.step}, \${j.progress}%)\`;
      else if (j.step) extra = \` (\${j.step})\`;
      else if (j.progress != null) extra = \` (\${j.progress}%)\`;
      lines.push(\`• \${j.title || j.id} — \${j.status}\${extra}\`);
    });
  } else { lines.push('(none)'); }
  lines.push('');
  lines.push(\`COMPLETED TODAY (\${completedToday.length})\`);
  if (completedToday.length) {
    completedToday.forEach(j => lines.push(\`• \${j.title || j.id} — completed\`));
  } else { lines.push('(none)'); }
  lines.push('');
  lines.push(\`NEEDS ACTION (\${needsAction.length})\`);
  if (needsAction.length) {
    needsAction.forEach(j => lines.push(\`• \${j.title || j.id}\${j.notify_message ? ': ' + j.notify_message : ''}\`));
  } else { lines.push('(none)'); }
  return lines.join('\\n');
}

function copyDigest() {
  const text = buildDigest();
  const btn = document.getElementById('btn-digest');
  // Always use server-side pbcopy — navigator.clipboard silently no-ops in WKWebView
  fetch('/clipboard', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({text})
  }).then(() => {
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Digest'; }, 1500);
  }).catch(() => {
    // Fallback to browser clipboard API
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Digest'; }, 1500);
    });
  });
}

function render() {
  const now = Date.now();
  // Service tiles (id starts with 'svc-') render in a compact footer strip, NOT the main job list.
  // This keeps long-running daemons from being visual noise.
  const allActive = [...jobs.values()].filter(j => {
    if (['running','blocked','pending','notify_pending','needs_action','failed','error'].includes(j.status)) return true;
    return (now - j.updatedAt) < (j.status === 'needs_action' ? 600000 : 60000);
  });
  const services = allActive.filter(j => (j.id || '').startsWith('svc-'));
  const active = allActive.filter(j => !(j.id || '').startsWith('svc-'));
  // Render service strip
  const stripEl = document.getElementById('svc-strip');
  if (stripEl) {
    if (services.length === 0) {
      stripEl.innerHTML = '';
    } else {
      stripEl.innerHTML = services.map(s2 => {
        const cls = (s2.status || 'unknown').replace(/_/g, '-');
        const name = (s2.id || '').replace(/^svc-/, '');
        return '<span class="svc-pill ' + cls + '" title="' + (s2.step || '').replace(/"/g, '&amp;quot;') + '"><span class="svc-dot"></span><span class="svc-name">' + name + '</span></span>';
      }).join('');
    }
  }
  if (!active.length) { jobsEl.innerHTML = '<div class="empty">No active jobs</div>'; return; }
  jobsEl.innerHTML = active.map(j => {
    const el   = elapsed(now - j.createdAt);
    const cls  = j.status.replace(/_/g,'-'); // CSS class

    let notifyHtml = '';
    if (j.status === 'notify_pending' && j.countdown_start != null && j.countdown_seconds != null) {
      const remaining = Math.max(0, j.countdown_seconds - Math.floor((now - j.countdown_start) / 1000));
      notifyHtml = \`<div class="notify-row">
        <button class="btn btn-notify" onclick="notifyNow('\${esc(j.id)}')">Notify Now</button>
        <button class="btn btn-stop"   onclick="stopCountdown('\${esc(j.id)}')">Stop</button>
        <span class="countdown">⏱ Auto in \${remaining}s</span>
      </div>\`;
    }

    let actionHtml = '';
    if (j.status === 'needs_action' && j.notify_message) {
      const msg = esc(j.notify_message);
      actionHtml = \`<div class="notify-row">
        <button class="btn btn-copy" onclick="copyMsg('\${msg}')">📋 Copy Message</button>
        <span style="color:#f97316;font-size:10px">⚠ Paste into Claude chat</span>
      </div>
      <div style="margin-top:4px;font-size:10px;color:#aaa;word-break:break-word">\${msg}</div>\`;
    }

    const statusLabel = j.status === 'notify_pending' ? 'NOTIFY PENDING'
                      : j.status === 'needs_action'   ? 'NEEDS ACTION'
                      : j.status === 'completed'      ? 'COMPLETED'
                      : j.status === 'failed'         ? 'FAILED'
                      : j.status.toUpperCase();

    return \`<div class="job \${j.status}">
      <div>
        <div class="job-title">\${esc(j.title || j.id)}</div>
        <div class="job-meta">\${esc(j.id)}</div>
        \${j.step ? '<div class="job-step">' + esc(j.step) + '</div>' : ''}
        \${notifyHtml}\${actionHtml}
      </div>
      <div>
        <div class="job-status \${j.status}">\${statusLabel}</div>
        <div class="job-elapsed">\${el}</div>
      </div>
    </div>\`;
  }).join('');
}

const socket = io({ transports: ['websocket', 'polling'] });
socket.on('connect', () => {
  connEl.textContent = 'live';
  connEl.style.color = '#3fb950';
  fetch('/jobs/status?filter=all').then(r=>r.json()).then(d => {
    d.jobs.forEach(j => jobs.set(j.id, j));
    render();
  }).catch(()=>{});
});
socket.on('disconnect', () => { connEl.textContent = 'offline'; connEl.style.color = '#f85149'; });
socket.on('job_update', job => { jobs.set(job.id, job); render(); });
socket.on('jobs_snapshot', list => { jobs.clear(); list.forEach(j => jobs.set(j.id, j)); render(); });

// HUD ask — human-in-the-loop confirm/partial/failed
let _askId = null;
socket.on('hud:ask', ({id, message}) => {
  _askId = id;
  document.getElementById('hud-ask-message').textContent = message;
  document.getElementById('hud-ask-overlay').style.display = 'block';
});
function hudRespond(response) {
  if (!_askId) return;
  const id = _askId;
  _askId = null;
  document.getElementById('hud-ask-overlay').style.display = 'none';
  fetch('/hud/response/' + id, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({response})
  }).catch(() => {});
}

// Polling safety net — syncs even if Socket.IO is down
function pollJobs() {
  fetch('/jobs/status?filter=all').then(r=>r.json()).then(d => {
    d.jobs.forEach(j => jobs.set(j.id, j));
    render();
    const p = document.getElementById('last-poll');
    if (p) { const t = new Date(); p.textContent = t.getHours()+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0'); }
  }).catch(e => {
    const p = document.getElementById('last-poll');
    if (p) p.textContent = 'poll ERR';
  });
}
// Fire immediately on load, then every 5s
pollJobs();
setInterval(pollJobs, 5000);
setInterval(render, 1000);

// ── Scale shortcuts: cmd+= / cmd+- / cmd+0 ──────────────────────────────────
(function() {
  let scale = parseFloat(localStorage.getItem('hud-scale') || '1');
  function applyScale(s) {
    scale = Math.min(2.0, Math.max(0.5, Math.round(s * 10) / 10));
    document.documentElement.style.setProperty('--hud-scale', scale);
    document.body.style.transform = 'scale(' + scale + ')';
    document.body.style.width = 'calc(100% / ' + scale + ')';
    document.body.style.height = 'calc(100vh / ' + scale + ')';
    localStorage.setItem('hud-scale', scale);
  }
  applyScale(scale); // restore persisted scale on load
  document.addEventListener('keydown', function(e) {
    if (!e.metaKey) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); applyScale(scale + 0.1); }
    else if (e.key === '-') { e.preventDefault(); applyScale(scale - 0.1); }
    else if (e.key === '0') { e.preventDefault(); applyScale(1.0); }
  });
})();
</script>

<div id="hud-ask-overlay">
  <div id="hud-ask-message"></div>
  <div id="hud-ask-btns">
    <button class="hud-btn hud-btn-confirm" onclick="hudRespond('confirm')">✅ Confirm</button>
    <button class="hud-btn hud-btn-partial" onclick="hudRespond('partial')">⚠️ Partial</button>
    <button class="hud-btn hud-btn-failed"  onclick="hudRespond('failed')">❌ Failed</button>
  </div>
</div>
</body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // --- Status board ---

    if (path === '/status-board' && req.method === 'GET') {
      if (!global._statusMessages) global._statusMessages = [];
      const rows = global._statusMessages.map(m => {
        const cls = m.text.includes('DONE') ? 'done' : m.text.includes('FAIL') ? 'fail' : m.text.includes('WATCHDOG') ? 'watch' : 'info';
        return `<div class="msg ${cls}"><span class="ts">${m.ts}</span>${m.text}</div>`;
      }).join('\n') || '<div class="msg info"><span class="ts">--:--:--</span>No messages yet</div>';
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Yeshie Status</title>

<style>body{font-family:monospace;background:#0d1117;color:#c9d1d9;margin:20px;font-size:13px}
h2{color:#58a6ff}hr{border-color:#333}
.msg{padding:4px 8px;border-left:3px solid #333;margin:3px 0}
.done{border-color:#3fb950}.fail{border-color:#f85149}.watch{border-color:#d29922}.info{border-color:#58a6ff}
.ts{color:#8b949e;margin-right:8px}</style></head>
<body><h2>Yeshie Status Board</h2><small id="cd">Refreshing in 10s...</small><script>let t=10;setInterval(()=>{t--;document.getElementById("cd").textContent="Refreshing in "+t+"s...";if(t<=0){t=10;location.reload();}},1000);</script><hr>${rows}</body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (path === '/status-board' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'bad json' }); return; }
      if (!global._statusMessages) global._statusMessages = [];
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      global._statusMessages.unshift({ ts, text: body.text || JSON.stringify(body) });
      if (global._statusMessages.length > 50) global._statusMessages.length = 50;
      jsonReply(res, 200, { ok: true, count: global._statusMessages.length });
      return;
    }

    // --- Chat endpoints ---

    if (path === '/chat/status' && req.method === 'GET') {
      // Grace period: listener is "connected" if actively polling OR was recently active (within 90s).
      // 90s covers long payload runs where Claude is busy and not yet back in yeshie_listen.
      const isConnected = !!pendingListener || (Date.now() - lastListenerActiveAt < 90000);
      jsonReply(res, 200, {
        listenerConnected: isConnected,
        queuedMessages: chatQueue.length + suggestionQueue.length,
        pendingResponses: pendingResponders.size,
      });
      return;
    }

    if (path === '/chat/listen' && req.method === 'GET') {
      const timeout = parseInt(url.searchParams.get('timeout') || '300', 10);

      // Return queued suggestions first
      if (suggestionQueue.length > 0) {
        jsonReply(res, 200, suggestionQueue.shift());
        return;
      }

      // Return queued chat messages
      if (chatQueue.length > 0) {
        jsonReply(res, 200, chatQueue.shift());
        return;
      }

      // Replace existing listener
      if (pendingListener) {
        resolveListener({ type: 'replaced' });
      }

      // Hold connection open
      const timer = setTimeout(() => {
        if (pendingListener && pendingListener.res === res) {
          pendingListener = null;
          jsonReply(res, 200, { type: 'timeout' });
        }
      }, timeout * 1000);

      pendingListener = { res, timer };
      lastListenerActiveAt = Date.now();

      req.on('close', () => {
        if (pendingListener && pendingListener.res === res) {
          clearTimeout(timer);
          pendingListener = null;
        }
        lastListenerActiveAt = Date.now();
      });
      return;
    }

    if (path === '/chat' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const chatId = genMsgId();
      const msg = {
        type: 'chat_message',
        id: chatId,
        message: body.message,
        mode: body.mode || 'answer',
        currentUrl: body.currentUrl || null,
        tabId: body.tabId || null,
        history: body.history || [],
      };

      // Log the incoming message
      logConversation({ event: 'user_message', chatId, message: body.message, currentUrl: body.currentUrl || null, tabId: body.tabId || null });

      // Stamp activity — listener is "busy" from now until yeshie_respond arrives
      lastListenerActiveAt = Date.now();

      if (!pendingListener) {
        // In test mode return 503 immediately so tests don't hang on the 5-min timeout.
        if (process.env.RELAY_TEST_MODE) {
          jsonReply(res, 503, { type: 'no_listener', message: 'Yeshie is offline' });
          return;
        }
        // No listener right now — queue the message instead of rejecting.
        // The listener shell wrapper restarts Haiku after each response,
        // so there's a brief gap between invocations. Queue survives that gap.
        logConversation({ event: 'message_queued', chatId, reason: 'no_listener' });
        chatQueue.push(msg);
      } else {
        // Resolve the listener with this message
        resolveListener(msg);
      }

      // Hold side panel response until Claude responds via POST /chat/respond
      const respTimer = setTimeout(() => {
        pendingResponders.delete(chatId);
        jsonReply(res, 200, { type: 'timeout' });
      }, 300_000);

      pendingResponders.set(chatId, { res, timer: respTimer, tabId: body.tabId || null });
      if (body.tabId) chatIdToTabId.set(chatId, body.tabId);

      req.on('close', () => {
        if (pendingResponders.has(chatId)) {
          clearTimeout(respTimer);
          pendingResponders.delete(chatId);
        }
      });
      return;
    }

    if (path === '/chat/respond' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const { chatId, response } = body;
      const responder = pendingResponders.get(chatId);
      if (!responder) {
        // Second respond call (pendingResponder already consumed by interim) — push to controller buffer
        const orphanTabId = chatIdToTabId.get(chatId);
        if (orphanTabId) {
          lastListenerActiveAt = Date.now();
          logConversation({ event: 'yeshie_response', chatId, response, via: 'second_respond' });
          if (!controllerResponses.has(orphanTabId)) controllerResponses.set(orphanTabId, []);
          const obuf = controllerResponses.get(orphanTabId);
          obuf.push({ response, chatId, ts: Date.now() });
          if (obuf.length > 50) obuf.splice(0, obuf.length - 50);
          for (let i = controllerAwaiters.length - 1; i >= 0; i--) {
            const aw = controllerAwaiters[i];
            if (aw.tabId === orphanTabId) {
              clearTimeout(aw.timer);
              controllerAwaiters.splice(i, 1);
              jsonReply(aw.res, 200, { type: 'response', response, chatId, tabId: orphanTabId });
            }
          }
          jsonReply(res, 200, { ok: true });
        } else {
          jsonReply(res, 404, { error: 'No pending response for this chatId' });
        }
        return;
      }

      clearTimeout(responder.timer);
      pendingResponders.delete(chatId);
      // Retain chatId→tabId for potential second respond call (final after interim)
      if (responder.tabId) {
        chatIdToTabId.set(chatId, responder.tabId);
        if (chatIdToTabId.size > 500) chatIdToTabId.delete(chatIdToTabId.keys().next().value);
      }
      lastListenerActiveAt = Date.now();
      // Log the response
      logConversation({ event: 'yeshie_response', chatId, response });

      // Buffer response for controller (C) channel
      const respTabId = responder.tabId;
      if (respTabId) {
        if (!controllerResponses.has(respTabId)) controllerResponses.set(respTabId, []);
        const buf = controllerResponses.get(respTabId);
        buf.push({ response, chatId, ts: Date.now() });
        if (buf.length > 50) buf.splice(0, buf.length - 50);
        // Wake up any awaiting controllers for this tab
        for (let i = controllerAwaiters.length - 1; i >= 0; i--) {
          const aw = controllerAwaiters[i];
          if (aw.tabId === respTabId) {
            clearTimeout(aw.timer);
            controllerAwaiters.splice(i, 1);
            jsonReply(aw.res, 200, { type: 'response', response, chatId, tabId: respTabId });
          }
        }
      }

      // Include chatId so sidepanel can associate feedback
      jsonReply(responder.res, 200, { ...response, chatId });
      jsonReply(res, 200, { ok: true });
      return;
    }

    if (path === '/chat/suggest' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const suggestion = {
        type: 'suggestion',
        id: genMsgId(),
        runId: body.runId,
        suggestion: body.suggestion,
      };

      if (pendingListener) {
        resolveListener(suggestion);
      } else {
        suggestionQueue.push(suggestion);
      }

      jsonReply(res, 200, { ok: true });
      return;
    }

    if (path === '/chat/inject' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const { tabId, message } = body;
      if (!tabId || !message) {
        jsonReply(res, 400, { error: 'tabId and message are required' });
        return;
      }
      if (!extensionSocket) {
        jsonReply(res, 503, { error: 'Extension not connected' });
        return;
      }
      logConversation({ event: 'injected_message', tabId, message });
      extensionSocket.emit('inject_chat', { tabId, message });
      jsonReply(res, 200, { ok: true });
      return;
    }

    // ── Controller (C) channel: long-poll for Haiku responses ──
    if (path === '/chat/await' && req.method === 'GET') {
      const awaitTabId = parseInt(url.searchParams.get('tabId'), 10);
      const timeout = Math.min(parseInt(url.searchParams.get('timeout') || '30', 10), 120) * 1000;
      const since = parseInt(url.searchParams.get('since') || '0', 10);

      if (!awaitTabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }

      // Check if there's already a buffered response newer than `since`
      const awBuf = controllerResponses.get(awaitTabId) || [];
      const fresh = awBuf.filter(r => r.ts > since);
      if (fresh.length > 0) {
        jsonReply(res, 200, { type: 'response', ...fresh[fresh.length - 1] });
        return;
      }

      // No response yet — long-poll
      const awTimer = setTimeout(() => {
        const idx = controllerAwaiters.findIndex(a => a.res === res);
        if (idx !== -1) controllerAwaiters.splice(idx, 1);
        const hb = controllerHeartbeats.get(awaitTabId);
        jsonReply(res, 200, { type: 'timeout', heartbeat: hb || null });
      }, timeout);

      controllerAwaiters.push({ tabId: awaitTabId, res, timer: awTimer });

      req.on('close', () => {
        const idx = controllerAwaiters.findIndex(a => a.res === res);
        if (idx !== -1) {
          clearTimeout(controllerAwaiters[idx].timer);
          controllerAwaiters.splice(idx, 1);
        }
      });
      return;
    }

    // ── Controller (C) channel: heartbeat from Haiku ──
    if (path === '/chat/heartbeat' && req.method === 'POST') {
      let hbBody;
      try { hbBody = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const { tabId: hbTabId, status: hbStatus, step: hbStep } = hbBody;
      if (!hbTabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }

      controllerHeartbeats.set(hbTabId, { status: hbStatus || 'working', step: hbStep || null, ts: Date.now() });
      jsonReply(res, 200, { ok: true });
      return;
    }

    // ── Controller (C) channel: read buffered responses ──
    if (path === '/chat/responses' && req.method === 'GET') {
      const respBufTabId = parseInt(url.searchParams.get('tabId'), 10);
      const respSince = parseInt(url.searchParams.get('since') || '0', 10);

      if (!respBufTabId) { jsonReply(res, 400, { error: 'tabId required' }); return; }

      const rBuf = (controllerResponses.get(respBufTabId) || []).filter(r => r.ts > respSince);
      const rHb = controllerHeartbeats.get(respBufTabId) || null;
      jsonReply(res, 200, { responses: rBuf, heartbeat: rHb });
      return;
    }

    // ── Job tracking: subprocesses report status, Dispatch polls ──

    if (path === '/jobs/update' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const { id, title, status, step, progress, result, error: jobError, session_title, notify_message } = body;
      if (!id) { jsonReply(res, 400, { error: 'id required' }); return; }

      const now = Date.now();
      const existing = jobs.get(id);
      jobs.set(id, {
        id,
        title:             title          || existing?.title          || id,
        status:            status         || existing?.status         || 'running',
        step:              step           !== undefined ? step : null,
        progress:          progress != null ? progress : (existing?.progress != null ? existing.progress : null),
        result:            result         || existing?.result         || null,
        error:             jobError       || existing?.error          || null,
        session_title:     session_title  || existing?.session_title  || null,
        notify_message:    notify_message || existing?.notify_message || null,
        countdown_start:   existing?.countdown_start   || null,
        countdown_seconds: existing?.countdown_seconds || null,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      logConversation({ event: 'job_update', jobId: id, status: status || 'running', step: step || null });
      persistJobsState();
      const updatedJob = jobs.get(id);
      io.emit('job_update', updatedJob);
      // First sighting of this job → bring the HUD forward so Mike notices it.
      if (!existing) showHudPanel();
      // Smart inject/notify on blocked or done
      if (status === 'blocked' || status === 'done') {
        scheduleOrInject(jobs.get(id));
      }
      jsonReply(res, 200, { ok: true });
      return;
    }

    if (path === '/jobs/status' && req.method === 'GET') {
      const now = Date.now();
      // Expire stale jobs
      let expired = false;
      for (const [id, job] of jobs) {
        if (now - job.updatedAt > JOB_TTL_MS) { jobs.delete(id); expired = true; }
      }
      if (expired) persistJobsState();

      const filter = url.searchParams.get('filter'); // "active" | "all" (default: active)
      const activeStatuses = new Set(['running', 'blocked', 'pending']);
      const jobList = [];
      for (const [, job] of jobs) {
        if (filter !== 'all' && !activeStatuses.has(job.status)) {
          // For "active" filter, also include recently completed (< 60s)
          if (now - job.updatedAt > 60_000) continue;
        }
        jobList.push(job);
      }
      jsonReply(res, 200, { jobs: jobList, ts: now });
      return;
    }

    if (path === '/jobs/create' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const { id, title, status: createStatus, step: createStep, progress: createProgress } = body;
      if (!id) { jsonReply(res, 400, { error: 'id required' }); return; }

      const now = Date.now();
      jobs.set(id, {
        id,
        title: title || id,
        status: createStatus || 'pending',
        step: createStep || null,
        progress: createProgress != null ? createProgress : null,
        result: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      logConversation({ event: 'job_created', jobId: id, title: title || id });
      persistJobsState();
      io.emit('job_update', jobs.get(id));
      // Reopen HUD whenever a new job starts
      showHudPanel();
      jsonReply(res, 200, { ok: true, id });
      return;
    }

    if (path === '/chat/feedback' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      logConversation({ event: 'user_feedback', chatId: body.chatId || null, rating: body.rating, comment: body.comment || null });
      jsonReply(res, 200, { ok: true });
      return;
    }

    if (path === '/chat/logs' && req.method === 'GET') {
      // Return recent conversation logs for review
      try {
        const { readFileSync, readdirSync } = await import('fs');
        ensureLogsDir();
        const files = readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).sort().reverse();
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const lines = [];
        for (const f of files) {
          const content = readFileSync(join(LOGS_DIR, f), 'utf-8').trim().split('\n');
          for (const line of content.reverse()) {
            lines.push(JSON.parse(line));
            if (lines.length >= limit) break;
          }
          if (lines.length >= limit) break;
        }
        jsonReply(res, 200, { logs: lines });
      } catch (e) {
        jsonReply(res, 500, { error: e.message });
      }
      return;
    }

    // ── Job notify / cancel endpoints ─────────────────────────────────────────
    const notifyM = path.match(/^\/jobs\/([^/]+)\/notify$/);
    if (notifyM && req.method === 'POST') {
      const jobId = notifyM[1];
      const job = jobs.get(jobId);
      if (!job) { jsonReply(res, 404, { error: 'job not found' }); return; }
      jsonReply(res, 200, { ok: true });
      fireInject(job);
      return;
    }

    const cancelM = path.match(/^\/jobs\/([^/]+)\/notify\/cancel$/);
    if (cancelM && req.method === 'POST') {
      const jobId = cancelM[1];
      clearNotifyTimer(jobId);
      const job = jobs.get(jobId);
      if (job && job.status === 'notify_pending') {
        const upd = { ...job, status: 'blocked', countdown_start: null, countdown_seconds: null, updatedAt: Date.now() };
        jobs.set(jobId, upd);
        io.emit('job_update', upd);
      }
      jsonReply(res, 200, { ok: true });
      return;
    }

    // ── HUD: serve panel ─────────────────────────────────────────
    if (path === '/' && req.method === 'GET') {
      const { readFileSync: rfs } = await import('fs');
      try {
        const html = rfs(join(__dirname, 'index.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch (e) {
        res.writeHead(500); res.end('index.html not found: ' + e.message);
      }
      return;
    }

    // ── HUD: job/start ───────────────────────────────────────────
    if (path === '/job/start' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { job_id, session_title, description } = body;
      if (!job_id) { jsonReply(res, 400, { error: 'job_id required' }); return; }
      if (jobMap.has(job_id)) dismissJob(job_id);
      jobMap.set(job_id, makeJob(job_id, session_title || 'unknown', description || ''));
      broadcastHud();
      jsonReply(res, 200, { ok: true, job_id });
      return;
    }

    // ── HUD: job/update ──────────────────────────────────────────
    if (path === '/job/update' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { job_id, status, message } = body;
      if (!job_id) { jsonReply(res, 400, { error: 'job_id required' }); return; }
      if (!jobMap.has(job_id))
        jobMap.set(job_id, makeJob(job_id, body.session_title || 'unknown', body.description || ''));
      const job = jobMap.get(job_id);
      if (status)             job.status  = status;
      if (message !== undefined) job.message = message;
      job.updated_at = Date.now();
      if (status === 'notified') {
        if (job.ack_timer) clearTimeout(job.ack_timer);
        job.ack_timer = setTimeout(() => {
          const j = jobMap.get(job_id);
          if (j && j.status === 'notified') {
            j.status = 'blocked'; j.message += ' [no ack — escalating]'; j.updated_at = Date.now();
            broadcastHud();
            fireAlert(job_id, j.session_title, 'Job completed but session did not acknowledge.');
          }
        }, ACK_TIMEOUT_MS);
      }
      if (status === 'blocked') fireAlert(job_id, job.session_title, message || 'Blocked — needs your input');
      if (['done','acked','error'].includes(status)) {
        if (job.ack_timer)    { clearTimeout(job.ack_timer);   job.ack_timer   = null; }
        if (job.snooze_timer) { clearTimeout(job.snooze_timer); job.snooze_timer = null; }
        scheduleAutoDismiss(job_id);
      }
      broadcastHud();
      jsonReply(res, 200, { ok: true, job_id, status: job.status });
      return;
    }

    // ── HUD: job/ack ─────────────────────────────────────────────
    if (path === '/job/ack' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      const { job_id } = body;
      if (!job_id) { jsonReply(res, 400, { error: 'job_id required' }); return; }
      const job = jobMap.get(job_id);
      if (!job) { jsonReply(res, 404, { error: 'job not found' }); return; }
      if (job.ack_timer)    { clearTimeout(job.ack_timer);   job.ack_timer   = null; }
      if (job.snooze_timer) { clearTimeout(job.snooze_timer); job.snooze_timer = null; }
      job.status = 'acked'; job.updated_at = Date.now();
      scheduleAutoDismiss(job_id);
      broadcastHud();
      jsonReply(res, 200, { ok: true, job_id });
      return;
    }

    // ── HUD: jobs snapshot ───────────────────────────────────────
    if (path === '/jobs' && req.method === 'GET') {
      const jobs = [...jobMap.values()].map(j => ({
        job_id: j.job_id, session_title: j.session_title, description: j.description,
        status: j.status, message: j.message, started_at: j.started_at, updated_at: j.updated_at,
      }));
      jsonReply(res, 200, { jobs });
      return;
    }

    // ── Clipboard helper (pbcopy fallback for WKWebView) ─────────────────────
    if (path === '/clipboard' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const { text } = body;
        const proc = spawn('pbcopy');
        proc.stdin.write(text);
        proc.stdin.end();
        res.writeHead(200); res.end('ok');
      } catch(e) { res.writeHead(500); res.end('error'); }
      return;
    }

    // ── /job-update alias (used by cd-inject.sh) ─────────────────────────────
    if (path === '/job-update' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { jsonReply(res, 400, { error: 'Invalid JSON' }); return; }

      const { id, title, status, step, result, error: jobError, session_title, notify_message } = body;
      if (!id) { jsonReply(res, 400, { error: 'id required' }); return; }

      const now = Date.now();
      const existing = jobs.get(id);
      jobs.set(id, {
        id,
        title:             title          || existing?.title          || id,
        status:            status         || existing?.status         || 'running',
        step:              step           || null,
        result:            result         || existing?.result         || null,
        error:             jobError       || existing?.error          || null,
        session_title:     session_title  || existing?.session_title  || null,
        notify_message:    notify_message || existing?.notify_message || null,
        countdown_start:   existing?.countdown_start   || null,
        countdown_seconds: existing?.countdown_seconds || null,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      const updatedJob = jobs.get(id);
      io.emit('job_update', updatedJob);
      if (status === 'blocked' || status === 'done') {
        scheduleOrInject(updatedJob);
      }
      jsonReply(res, 200, { ok: true });
      return;
    }

    // Fallback
    res.writeHead(404); res.end();
  });

  return {
    httpServer,
    io,
    listen: (listenPort) => new Promise(resolve => {
      httpServer.listen(listenPort ?? port, () => {
        const addr = httpServer.address();
        console.log(`[relay] listening on port ${addr.port}`);
        resolve(addr);
      });
    }),
    close: () => new Promise(resolve => {
      resetChatState();
      io.close(() => httpServer.close(resolve));
    }),
  };
}

// --- Main: start server when run directly ---
if (!process.env.RELAY_TEST_MODE) {
  const relay = createRelay(3333);
  relay.listen();
}
