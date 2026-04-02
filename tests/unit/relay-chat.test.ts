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
});
