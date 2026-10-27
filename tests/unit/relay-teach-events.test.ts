/**
 * @jest-environment node
 */

process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

const dispatchDir = mkdtempSync(join(tmpdir(), 'yeshie-relay-teach-events-'));
const relayToken = 'test-teach-events-token';
writeFileSync(join(dispatchDir, 'relay.secret'), relayToken);
process.env.DISPATCH_DIR = dispatchDir;

let createRelay: any;
let relay: any;
let baseUrl: string;
let extension: ClientSocket | null = null;

const guideSteps = [
  {
    stepIndex: 0,
    totalSteps: 1,
    instruction: 'Click Export.',
    targetSelector: 'button',
    highlightTarget: true,
    position: 'auto',
  },
];

function request(
  path: string,
  options: { body?: unknown; token?: string; method?: string } = {},
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token !== undefined) headers['X-Dispatch-Token'] = options.token;
    const req = http.request({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function connectExtension(): Promise<ClientSocket> {
  return new Promise(resolve => {
    const socket = ioClient(baseUrl, {
      auth: { role: 'extension' },
      transports: ['websocket'],
    });
    socket.on('connect', () => resolve(socket));
  });
}

async function startGuide(): Promise<string> {
  extension = await connectExtension();
  extension.on('teach_start', (_payload, ack) => ack({ ok: true, tabId: 55 }));
  const started = await request('/teach/start', {
    token: relayToken,
    method: 'POST',
    body: { steps: guideSteps, guideId: 'events-guide', notify: false },
  });
  expect(started.status).toBe(200);
  return started.data.guideId;
}

beforeAll(async () => {
  const mod = await import('../../packages/relay/index.js');
  createRelay = mod.createRelay;
});

beforeEach(async () => {
  relay = createRelay(0);
  const address = await relay.listen(0);
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  extension?.disconnect();
  extension = null;
  await relay.close();
});

afterAll(() => {
  rmSync(dispatchDir, { recursive: true, force: true });
});

describe('GET /teach/events/:guideId', () => {
  test('requires auth', async () => {
    const res = await request('/teach/events/nope');
    expect(res.status).toBe(401);
  });

  test('long-poll returns explain and step events', async () => {
    const guideId = await startGuide();
    const waiting = request(`/teach/events/${guideId}?since=0&waitMs=5000`, { token: relayToken });
    await new Promise(r => setTimeout(r, 50));
    extension!.emit('teach_explain', {
      guideId,
      stepIndex: 0,
      text: 'already signed in',
      url: 'https://example.com/',
      snapshot: 'Title: Example',
      at: new Date().toISOString(),
    });
    extension!.emit('teach_step', { guideId, index: 0, outcome: 'already', reason: 'already done' });
    const res = await waiting;
    expect(res.status).toBe(200);
    expect(res.data.events).toHaveLength(2);
    expect(res.data.events[0].type).toBe('explain');
    expect(res.data.events[1].type).toBe('step');
    expect(res.data.next).toBe(2);
  });
});

describe('POST /teach/reply/:guideId', () => {
  test('requires auth', async () => {
    const res = await request('/teach/reply/g1', { method: 'POST', body: { stepIndex: 0 } });
    expect(res.status).toBe(401);
  });

  test('emits teach_reply to the guide instance', async () => {
    const guideId = await startGuide();
    const replyPromise = new Promise<any>(resolve => {
      extension!.once('teach_reply', payload => resolve(payload));
    });
    const res = await request(`/teach/reply/${guideId}`, {
      token: relayToken,
      method: 'POST',
      body: { stepIndex: 0, message: 'Skip this step', action: 'skip' },
    });
    expect(res.status).toBe(200);
    await expect(replyPromise).resolves.toMatchObject({
      guideId,
      stepIndex: 0,
      message: 'Skip this step',
      action: 'skip',
    });
  });

  test('refuses reply for unknown guide', async () => {
    const res = await request('/teach/reply/missing', {
      token: relayToken,
      method: 'POST',
      body: { stepIndex: 0 },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /teach/result explanations', () => {
  test('includes explanations array', async () => {
    const guideId = await startGuide();
    extension!.emit('teach_explain', {
      guideId,
      stepIndex: 0,
      text: 'help',
      url: 'https://example.com/',
      snapshot: 'snap',
      at: new Date().toISOString(),
    });
    const res = await request(`/teach/result/${guideId}?waitMs=0`, { token: relayToken });
    expect(res.data.explanations).toHaveLength(1);
    expect(res.data.explanations[0].text).toBe('help');
  });
});
