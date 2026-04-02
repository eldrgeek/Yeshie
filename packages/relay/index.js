// Yeshie Local Relay Server
// Bridges cc-bridge MCP tools ↔ Chrome extension background worker
// Port 3333

import { createServer } from 'http';
import { Server } from 'socket.io';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// ====================== Server factory ======================

export function createRelay(port = 3333) {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  // Pending calls: commandId → { resolve, reject, timer }
  const pending = new Map();

  // Track connected extension
  let extensionSocket = null;

  // Chat state (per-instance)
  let chatQueue = [];
  let pendingListener = null;            // { res, timer }
  let pendingResponders = new Map();     // chatId → { res, timer }
  let suggestionQueue = [];
  let lastListenerActiveAt = 0;          // timestamp of last listener activity (grace period for status)

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
      extensionSocket = socket;
      console.log('[relay] extension registered');

      socket.on('disconnect', () => {
        console.log('[relay] extension disconnected');
        if (extensionSocket === socket) extensionSocket = null;
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
  });

  // HTTP handler
  httpServer.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

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

    // --- Chat endpoints ---

    if (path === '/chat/status' && req.method === 'GET') {
      // Grace period: listener is "connected" if actively polling OR was recently active (within 15s)
      const isConnected = !!pendingListener || (Date.now() - lastListenerActiveAt < 15000);
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

      if (!pendingListener) {
        logConversation({ event: 'no_listener', chatId });
        jsonReply(res, 503, { type: 'no_listener', message: 'Yeshie is offline' });
        return;
      }

      // Resolve the listener with this message
      resolveListener(msg);

      // Hold side panel response until Claude responds via POST /chat/respond
      const respTimer = setTimeout(() => {
        pendingResponders.delete(chatId);
        jsonReply(res, 200, { type: 'timeout' });
      }, 120_000);

      pendingResponders.set(chatId, { res, timer: respTimer });

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
        jsonReply(res, 404, { error: 'No pending response for this chatId' });
        return;
      }

      clearTimeout(responder.timer);
      pendingResponders.delete(chatId);
      lastListenerActiveAt = Date.now();
      // Log the response
      logConversation({ event: 'yeshie_response', chatId, response });
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
