#!/usr/bin/env node
// scripts/chatgpt-bridge.js — ChatGPT-as-character bridge for Playmaker / Writing Room
//
// Runs as a local HTTP service on :3336 that the Writing Room calls to
// interact with ChatGPT's web UI via the Yeshie relay on :3333.
//
// === CONTRACT (for W1 / Writing Room integration) ===
//
// POST http://localhost:3336/send
//   Request:  { context: string, newConversation?: boolean, tabId?: number }
//   Response 200: { ok: true, reply: string, conversationUrl: string,
//                   tabId: number, character: "chatgpt" }
//   Response 4xx/5xx: { ok: false, error: string, code: ErrorCode,
//                       character: "chatgpt" }
//
// GET http://localhost:3336/status
//   Response 200: { ok: true, bridge: "chatgpt-bridge", version: "0.1",
//                   relay: { ok, extensionConnected, pending } }
//
// === Error codes ===
//   RELAY_DOWN              — relay :3333 not reachable
//   EXTENSION_NOT_CONNECTED — relay up but Chrome extension not connected
//   NO_SESSION              — ChatGPT auth wall detected (not logged in)
//   TAB_UNAVAILABLE         — couldn't open/find a usable ChatGPT tab
//   SEND_FAILED             — relay returned an error running the chain
//   REPLY_CAPTURE_FAILED    — chain succeeded but no text was captured
//   TIMEOUT                 — chain exceeded 3-minute limit
//   BAD_REQUEST             — missing or invalid request body
//
// === Reply-complete detection ===
//   Two-phase: (1) wait for [data-testid="stop-button"] to APPEAR (10s timeout —
//   confirms generation started); (2) wait for it to DISAPPEAR (180s timeout —
//   confirms streaming complete). Then 800ms settle before reading the last
//   [data-message-author-role="assistant"] element. Two phases prevent capturing
//   a stale reply if the submit happened but generation hasn't started yet.
//
// Usage:
//   node scripts/chatgpt-bridge.js          # start the service
//   node scripts/chatgpt-bridge.js test     # run a live end-to-end test

import { createServer } from 'http';

const RELAY = 'http://localhost:3333';
const PORT = 3336;
const CHATGPT_HOME = 'https://chatgpt.com/';
const SEND_TIMEOUT_MS = 210_000; // 3.5 minutes — 3 min for generation + overhead

const ERROR_CODES = {
  RELAY_DOWN: 'RELAY_DOWN',
  EXTENSION_NOT_CONNECTED: 'EXTENSION_NOT_CONNECTED',
  NO_SESSION: 'NO_SESSION',
  TAB_UNAVAILABLE: 'TAB_UNAVAILABLE',
  SEND_FAILED: 'SEND_FAILED',
  REPLY_CAPTURE_FAILED: 'REPLY_CAPTURE_FAILED',
  TIMEOUT: 'TIMEOUT',
  BAD_REQUEST: 'BAD_REQUEST',
};

// ── Relay helpers ─────────────────────────────────────────────────────────────

