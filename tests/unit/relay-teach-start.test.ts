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
  options: { body?: unknown; rawBody?: string; token?: string } = {},
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token !== undefined) headers['X-Dispatch-Token'] = options.token;
    const req = http.request({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname,
      method: 'POST',
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
