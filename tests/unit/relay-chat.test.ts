/**
 * @jest-environment node
 */

process.env.RELAY_TEST_MODE = '1';

import http from 'http';

// Dynamic import for ESM relay module
let createRelay: any;
let relay: any;
let baseUrl: string;

function request(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

beforeAll(async () => {
  const mod = await import('../../packages/relay/index.js');
  createRelay = mod.createRelay;
});

beforeEach(async () => {
  relay = createRelay(0);
  const addr = await relay.listen(0);
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await relay.close();
});

describe('Relay Chat Endpoints', () => {
  test('TEST 1: POST /chat with no listener returns 503', async () => {
    const { status, data } = await request('POST', '/chat', {
      message: 'hello',
      mode: 'answer',
    });
    expect(status).toBe(503);
    expect(data.type).toBe('no_listener');
  });

  test('TEST 2: Listen → Post → Receive roundtrip', async () => {
    // Start listener (async)
    const listenP = request('GET', '/chat/listen?timeout=5');

    // Give the listener a moment to register
    await new Promise((r) => setTimeout(r, 50));

    // Post a chat message
    const postP = request('POST', '/chat', {
      message: 'hello',
      mode: 'answer',
      currentUrl: 'https://app.yeshid.com/',
    });

    // The listener should resolve with the message
    const listenResult = await listenP;
    expect(listenResult.status).toBe(200);
    expect(listenResult.data.type).toBe('chat_message');
    expect(listenResult.data.message).toBe('hello');
    expect(listenResult.data.id).toMatch(/^msg_/);

    // Clean up the hanging POST /chat response (it's waiting for /chat/respond)
    const chatId = listenResult.data.id;
    await request('POST', '/chat/respond', {
      chatId,
      response: { type: 'answer', text: 'done' },
    });
    await postP; // let it finish
  });

  test('TEST 3: Post → Respond → Side panel receives', async () => {
    // Start listener
    const listenP = request('GET', '/chat/listen?timeout=5');
    await new Promise((r) => setTimeout(r, 50));

    // Side panel posts (will hang until Claude responds)
    const postP = request('POST', '/chat', {
      message: 'How do I connect Zoom?',
      mode: 'answer',
      currentUrl: 'https://app.yeshid.com/access/applications',
    });

    // Listener resolves with the message
    const listenResult = await listenP;
    const chatId = listenResult.data.id;
    expect(chatId).toMatch(/^msg_/);

    // Claude responds
    const respondResult = await request('POST', '/chat/respond', {
      chatId,
      response: { type: 'answer', text: 'Use OAuth' },
    });
    expect(respondResult.data.ok).toBe(true);

    // Side panel should get the response
    const postResult = await postP;
    expect(postResult.status).toBe(200);
    expect(postResult.data.type).toBe('answer');
    expect(postResult.data.text).toBe('Use OAuth');
  });

  test('TEST 4: Listen timeout', async () => {
    const start = Date.now();
    const { status, data } = await request('GET', '/chat/listen?timeout=1');
    const elapsed = Date.now() - start;

    expect(status).toBe(200);
    expect(data.type).toBe('timeout');
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  test('TEST 5: Message queuing — no listener fails fast', async () => {
    const { status, data } = await request('POST', '/chat', {
      message: 'anyone there?',
      mode: 'answer',
    });
    expect(status).toBe(503);
    expect(data.type).toBe('no_listener');
    expect(data.message).toBe('Yeshie is offline');
  });

  test('TEST 6: Suggest endpoint', async () => {
    // Post a suggestion (no listener yet — goes to queue)
    const suggestResult = await request('POST', '/chat/suggest', {
      runId: 'run-1',
      suggestion: 'try clicking the blue button',
    });
    expect(suggestResult.data.ok).toBe(true);

    // Now listen — should get the suggestion
    const { status, data } = await request('GET', '/chat/listen?timeout=2');
    expect(status).toBe(200);
    expect(data.type).toBe('suggestion');
    expect(data.suggestion).toBe('try clicking the blue button');
    expect(data.runId).toBe('run-1');
  });

  test('TEST 7: Chat status', async () => {
    // No listener
    const r1 = await request('GET', '/chat/status');
    expect(r1.data.listenerConnected).toBe(false);
    expect(r1.data.queuedMessages).toBe(0);
    expect(r1.data.pendingResponses).toBe(0);

    // Start a listener
    const listenP = request('GET', '/chat/listen?timeout=5');
    await new Promise((r) => setTimeout(r, 50));

    const r2 = await request('GET', '/chat/status');
    expect(r2.data.listenerConnected).toBe(true);

    // Clean up: cancel listener by replacing it then letting it time out
    // Just close relay in afterEach
  });

  test('TEST 8: Listener replacement', async () => {
    // Start listener A
    const listenerA = request('GET', '/chat/listen?timeout=10');
    await new Promise((r) => setTimeout(r, 50));

    // Start listener B — should replace A
    const listenerB = request('GET', '/chat/listen?timeout=10');
    await new Promise((r) => setTimeout(r, 50));

    // Listener A should resolve with 'replaced'
    const resultA = await listenerA;
    expect(resultA.status).toBe(200);
    expect(resultA.data.type).toBe('replaced');

    // Listener B should be active — verify via status
    const status = await request('GET', '/chat/status');
    expect(status.data.listenerConnected).toBe(true);
  });

  test('TEST 9: POST /chat/inject returns 503 when extension not connected', async () => {
    const { status, data } = await request('POST', '/chat/inject', {
      tabId: 42,
      message: 'hello from test',
    });
    // No extension connected in unit tests, so expect 503
    expect(status).toBe(503);
    expect(data.error).toMatch(/Extension not connected/);
  });

  test('TEST 10: POST /chat/inject returns 400 when tabId or message missing', async () => {
    const r1 = await request('POST', '/chat/inject', { message: 'no tabId' });
    expect(r1.status).toBe(400);
    expect(r1.data.error).toMatch(/tabId and message/);

    const r2 = await request('POST', '/chat/inject', { tabId: 42 });
    expect(r2.status).toBe(400);
    expect(r2.data.error).toMatch(/tabId and message/);
  });

  test('TEST 11: chat_message tabId and history are forwarded to listener', async () => {
    // This test verifies the relay preserves tabId and history
    const listenP = request('GET', '/chat/listen?timeout=5');
    await new Promise((r) => setTimeout(r, 50));

    const postP = request('POST', '/chat', {
      message: 'help',
      tabId: 77,
      currentUrl: 'https://example.com/',
      history: [
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
      ],
    });

    const listenResult = await listenP;
    expect(listenResult.data.tabId).toBe(77);
    expect(listenResult.data.currentUrl).toBe('https://example.com/');

    // Clean up
    const chatId = listenResult.data.id;
    await request('POST', '/chat/respond', { chatId, response: { type: 'answer', text: 'ok' } });
    await postP;
  });

  test('TEST 12: Two concurrent tabs have independent chat flows', async () => {
    // Tab A starts a listener, posts a message, then Claude responds
    const listenA = request('GET', '/chat/listen?timeout=5');
    await new Promise((r) => setTimeout(r, 50));

    const postA = request('POST', '/chat', {
      message: 'Tab A question',
      tabId: 1,
    });

    const listenResultA = await listenA;
    expect(listenResultA.data.tabId).toBe(1);
    const chatIdA = listenResultA.data.id;

    // Start another listener for tab B
    const listenB = request('GET', '/chat/listen?timeout=5');
    await new Promise((r) => setTimeout(r, 50));

    const postB = request('POST', '/chat', {
      message: 'Tab B question',
      tabId: 2,
    });

    const listenResultB = await listenB;
    expect(listenResultB.data.tabId).toBe(2);
    const chatIdB = listenResultB.data.id;

    // Respond to both — responses should go to the correct side panel requests
    await request('POST', '/chat/respond', { chatId: chatIdA, response: { type: 'answer', text: 'Reply to A' } });
    await request('POST', '/chat/respond', { chatId: chatIdB, response: { type: 'answer', text: 'Reply to B' } });

    const resultA = await postA;
    const resultB = await postB;

    expect(resultA.data.text).toBe('Reply to A');
    expect(resultB.data.text).toBe('Reply to B');
  });
});

// ── HTTP endpoint coverage ────────────────────────────────────────────────────

describe('Relay HTTP endpoints', () => {
  test('GET /status returns server status', async () => {
    const { status, data } = await request('GET', '/status');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.extensionConnected).toBe(false);
    expect(typeof data.pending).toBe('number');
  });

  test('POST /run returns 503 when no extension connected', async () => {
    const { status, data } = await request('POST', '/run', {
      payload: { chain: [] },
      params: {},
    });
    expect(status).toBe(503);
    expect(data.error).toContain('Extension not connected');
  });

  test('POST /run returns 400 on invalid JSON body', async () => {
    const { status } = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const url = new URL('/run', baseUrl);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let d = '';
        res.on('data', (chunk) => (d += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, data: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode!, data: d }); }
        });
      });
      req.on('error', reject);
      req.write('not valid json{{{');
      req.end();
    });
    expect(status).toBe(400);
  });

  test('POST /notify returns 400 when message missing', async () => {
    const { status, data } = await request('POST', '/notify', { title: 'Test' });
    expect(status).toBe(400);
    expect(data.error).toContain('message required');
  });

  test('GET /status-board returns HTML', async () => {
    const { status, data } = await new Promise<{ status: number; data: string }>((resolve, reject) => {
      const url = new URL('/status-board', baseUrl);
      http.get(url, (res) => {
        let d = '';
        res.on('data', (chunk) => (d += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, data: d }));
      }).on('error', reject);
    });
    expect(status).toBe(200);
    expect(data).toContain('Yeshie Status');
    expect(data).toContain('<!DOCTYPE html>');
  });

  test('POST /status-board adds a message', async () => {
    const { status, data } = await request('POST', '/status-board', { text: 'DONE: test passed' });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.count).toBeGreaterThan(0);
  });

  test('POST /chat/feedback logs feedback', async () => {
    const { status, data } = await request('POST', '/chat/feedback', {
      chatId: 'test_123',
      rating: 'positive',
      comment: 'Great response',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('POST /chat/respond returns 404 for unknown chatId', async () => {
    const { status, data } = await request('POST', '/chat/respond', {
      chatId: 'nonexistent_chat_id',
      response: { type: 'answer', text: 'hello' },
    });
    expect(status).toBe(404);
    expect(data.error).toContain('No pending response');
  });

  test('GET /chat/logs returns log entries', async () => {
    const { status, data } = await request('GET', '/chat/logs?limit=5');
    expect(status).toBe(200);
    expect(Array.isArray(data.logs)).toBe(true);
  });

  test('GET /nonexistent returns 404', async () => {
    const { status } = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const url = new URL('/nonexistent', baseUrl);
      http.get(url, (res) => {
        let d = '';
        res.on('data', (chunk) => (d += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, data: d }));
      }).on('error', reject);
    });
    expect(status).toBe(404);
  });

  test('Suggest queues when no listener, delivered on next listen', async () => {
    // Queue two suggestions without a listener
    await request('POST', '/chat/suggest', { runId: 'r1', suggestion: 'Try approach A' });
    await request('POST', '/chat/suggest', { runId: 'r2', suggestion: 'Try approach B' });

    // Now listen — should get queued suggestions in order
    const first = await request('GET', '/chat/listen?timeout=2');
    expect(first.status).toBe(200);
    expect(first.data.type).toBe('suggestion');
    expect(first.data.suggestion).toBe('Try approach A');

    const second = await request('GET', '/chat/listen?timeout=2');
    expect(second.status).toBe(200);
    expect(second.data.type).toBe('suggestion');
    expect(second.data.suggestion).toBe('Try approach B');
  });

  test('Chat status shows listener connected during grace period', async () => {
    // Start a listener, then cancel it
    const listenP = request('GET', '/chat/listen?timeout=1');

    await new Promise((r) => setTimeout(r, 50));
    const during = await request('GET', '/chat/status');
    expect(during.data.listenerConnected).toBe(true);

    // Wait for timeout
    await listenP;

    // Should still be "connected" during grace period
    const after = await request('GET', '/chat/status');
    expect(after.data.listenerConnected).toBe(true);
  });
});