async function getRelayStatus() {
  try {
    const r = await fetch(`${RELAY}/status`);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

async function listTabs() {
  const r = await fetch(`${RELAY}/tabs/list`);
  if (!r.ok) throw new Error(`/tabs/list HTTP ${r.status}`);
  const body = await r.json();
  // Extension returns either an array or { tabs: [...] }
  return Array.isArray(body) ? body : (body.tabs ?? []);
}

async function openTab(url) {
  const r = await fetch(`${RELAY}/tabs/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(`/tabs/open HTTP ${r.status}: ${await r.text()}`);
  return r.json(); // { tabId, url }
}

async function runPayload(payload, tabId = null, timeoutMs = SEND_TIMEOUT_MS) {
  const r = await fetch(`${RELAY}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, params: {}, tabId, timeoutMs }),
  });
  if (!r.ok) throw new Error(`/run HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Core bridge functions ─────────────────────────────────────────────────────

/**
 * Locate an existing authenticated ChatGPT tab, or open a new one.
 * Returns { tabId: number, isNew: boolean, url: string }
 * Throws with code TAB_UNAVAILABLE if a tab cannot be established.
 */
async function ensureChatGPTTab() {
  const tabs = await listTabs();
  // Prefer tabs on chatgpt.com that are NOT on the auth flow
  const existing = tabs.find(t =>
    /chatgpt\.com/.test(t.url ?? '') &&
    !/auth|login|accounts\.openai/i.test(t.url ?? '')
  );
  if (existing) {
    const tabId = existing.id ?? existing.tabId;
    console.log(`[bridge] Reusing ChatGPT tab ${tabId} @ ${existing.url}`);
    return { tabId, isNew: false, url: existing.url };
  }

  console.log('[bridge] No ChatGPT tab found — opening new tab');
  let opened;
  try {
    opened = await openTab(CHATGPT_HOME);
  } catch (err) {
    const e = new Error(`Cannot open ChatGPT tab: ${err.message}`);
    e.code = ERROR_CODES.TAB_UNAVAILABLE;
    throw e;
  }
  await sleep(2000); // let the tab load
  const tabId = opened.id ?? opened.tabId;
  return { tabId, isNew: true, url: CHATGPT_HOME };
}

/**
 * Inject contextText into ChatGPT, submit, wait for streaming to finish,
 * then capture the reply.
 *
 * @param {string} contextText - the message to send
 * @param {object} opts
 * @param {boolean} [opts.newConversation=false] - navigate to home first (fresh thread)
 * @param {number|null} [opts.tabId=null]         - tab to use; auto-located if null
 * @returns {{ result: object, tabId: number }}
 */
async function sendToChatGPT(contextText, { newConversation = false, tabId = null } = {}) {
  if (!tabId) {
    const tab = await ensureChatGPTTab();
    tabId = tab.tabId;
  }

  const chain = [];
  let sid = 0;
  const s = () => `s${++sid}`;

  // Optionally navigate to a fresh conversation
  if (newConversation) {
    chain.push({ stepId: s(), action: 'navigate', url: CHATGPT_HOME, note: 'New conversation' });
    chain.push({ stepId: s(), action: 'delay', ms: 1500 });
  }

  // Detect auth wall — check both URL-redirect and the "Log in" button visible on the home
  // page when the session has expired. state='auth_required' is inspected in awaitReply().
  chain.push({
    stepId: s(), action: 'assess_state',
    stateGraph: {
      nodes: {
        auth_required: {
          signals: [
            { type: 'url_matches', pattern: 'chatgpt\\.com/auth' },
          ],
        },
        auth_required_openai: {
          signals: [
            { type: 'url_matches', pattern: 'accounts\\.openai\\.com' },
          ],
        },
        auth_required_loggedout: {
          // Both "Log in" AND "Sign up" in the page body = logged-out home page
          signals: [
            { type: 'element_text', selector: 'body', text: 'Log in' },
            { type: 'element_text', selector: 'body', text: 'Sign up' },
          ],
        },
      },
    },
    onMismatch: 'continue',
    note: 'Auth-wall check (URL redirect + login button) — inspected in awaitReply()',
  });

  chain.push({ stepId: s(), action: 'delay', ms: 500 });

  // Type and submit the context text
  chain.push({
    stepId: s(), action: 'type',
    target: 'prompt_input',
    value: contextText,
    submit: true,
    note: 'Inject context and submit',
  });

  // Two-phase completion detection:
  // Phase 1 — confirm generation has started (stop button appears); 10s timeout.
  //            If it never appears (e.g. tab is idle after a paste-less submit), fail fast.
  // Phase 2 — wait for generation to finish (stop button disappears); 180s timeout.
  chain.push({
    stepId: s(), action: 'wait_for',
    selector: "[data-testid='stop-button']",
    state: { visible: true },
    timeout: 10_000,
    note: 'Stop button appears → generation started',
  });

  chain.push({
    stepId: s(), action: 'wait_for',
    selector: "[data-testid='stop-button']",
    state: { visible: false },
    timeout: 180_000,
    note: 'Stop button gone → streaming complete',
  });

  chain.push({ stepId: s(), action: 'delay', ms: 800, note: 'React render settle' });

  // Capture the last assistant message
  chain.push({
    stepId: s(), action: 'read',
    candidates: [
      "[data-message-author-role='assistant']:last-of-type",
      "[data-message-author-role='assistant']:last-child",
    ],
    store_as: 'reply',
    note: 'Capture reply text',
  });

  const payload = {
    _meta: {
      task: 'chatgpt-character-send',
      description: 'Send Writing-Room context to ChatGPT and capture reply',
      mode: 'exploratory',
    },
    abstractTargets: {
      prompt_input: {
        description: 'ChatGPT Lexical prompt textarea',
        anchors: { ariaLabel: 'Message ChatGPT', dataTestId: 'prompt-textarea' },
        fallbackSelectors: [
          '#prompt-textarea',
          "[data-testid='prompt-textarea']",
          "[contenteditable='true'][data-lexical-editor='true']",
          "div[contenteditable='true']",
        ],
      },
    },
    chain,
  };

  const result = await runPayload(payload, tabId, SEND_TIMEOUT_MS);

  // Get the current URL of the tab (post-navigation) from the tab list
  let conversationUrl = '';
  try {
    const tabs = await listTabs();
    const tab = tabs.find(t => (t.id ?? t.tabId) === tabId);
    conversationUrl = tab?.url ?? '';
  } catch { /* URL is best-effort */ }

  return { result, tabId, conversationUrl };
}

/**
 * Extract reply from a runPayload result.
 * Raises structured errors for auth walls, empty replies, or chain failures.
 *
 * @param {object} result         - raw result from runPayload
 * @param {string} conversationUrl - current URL of the tab (fetched separately)
 * @returns {{ reply: string, conversationUrl: string }}
 */
function awaitReply(result, conversationUrl = '') {
  // Auth wall check — assess_state step carries one of the auth_required* states
  const authStep = result?.stepResults?.find(s => s.action === 'assess_state');
  if (authStep?.state?.startsWith('auth_required')) {
    const e = new Error('ChatGPT session expired — please log in to chatgpt.com');
    e.code = ERROR_CODES.NO_SESSION;
    throw e;
  }

  // Chain failure
  if (!result?.success && result?.error) {
    const isTimeout = /timeout/i.test(result.error);
    const e = new Error(result.error);
    e.code = isTimeout ? ERROR_CODES.TIMEOUT : ERROR_CODES.SEND_FAILED;
    throw e;
  }

  // Extract reply from buffer (populated by store_as: 'reply' step)
  const reply = result?.buffer?.reply ?? null;

  if (!reply) {
    const e = new Error('Chain completed but no reply text was captured');
    e.code = ERROR_CODES.REPLY_CAPTURE_FAILED;
    throw e;
  }

  return { reply, conversationUrl };
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function jsonReply(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', d => (buf += d));
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const { method } = req;
  const path = req.url?.split('?')[0] ?? '/';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (path === '/status' && method === 'GET') {
    const relay = await getRelayStatus();
    jsonReply(res, 200, { ok: true, bridge: 'chatgpt-bridge', version: '0.1', relay });
    return;
  }

  if (path === '/send' && method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { jsonReply(res, 400, { ok: false, error: 'Invalid JSON', code: ERROR_CODES.BAD_REQUEST, character: 'chatgpt' }); return; }

    const { context, newConversation = false, tabId = null } = body;
    if (!context || typeof context !== 'string' || !context.trim()) {
      jsonReply(res, 400, { ok: false, error: '`context` string is required', code: ERROR_CODES.BAD_REQUEST, character: 'chatgpt' });
      return;
    }

    // Pre-flight relay check
    const relayStatus = await getRelayStatus();
    if (!relayStatus?.ok) {
      jsonReply(res, 503, { ok: false, error: 'Relay :3333 not available', code: ERROR_CODES.RELAY_DOWN, character: 'chatgpt' });
      return;
    }
    if (!relayStatus?.extensionConnected) {
      jsonReply(res, 503, { ok: false, error: 'Chrome extension not connected to relay', code: ERROR_CODES.EXTENSION_NOT_CONNECTED, character: 'chatgpt' });
      return;
    }

    console.log(`[bridge] /send  newConversation=${newConversation}  contextLen=${context.length}  tabId=${tabId ?? 'auto'}`);

    try {
      const { result, tabId: usedTabId, conversationUrl: tabUrl } = await sendToChatGPT(context.trim(), { newConversation, tabId });
      const { reply, conversationUrl } = awaitReply(result, tabUrl);

      console.log(`[bridge] /send OK  replyLen=${reply.length}  url=${conversationUrl}`);
      jsonReply(res, 200, {
        ok: true,
        reply,
        conversationUrl,
        tabId: usedTabId,
        character: 'chatgpt',
      });
    } catch (err) {
      const code = err.code || ERROR_CODES.SEND_FAILED;
      const status = code === ERROR_CODES.NO_SESSION ? 401 : 500;
      console.error(`[bridge] /send FAIL [${code}]: ${err.message}`);
      jsonReply(res, status, { ok: false, error: err.message, code, character: 'chatgpt' });
    }
    return;
  }

  jsonReply(res, 404, { ok: false, error: 'Not found' });
});

// ── CLI test mode ─────────────────────────────────────────────────────────────

async function runTest() {
  console.log('[test] Checking relay status...');
  const status = await getRelayStatus();
  if (!status?.ok || !status?.extensionConnected) {
    console.error('[test] Relay not ready:', status);
    process.exit(1);
  }
  console.log('[test] Relay: OK, extension connected');

  const TEST_PROMPT = 'In exactly one sentence, what is the most important thing a playwright should remember when writing dialogue? Reply concisely.';
  console.log(`[test] Sending test prompt to ChatGPT:\n  "${TEST_PROMPT}"\n`);

  try {
    const { result, tabId, conversationUrl: tabUrl } = await sendToChatGPT(TEST_PROMPT, { newConversation: false });
    const { reply, conversationUrl } = awaitReply(result, tabUrl);

    console.log('=== TEST RESULT ===');
    console.log(`tabId:          ${tabId}`);
    console.log(`conversationUrl: ${conversationUrl}`);
    console.log(`reply:\n  ${reply}`);
    console.log('===================');
    console.log('[test] PASS');
  } catch (err) {
    console.error('[test] FAIL:', err.code, err.message);
    process.exit(1);
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

if (process.argv[2] === 'test') {
  runTest().catch(err => { console.error(err); process.exit(1); });
} else {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[chatgpt-bridge] Listening on http://localhost:${PORT}`);
    console.log(`[chatgpt-bridge] Relay: ${RELAY}`);
    console.log('[chatgpt-bridge] POST /send  { context, newConversation?, tabId? }');
    console.log('[chatgpt-bridge] GET  /status');
  });
  server.on('error', err => console.error('[chatgpt-bridge] Server error:', err));
}
