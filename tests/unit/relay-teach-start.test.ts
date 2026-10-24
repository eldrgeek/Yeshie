/**
 * @jest-environment node
 */

process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

const dispatchDir = mkdtempSync(join(tmpdir(), 'yeshie-relay-teach-'));
const relayToken = 'test-teach-relay-token';
writeFileSync(join(dispatchDir, 'relay.secret'), relayToken);
process.env.DISPATCH_DIR = dispatchDir;

let createRelay: any;
let relay: any;
let baseUrl: string;
let extension: ClientSocket | null = null;

const validSteps = [
  {
    stepIndex: 0,
    totalSteps: 1,
    instruction: 'Click Allow to approve access.',
    targetSelector: 'button[aria-label="Allow"]',
    highlightTarget: true,
    waitForAction: 'click',
    position: 'auto',
  },
];

function request(
  path: string,
  options: { body?: unknown; rawBody?: string; token?: string; method?: string } = {},
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token !== undefined) headers['X-Dispatch-Token'] = options.token;
    const req = http.request({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname + url.search,
      method: options.method || 'POST',
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
    if (options.rawBody !== undefined) req.write(options.rawBody);
    else if (options.body !== undefined) req.write(JSON.stringify(options.body));
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

describe('POST /teach/start', () => {
  test('requires the relay dispatch token', async () => {
    const response = await request('/teach/start', { body: { steps: validSteps } });

    expect(response.status).toBe(401);
    expect(response.data.error).toBe('Bad token');
  });

  test('validates the narrow payload before dispatch', async () => {
    const response = await request('/teach/start', {
      token: relayToken,
      body: {
        steps: validSteps,
        autoClick: true,
      },
    });

    expect(response.status).toBe(400);
    expect(response.data.error).toContain('unknown field: autoClick');
  });

  test('rejects malformed JSON', async () => {
    const response = await request('/teach/start', {
      token: relayToken,
      rawBody: '{"steps":',
    });

    expect(response.status).toBe(400);
    expect(response.data.error).toBe('Invalid JSON');
  });

  test('reports when the extension is disconnected', async () => {
    const response = await request('/teach/start', {
      token: relayToken,
      body: { steps: validSteps },
    });

    expect(response.status).toBe(503);
    expect(response.data.error).toBe('Extension not connected');
  });

  test('forwards steps and optional tabId, then returns the resolved tabId acknowledgment', async () => {
    extension = await connectExtension();
    const received = new Promise<any>(resolve => {
      extension!.on('teach_start', (payload, ack) => {
        resolve(payload);
        ack({ ok: true, tabId: 73 });
      });
    });

    const responsePromise = request('/teach/start', {
      token: relayToken,
      body: { steps: validSteps, tabId: 41 },
    });

    await expect(received).resolves.toEqual({ steps: validSteps, tabId: 41 });
    await expect(responsePromise).resolves.toEqual({
      status: 200,
      data: { ok: true, tabId: 73 },
    });
  });

  test('rejects an extension acknowledgment without a resolved tabId', async () => {
    extension = await connectExtension();
    extension.on('teach_start', (_payload, ack) => {
      ack({ ok: true });
    });

    const response = await request('/teach/start', {
      token: relayToken,
      body: { steps: validSteps },
    });

    expect(response.status).toBe(502);
    expect(response.data.error).toContain('invalid teach_start acknowledgment');
  });
});

describe('guides: POST /teach/start with url, then GET /teach/result', () => {
  const guideSteps = [
    {
      stepIndex: 0,
      totalSteps: 1,
      instruction: 'Click Export data.',
      targetSelector: 'button:has-text("Export data")',
      highlightTarget: true,
      position: 'auto',
      doneWhen: { textAppears: 'export requested' },
    },
  ];

  test('opens the url as a guide and returns its guideId', async () => {
    extension = await connectExtension();
    const received = new Promise<any>(resolve => {
      extension!.on('teach_start', (payload, ack) => {
        resolve(payload);
        ack({ ok: true, tabId: 88 });
      });
    });

    const responsePromise = request('/teach/start', {
      token: relayToken,
      body: { steps: guideSteps, url: 'https://chatgpt.com/#settings/DataControls', guideId: 'chatgpt-export', title: 'ChatGPT export', closeOnDone: true, notify: false },
    });

    await expect(received).resolves.toEqual({
      steps: guideSteps,
      url: 'https://chatgpt.com/#settings/DataControls',
      guide: { guideId: 'chatgpt-export', title: 'ChatGPT export', closeOnDone: true },
    });
    await expect(responsePromise).resolves.toEqual({
      status: 200,
      data: { ok: true, tabId: 88, guideId: 'chatgpt-export' },
    });

    const active = await request('/teach/result/chatgpt-export', { token: relayToken, method: 'GET' });
    expect(active.status).toBe(200);
    expect(active.data).toMatchObject({ guideId: 'chatgpt-export', status: 'active', tabId: 88, stepsCompleted: 0, totalSteps: 1 });
    expect(active.data.instanceId).toBeUndefined();
  });

  test('a long-poll on the result settles when the extension reports teach_done', async () => {
    extension = await connectExtension();
    extension.on('teach_start', (_payload, ack) => ack({ ok: true, tabId: 90 }));
    const started = await request('/teach/start', {
      token: relayToken,
      body: { steps: guideSteps, url: 'https://takeout.google.com/', notify: false },
    });
    expect(started.status).toBe(200);
    const guideId = started.data.guideId;
    expect(guideId).toMatch(/^g_/);

    const waiting = request(`/teach/result/${guideId}?waitMs=5000`, { token: relayToken, method: 'GET' });
    await new Promise(resolve => setTimeout(resolve, 100));
    extension.emit('teach_done', { guideId, outcome: 'done', stepsCompleted: 1, tabId: 90 });

    const settled = await waiting;
    expect(settled.status).toBe(200);
    expect(settled.data).toMatchObject({ guideId, status: 'done', stepsCompleted: 1 });
    expect(settled.data.endedAt).toEqual(expect.any(String));
  });

  test('a long-poll returns the active guide when it times out', async () => {
    extension = await connectExtension();
    extension.on('teach_start', (_payload, ack) => ack({ ok: true, tabId: 91 }));
    const started = await request('/teach/start', {
      token: relayToken,
      body: { steps: guideSteps, guideId: 'slow-guide', notify: false },
    });
    const result = await request(`/teach/result/${started.data.guideId}?waitMs=200`, { token: relayToken, method: 'GET' });
    expect(result.data.status).toBe('active');
  });

  test('refuses a second active guide with the same id', async () => {
    extension = await connectExtension();
    extension.on('teach_start', (_payload, ack) => ack({ ok: true, tabId: 92 }));
    const body = { steps: guideSteps, guideId: 'dup-guide', notify: false };
    expect((await request('/teach/start', { token: relayToken, body })).status).toBe(200);
    const again = await request('/teach/start', { token: relayToken, body });
    expect(again.status).toBe(409);
  });

  test('result needs the token and a known guide', async () => {
    expect((await request('/teach/result/nope', { method: 'GET' })).status).toBe(401);
    expect((await request('/teach/result/nope', { token: relayToken, method: 'GET' })).status).toBe(404);
  });

  test.each([
    [{ url: 'http://example.com/' }, 'url must be an https:// URL'],
    [{ url: 'https://example.com/', tabId: 4 }, 'give url or tabId, not both'],
    [{ guideId: 'bad id!' }, 'guideId must be'],
    [{ title: '<b>x</b>' }, 'title must be plain text'],
    [{ closeOnDone: 'yes' }, 'closeOnDone must be a boolean'],
  ])('validates guide field %o', async (extra, message) => {
    const response = await request('/teach/start', { token: relayToken, body: { steps: guideSteps, ...extra } });
    expect(response.status).toBe(400);
    expect(response.data.error).toContain(message);
  });

  test.each([
    [{ doneWhen: { textShows: 'x' } }, 'unknown field: textShows'],
    [{ doneWhen: {} }, 'needs one of'],
    [{ doneWhen: { urlIncludes: '' } }, 'must be a non-empty string'],
    [{ targetSelector: '' }, 'targetSelector must be a non-empty string'],
  ])('validates step %o', async (override, message) => {
    const step = { ...guideSteps[0], ...override };
    if ('targetSelector' in override) delete (step as any).doneWhen;
    const response = await request('/teach/start', { token: relayToken, body: { steps: [step] } });
    expect(response.status).toBe(400);
    expect(response.data.error).toContain(message);
  });

  test('a doneWhen step may have an empty target', async () => {
    extension = await connectExtension();
    extension.on('teach_start', (_payload, ack) => ack({ ok: true, tabId: 93 }));
    const step = { ...guideSteps[0], targetSelector: '', instruction: 'Sign in as mw@mike-wolf.com.', doneWhen: { urlIncludes: '/account' } };
    const response = await request('/teach/start', { token: relayToken, body: { steps: [step], notify: false } });
    expect(response.status).toBe(200);
  });
});
