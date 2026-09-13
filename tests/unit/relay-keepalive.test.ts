/**
 * @jest-environment node
 *
 * The relay keeps idle HTTP connections open long enough that an async-run
 * poller reusing its keep-alive socket never races the server's idle close
 * (the 2026-09-13 first-poll ECONNRESET). Also checks the poll path end to end
 * over one reused socket with an idle gap longer than Node's 5s default.
 */
process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { io as ioClient } from 'socket.io-client';

let relay: any;
let port: number;
let ext: any;

beforeAll(async () => {
  const { createRelay } = await import('../../packages/relay/index.js');
  relay = createRelay(0);
  const addr = await relay.listen(0);
  port = addr.port;
  ext = ioClient(`http://127.0.0.1:${port}`, { auth: { role: 'extension', buildVersion: 'test' }, transports: ['websocket'] });
  await new Promise<void>((resolve) => ext.on('connect', () => resolve()));
  ext.on('skill_run', ({ commandId }: { commandId: string }) => {
    setTimeout(() => ext.emit('chain_result', { commandId, result: { success: true, goalReached: true, stepResults: [] } }), 50);
  });
});

afterAll(async () => {
  ext?.close();
  await relay?.close();
});

it('keeps idle connections open longer than any poll interval', () => {
  expect(relay.httpServer.keepAliveTimeout).toBeGreaterThanOrEqual(60_000);
  expect(relay.httpServer.headersTimeout).toBeGreaterThan(relay.httpServer.keepAliveTimeout);
});

function request(agent: http.Agent, method: string, path: string, body?: unknown): Promise<{ status: number; data: any; socket: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, agent, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(data), socket: res.socket }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

it('serves a poll on the same keep-alive socket after a 6s idle gap', async () => {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const submit = await request(agent, 'POST', '/run/async', { payload: { chain: [] }, timeoutMs: 10_000 });
  expect(submit.status).toBe(202);
  await new Promise((r) => setTimeout(r, 6_000));
  const poll = await request(agent, 'GET', `/run/result/${submit.data.id}`);
  expect(poll.status).toBe(200);
  expect(poll.data.status).toBe('done');
  expect(poll.socket).toBe(submit.socket);
  agent.destroy();
}, 15_000);
