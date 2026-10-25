/**
 * @jest-environment node
 */

process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

const dispatchDir = mkdtempSync(join(tmpdir(), 'yeshie-relay-trace-'));
const relayToken = 'test-trace-relay-token';
writeFileSync(join(dispatchDir, 'relay.secret'), relayToken);
process.env.DISPATCH_DIR = dispatchDir;

let createRelay: any;
let relay: any;
let baseUrl: string;
let extension: ClientSocket | null = null;

function request(path: string, options: { body?: unknown; token?: string; method?: string } = {}): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token !== undefined) headers['X-Dispatch-Token'] = options.token;
    const req = http.request({ hostname: url.hostname, port: Number(url.port), path: url.pathname, method: options.method || 'POST', headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(data) }); } catch { resolve({ status: res.statusCode!, data }); }
      });
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(JSON.stringify(options.body));
    req.end();
  });
}

const event = (episode_id: string, extra: object = {}) => ({
  event_type: 'click', episode_id, ts: '2026-10-25T12:00:00.000Z', url: 'https://zoom.us/profile',
  target: { role: 'link', name: 'Edit' }, ...extra,
});

beforeAll(async () => {
  createRelay = (await import('../../packages/relay/index.js')).createRelay;
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

describe('Do-It-Once traces', () => {
  test('POST /trace appends events to DISPATCH_DIR/traces/<episode>.jsonl', async () => {
    expect((await request('/trace', { body: event('ep-1') })).data).toEqual({ ok: true, stored: 1 });
    expect((await request('/trace', { body: [event('ep-1'), event('ep-1')] })).data.stored).toBe(2);
    const lines = readFileSync(join(dispatchDir, 'traces', 'ep-1.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
  });

  test('rejects an event without a safe episode id', async () => {
    const res = await request('/trace', { body: event('../../etc/passwd') });
    expect(res.status).toBe(400);
    expect(existsSync(join(dispatchDir, 'etc'))).toBe(false);
  });

  test('reading traces needs the dispatch token', async () => {
    await request('/trace', { body: event('ep-2') });
    expect((await request('/trace/ep-2', { method: 'GET' })).status).toBe(401);
    const one = await request('/trace/ep-2', { method: 'GET', token: relayToken });
    expect(one.data.events[0].target.name).toBe('Edit');
    const list = await request('/trace', { method: 'GET', token: relayToken });
    expect(list.data.traces.map((t: any) => t.episodeId)).toContain('ep-2');
    expect((await request('/trace/nope', { method: 'GET', token: relayToken })).status).toBe(404);
  });

  test('POST /trace/toggle asks the extension to start recording', async () => {
    extension = await new Promise<ClientSocket>(resolve => {
      const socket = ioClient(baseUrl, { auth: { role: 'extension' }, transports: ['websocket'] });
      socket.on('connect', () => resolve(socket));
    });
    extension.on('record_toggle', (ack: (r: any) => void) => ack({ active: true, episodeId: 'ep-3' }));
    const res = await request('/trace/toggle', { token: relayToken, body: {} });
    expect(res.data).toEqual({ ok: true, active: true, episodeId: 'ep-3' });
  });
});
