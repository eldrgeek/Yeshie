/**
 * @jest-environment node
 */

process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const dispatchDir = mkdtempSync(join(tmpdir(), 'yeshie-pulse-voice-'));
process.env.DISPATCH_DIR = dispatchDir;

let relay: any;
let baseUrl: string;

function request(path: string, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(raw) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

beforeAll(async () => {
  const { createRelay } = await import('../../packages/relay/index.js');
  relay = createRelay(0);
  const address = await relay.listen(0);
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => relay.close());

test('voice endpoint queues a named Codex turn and exposes it in conversation', async () => {
  const sent = await request('/pulse/voice/turn', { text: 'Codex, assess the plan' });
  expect(sent.status).toBe(200);
  expect(sent.data).toMatchObject({ mode: 'conversation', recipient: 'codex' });

  const entry = JSON.parse(readFileSync(join(dispatchDir, 'inbox.jsonl'), 'utf8').trim());
  expect(entry).toMatchObject({
    body: 'assess the plan',
    source: 'pulse-glasses',
    recipient: 'codex',
    voice: true,
  });

  const thread = await request('/dispatch/conversation');
  expect(thread.data.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'mike', body: 'assess the plan', source: 'pulse-glasses' }),
  ]));
});

test('dispatch mode submits work and creates a speakable acknowledgement', async () => {
  const dispatcher = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => raw += chunk);
    req.on('end', () => {
      const body = JSON.parse(raw);
      expect(body).toMatchObject({ text: 'fix the tests', target: 'code', source: 'pulse-glasses' });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'job-123', state: 'queued', resolved_target: 'code' }));
    });
  });
  await new Promise<void>((resolve) => dispatcher.listen(0, '127.0.0.1', resolve));
  const address = dispatcher.address() as any;
  process.env.PULSE_DISPATCH_URL = `http://127.0.0.1:${address.port}/dispatch`;

  try {
    const sent = await request('/pulse/voice/turn', { text: 'Dispatch to code: fix the tests' });
    expect(sent.status).toBe(202);
    expect(sent.data).toMatchObject({ mode: 'dispatch', recipient: 'dispatcher' });

    const thread = await request(`/dispatch/conversation?since=${encodeURIComponent(sent.data.timestamp)}`);
    expect(thread.data.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'dispatcher',
        speaker: 'Dispatcher',
        body: 'Dispatched to code. Job job-123.',
        in_reply_to: sent.data.timestamp,
      }),
    ]));
  } finally {
    await new Promise<void>((resolve, reject) => dispatcher.close((error) => error ? reject(error) : resolve()));
    delete process.env.PULSE_DISPATCH_URL;
  }
});