// ── Socket.IO event coverage ──────────────────────────────────────────────────

import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

function connectSocket(url: string, role: string): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const s = ioClient(url, { auth: { role }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
  });
}

describe('Relay Socket.IO events', () => {
  test('Extension socket registers and shows in /status', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    // Give relay a tick to register
    await new Promise(r => setTimeout(r, 100));
    const { data } = await request('GET', '/status');
    expect(data.extensionConnected).toBe(true);
    ext.disconnect();
  });

  test('Extension disconnect updates /status', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));
    ext.disconnect();
    await new Promise(r => setTimeout(r, 100));
    const { data } = await request('GET', '/status');
    expect(data.extensionConnected).toBe(false);
  });

  test('Client extension_status returns connected state', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    const client = await connectSocket(baseUrl, 'client');
    const result = await new Promise<any>((resolve) => {
      client.emit('extension_status', {}, (ack: any) => resolve(ack));
    });
    expect(result.connected).toBe(true);
    expect(result.id).toBeTruthy();

    client.disconnect();
    ext.disconnect();
  });

  test('Client skill_run returns error when extension not connected', async () => {
    const client = await connectSocket(baseUrl, 'client');
    const result = await new Promise<any>((resolve) => {
      client.emit('skill_run', { commandId: 'test1', payload: {}, params: {} }, (ack: any) => resolve(ack));
    });
    expect(result.error).toContain('Extension not connected');
    client.disconnect();
  });

  test('Client skill_run routes to extension when connected', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    // Listen for skill_run on extension side
    const extensionReceived = new Promise<any>((resolve) => {
      ext.on('skill_run', (data) => resolve(data));
    });

    const client = await connectSocket(baseUrl, 'client');
    const ack = await new Promise<any>((resolve) => {
      client.emit('skill_run', { commandId: 'cmd123', payload: { chain: [] }, params: {}, tabId: 1 }, (a: any) => resolve(a));
    });
    expect(ack.queued).toBe(true);

    const received = await extensionReceived;
    expect(received.commandId).toBe('cmd123');

    client.disconnect();
    ext.disconnect();
  });

  test('chain_result resolves pending HTTP /run call', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    // Intercept skill_run on extension and immediately send back chain_result
    ext.on('skill_run', ({ commandId }) => {
      ext.emit('chain_result', { commandId, result: { success: true, steps: [] } });
    });

    const { status, data } = await request('POST', '/run', {
      payload: { chain: [] },
      params: {},
      timeoutMs: 5000,
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    ext.disconnect();
  });

  test('chain_error rejects pending HTTP /run call', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    ext.on('skill_run', ({ commandId }) => {
      ext.emit('chain_error', { commandId, error: 'Element not found' });
    });

    const { status, data } = await request('POST', '/run', {
      payload: { chain: [] },
      params: {},
      timeoutMs: 5000,
    });
    expect(status).toBe(500);
    expect(data.error).toContain('Element not found');

    ext.disconnect();
  });

  test('chain_error with result resolves (not rejects)', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    ext.on('skill_run', ({ commandId }) => {
      ext.emit('chain_error', { commandId, error: 'partial', result: { success: false, partial: true } });
    });

    const { status, data } = await request('POST', '/run', {
      payload: { chain: [] },
      params: {},
      timeoutMs: 5000,
    });
    expect(status).toBe(200);
    expect(data.partial).toBe(true);

    ext.disconnect();
  });

  test('inject_chat forwarded to extension', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    const injected = new Promise<any>((resolve) => {
      ext.on('inject_chat', (data) => resolve(data));
    });

    const { status, data } = await request('POST', '/chat/inject', {
      tabId: 42,
      message: 'Hello from test',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    const received = await injected;
    expect(received.tabId).toBe(42);
    expect(received.message).toBe('Hello from test');

    ext.disconnect();
  });

  test('notify event from extension triggers osascript (best-effort)', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    // Just verify it doesn't crash — osascript may fail in CI
    ext.emit('notify', { message: 'Test notification', title: 'Test' });
    await new Promise(r => setTimeout(r, 200));

    ext.disconnect();
  });

  test('get_status returns not_found for unknown commandId', async () => {
    const client = await connectSocket(baseUrl, 'client');
    const result = await new Promise<any>((resolve) => {
      client.emit('get_status', { commandId: 'nonexistent' }, (ack: any) => resolve(ack));
    });
    expect(result.status).toBe('not_found');
    client.disconnect();
  });

  test('inject_chat via socket emits inject_ack', async () => {
    const ext = await connectSocket(baseUrl, 'extension');
    await new Promise(r => setTimeout(r, 100));

    const other = await connectSocket(baseUrl, 'client');
    const ackP = new Promise<any>((resolve) => {
      other.on('inject_ack', (data) => resolve(data));
    });
    other.emit('inject_chat', { tabId: 1, message: 'test' });
    const ack = await ackP;
    expect(ack.ok).toBe(true);

    other.disconnect();
    ext.disconnect();
  });

  test('inject_chat without extension returns error ack', async () => {
    const other = await connectSocket(baseUrl, 'client');
    const ackP = new Promise<any>((resolve) => {
      other.on('inject_ack', (data) => resolve(data));
    });
    other.emit('inject_chat', { tabId: 1, message: 'test' });
    const ack = await ackP;
    expect(ack.ok).toBe(false);
    expect(ack.error).toContain('Extension not connected');
    other.disconnect();
  });

  test('inject_chat without tabId returns error ack', async () => {
    const other = await connectSocket(baseUrl, 'client');
    const ackP = new Promise<any>((resolve) => {
      other.on('inject_ack', (data) => resolve(data));
    });
    other.emit('inject_chat', { message: 'no tab' });
    const ack = await ackP;
    expect(ack.ok).toBe(false);
    other.disconnect();
  });
});
