// Yeshie Local Relay Server
// Bridges cc-bridge MCP tools ↔ Chrome extension background worker
// Port 3333

import { createServer } from 'http';
import { Server } from 'socket.io';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

// ====================== Conversation Logger ======================

const __dirname = dirname(fileURLToPath(import.meta.url));
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

  // Track connected extensions — last registered is primary; others are fallbacks
  let extensionSocket = null;
  const extensionSockets = new Set();

  // Chat state (per-instance)
  let chatQueue = [];
  let pendingListener = null;            // { res, timer }
  let pendingResponders = new Map();     // chatId → { res, timer }
  let suggestionQueue = [];
  let lastListenerActiveAt = 0;          // timestamp of last listener activity (grace period for status)

  // Controller (C) channel — buffered responses and heartbeats for programmatic callers
  const controllerResponses = new Map();  // tabId → [{ response, chatId, ts }]
  const controllerHeartbeats = new Map(); // tabId → { status, step, ts }
  const controllerAwaiters = [];          // [{ tabId, res, timer }]
  const chatIdToTabId = new Map();        // chatId → tabId (retained after pendingResponder consumed, for second respond calls)

  // Job tracking — subprocesses report status here, Dispatch polls on each wake-up
  const jobs = new Map();                 // jobId → { id, title, status, step, result, error, createdAt, updatedAt }
  const JOB_TTL_MS = 30 * 60 * 1000;     // 30 minutes — auto-expire stale jobs

  // ── Smart notification (idle detection + countdown) ─────────────────────────
  const notifyTimers = new Map();   // jobId → intervalId
  const COUNTDOWN_S  = 30;          // auto-fire after this many seconds
  const IDLE_FIRE_S  = 10;          // also auto-fire if user idle >= this long
  const AX_INJECT    = '/Users/mikewolf/Projects/yeshie/scripts/ax-inject.py';

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
    execFile('python3', [AX_INJECT, ...pyArgs], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) console.warn(`[relay] inject failed: ${err.message}\n${stderr}`);
      else console.log(`[relay] inject ok: ${stdout.trim()}`);
      const cur = jobs.get(job.id) || job;
      const upd = { ...cur, status: err ? 'error' : 'done', countdown_start: null, countdown_seconds: null, updatedAt: Date.now() };
      jobs.set(job.id, upd);
      io.emit('job_update', upd);
    });
  }

  function scheduleNotify(job) {
    clearNotifyTimer(job.id);
    const countdown_start = Date.now();
    const pending = { ...job, status: 'notify_pending', countdown_start, countdown_seconds: COUNTDOWN_S, updatedAt: countdown_start };
    jobs.set(job.id, pending);
    io.emit('job_update', pending);
    fetch('http://localhost:3334/show').catch(() => {});

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
      fetch('http://localhost:3334/show').catch(() => {});
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

    if (path === '/hud' && req.method === 'GET') {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Yeshie HUD</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#1a1a1a;color:#e0e0e0;font-size:12px;overflow:hidden;height:100vh;display:flex;flex-direction:column}
#header{padding:8px 12px;background:#111;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
#header h1{font-size:13px;font-weight:600;color:#aaa;letter-spacing:.5px}
#header span{font-size:10px;color:#555}
#jobs{flex:1;overflow-y:auto;padding:8px}
.empty{color:#555;text-align:center;padding:40px;font-size:11px}
.job{background:#242424;border-radius:6px;padding:8px 10px;margin-bottom:6px;border-left:3px solid #444;display:grid;grid-template-columns:1fr auto;gap:4px}
.job.running{border-color:#f0a500}
.job.done{border-color:#3fb950}
.job.error{border-color:#f85149}
.job.blocked{border-color:#d29922;animation:pulse 1.5s infinite}
.job.pending{border-color:#555}
.job.notify_pending{border-color:#8b5cf6;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.job-title{font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.job-meta{font-size:10px;color:#777;margin-top:2px}
.job-status{font-size:10px;text-align:right;font-weight:600}
.job-status.running{color:#f0a500}
.job-status.done{color:#3fb950}
.job-status.error{color:#f85149}
.job-status.blocked{color:#d29922}
.job-status.notify_pending{color:#8b5cf6}
.job-elapsed{font-size:10px;color:#555;text-align:right}
.notify-row{margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.btn{padding:3px 9px;border-radius:4px;border:none;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit}
.btn-notify{background:#8b5cf6;color:#fff}.btn-notify:hover{background:#7c3aed}
.btn-stop{background:#383838;color:#999}.btn-stop:hover{background:#444;color:#ccc}
.countdown{font-size:10px;color:#7c3aed;font-variant-numeric:tabular-nums}
</style></head>
<body>
<div id="header"><h1>YESHIE HUD</h1><span id="conn">connecting…</span></div>
<div id="jobs"><div class="empty">No active jobs</div></div>
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

function render() {
  const now = Date.now();
  const active = [...jobs.values()].filter(j => {
    if (['running','blocked','pending','notify_pending'].includes(j.status)) return true;
    return (now - j.updatedAt) < 60000;
  });
  if (!active.length) { jobsEl.innerHTML = '<div class="empty">No active jobs</div>'; return; }
  jobsEl.innerHTML = active.map(j => {
    const el   = elapsed(now - j.createdAt);
    const step = j.step ? '<br>' + esc(j.step) : '';
    const cls  = j.status.replace(/_/g,'-'); // CSS class (notify_pending → notify-pending, but keep both)

    let notifyHtml = '';
    if (j.status === 'notify_pending' && j.countdown_start != null && j.countdown_seconds != null) {
      const remaining = Math.max(0, j.countdown_seconds - Math.floor((now - j.countdown_start) / 1000));
      notifyHtml = \`<div class="notify-row">
        <button class="btn btn-notify" onclick="notifyNow('\${esc(j.id)}')">Notify Now</button>
        <button class="btn btn-stop"   onclick="stopCountdown('\${esc(j.id)}')">Stop</button>
        <span class="countdown">⏱ Auto in \${remaining}s</span>
      </div>\`;
    }

    const statusLabel = j.status === 'notify_pending' ? 'NOTIFY PENDING' : j.status.toUpperCase();

    return \`<div class="job \${j.status}">
      <div>
        <div class="job-title">\${esc(j.title || j.id)}</div>
        <div class="job-meta">\${esc(j.id)}\${step}</div>
        \${notifyHtml}
      </div>
      <div>
        <div class="job-status \${j.status}">\${statusLabel}</div>
        <div class="job-elapsed">\${el}</div>
      </div>
    </div>\`;
  }).join('');
}

const socket = io({ transports: ['websocket'] });
socket.on('connect', () => { connEl.textContent = 'live'; connEl.style.color = '#3fb950'; });
socket.on('disconnect', () => { connEl.textContent = 'offline'; connEl.style.color = '#f85149'; });
socket.on('job_update', job => { jobs.set(job.id, job); render(); });
socket.on('jobs_snapshot', list => { jobs.clear(); list.forEach(j => jobs.set(j.id, j)); render(); });

socket.on('connect', () => {
  fetch('/jobs/status?filter=all').then(r=>r.json()).then(d => {
    d.jobs.forEach(j => jobs.set(j.id, j));
    render();
  });
});

setInterval(render, 1000);
</script>
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
      logConversation({ event: 'job_update', jobId: id, status: status || 'running', step: step || null });
      const updatedJob = jobs.get(id);
      io.emit('job_update', updatedJob);
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
      for (const [id, job] of jobs) {
        if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
      }

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

      const { id, title } = body;
      if (!id) { jsonReply(res, 400, { error: 'id required' }); return; }

      const now = Date.now();
      jobs.set(id, {
        id,
        title: title || id,
        status: 'pending',
        step: null,
        result: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      logConversation({ event: 'job_created', jobId: id, title: title || id });
      io.emit('job_update', jobs.get(id));
      // Reopen HUD whenever a new job starts
      fetch('http://localhost:3334/show').catch(() => {});
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
