/**
 * @jest-environment node
 */

// Many extension instances (one per Chrome profile) connected to one relay:
// routing by target, refusal of ambiguous/missing targets, tab leases, and
// parallel jobs. Design: docs/design/multi-connection-relay.md

process.env.RELAY_TEST_MODE = '1';

import http from 'http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

let createRelay: any;
let relay: any;
let baseUrl: string;
let sockets: ClientSocket[] = [];

const MW = 'mw@mike-wolf.com';
const CLAUDE = 'claude@mike-wolf.com';
const PAYLOAD = { chain: [] };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Wait on observable state rather than a fixed delay, so the suite holds up on
// a loaded machine.
async function waitFor(cond: () => boolean | Promise<boolean>, what: string, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await cond()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function request(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode!, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

type FakeTab = { tabId: number; windowId: number; url: string; title?: string; active?: boolean };

// A fake extension instance: registers identity in the handshake, then reports
// its tabs the way the real extension's instance_state event does.
async function connectInstance(instanceId: string, email: string | null, tabs: FakeTab[]): Promise<ClientSocket> {
  const s = ioClient(baseUrl, {
    auth: { role: 'extension', buildVersion: '9.9.9', instanceId, profile: { email } },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(s);
  await new Promise<void>(r => s.on('connect', () => r()));
  const windowIds = [...new Set(tabs.map(t => t.windowId))];
  s.emit('instance_state', {
    windows: windowIds.map(w => ({ windowId: w, focused: true })),
    tabs: tabs.map(t => ({ title: '', active: false, ...t })),
  });
  await waitFor(async () => {
    const { data } = await request('GET', '/instances');
    const me = data.instances.find((i: any) => i.instanceId === instanceId && i.socketId === s.id);
    return !!me && Array.isArray(me.tabs) && me.tabs.length === tabs.length;
  }, `${instanceId} tab state`);
  return s;
}

// Answer every skill_run after delayMs with a result naming this instance.
function autoRespond(s: ClientSocket, name: string, delayMs = 0) {
  s.on('skill_run', ({ commandId, tabId }: any) => {
    setTimeout(() => s.emit('chain_result', { commandId, result: { success: true, goalReached: true, ranOn: name, tabId } }), delayMs);
  });
}

function recordRuns(s: ClientSocket): any[] {
  const got: any[] = [];
  s.on('skill_run', (m: any) => got.push(m));
  return got;
}

const mwTabs: FakeTab[] = [
  { tabId: 11, windowId: 1, url: 'https://github.com/eldrgeek/Yeshie', title: 'Yeshie', active: true },
  { tabId: 12, windowId: 1, url: 'https://mail.google.com/mail/u/0/', title: 'Inbox' },
];
const claudeTabs: FakeTab[] = [
  { tabId: 21, windowId: 2, url: 'https://github.com/settings/billing', title: 'Billing', active: true },
];

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
  for (const s of sockets) s.disconnect();
  sockets = [];
  await relay.close();
});

describe('two instances connected at once', () => {
  test('both profiles stay connected and are listed with their tabs', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    let mwDropped = false;
    mw.on('disconnect', () => { mwDropped = true; });
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    await sleep(150);

    expect(mwDropped).toBe(false);
    expect(mw.connected).toBe(true);
    expect(claude.connected).toBe(true);

    const { status, data } = await request('GET', '/instances');
    expect(status).toBe(200);
    const byId = Object.fromEntries(data.instances.map((i: any) => [i.instanceId, i]));
    expect(Object.keys(byId).sort()).toEqual(['inst-claude', 'inst-mw']);
    expect(byId['inst-mw'].profile).toBe('Default');
    expect(byId['inst-mw'].isDefault).toBe(true);
    expect(byId['inst-claude'].profile).toBe('Profile 3');
    expect(byId['inst-mw'].tabs.map((t: any) => t.tabId)).toEqual([11, 12]);
    expect(byId['inst-claude'].tabs.map((t: any) => t.url)).toEqual(['https://github.com/settings/billing']);

    const st = await request('GET', '/status');
    expect(st.data.extensionConnected).toBe(true);
    expect(st.data.instances).toHaveLength(2);
  });

  test('an untargeted job runs on the default profile; a profile target reaches that profile', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    autoRespond(mw, 'mw');
    autoRespond(claude, 'claude');

    const untargeted = await request('POST', '/run', { payload: PAYLOAD });
    expect(untargeted.status).toBe(200);
    expect(untargeted.data.ranOn).toBe('mw');
    expect(untargeted.data.route.profile).toBe('Default');

    const targeted = await request('POST', '/run', { payload: PAYLOAD, target: { profile: CLAUDE } });
    expect(targeted.status).toBe(200);
    expect(targeted.data.ranOn).toBe('claude');
    expect(targeted.data.route.instanceId).toBe('inst-claude');
  });

  test('a reconnect with the same instanceId replaces only that instance', async () => {
    const mwOld = await connectInstance('inst-mw', MW, mwTabs);
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    const oldDropped = new Promise<void>(r => mwOld.on('disconnect', () => r()));
    const mwNew = await connectInstance('inst-mw', MW, mwTabs);
    await oldDropped;
    await sleep(60);
    expect(claude.connected).toBe(true);
    expect(mwNew.connected).toBe(true);
    const { data } = await request('GET', '/instances');
    expect(data.instances).toHaveLength(2);
  });
});

describe('ambiguous or missing targets are refused, never guessed', () => {
  test('a site open in both profiles is refused as ambiguous, listing both', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    const mwRuns = recordRuns(mw);
    const claudeRuns = recordRuns(claude);

    const { status, data } = await request('POST', '/run', { payload: PAYLOAD, target: { site: 'github.com' } });
    expect(status).toBe(409);
    expect(data.code).toBe('ambiguous_target');
    expect(data.candidates.map((c: any) => c.profile).sort()).toEqual(['Default', 'Profile 3']);
    await sleep(80);
    expect(mwRuns).toHaveLength(0);
    expect(claudeRuns).toHaveLength(0);
  });

  test('a target naming a profile that is not connected is refused', async () => {
    await connectInstance('inst-mw', MW, mwTabs);
    const { status, data } = await request('POST', '/run', { payload: PAYLOAD, target: { profile: 'nobody@example.com' } });
    expect(status).toBe(404);
    expect(data.code).toBe('target_not_found');
  });

  test('an untargeted job is refused when only another account is connected', async () => {
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    const claudeRuns = recordRuns(claude);
    const { status, data } = await request('POST', '/run', { payload: PAYLOAD });
    expect(status).toBe(409);
    expect(data.code).toBe('default_profile_not_connected');
    await sleep(80);
    expect(claudeRuns).toHaveLength(0);
  });

  test('a site open in one profile only routes to that profile and tab', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    autoRespond(mw, 'mw');
    autoRespond(claude, 'claude');
    const { status, data } = await request('POST', '/run', { payload: PAYLOAD, target: { site: 'mail.google.com' } });
    expect(status).toBe(200);
    expect(data.ranOn).toBe('mw');
    expect(data.tabId).toBe(12);
  });
});

describe('tab leases', () => {
  test('a second job on a leased tab is refused until the first settles', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const runs = recordRuns(mw);

    const first = await request('POST', '/run/async', { payload: PAYLOAD, target: { tabId: 11 } });
    expect(first.status).toBe(202);
    await waitFor(() => runs.length === 1, 'first skill_run');

    const second = await request('POST', '/run', { payload: PAYLOAD, target: { tabId: 11 } });
    expect(second.status).toBe(409);
    expect(second.data.code).toBe('tab_leased');
    expect(second.data.heldBy).toBe(first.data.id);
    expect(runs).toHaveLength(1);

    const inst = await request('GET', '/instances');
    expect(inst.data.leases).toEqual([expect.objectContaining({ instanceId: 'inst-mw', tabId: 11, jobId: first.data.id })]);

    mw.emit('chain_result', { commandId: runs[0].commandId, result: { success: true } });
    await waitFor(async () => (await request('GET', `/run/result/${first.data.id}`)).data.status === 'done', 'first run settled');

    const third = await request('POST', '/run/async', { payload: PAYLOAD, target: { tabId: 11 } });
    expect(third.status).toBe(202);
  });

  test('a tab the extension picks itself is leased through lease_tab', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const runs = recordRuns(mw);
    await request('POST', '/run/async', { payload: PAYLOAD });
    await request('POST', '/run/async', { payload: PAYLOAD });
    await waitFor(() => runs.length === 2, 'two skill_runs');
    expect(runs[0].tabId).toBeUndefined();

    const a = await mw.timeout(2000).emitWithAck('lease_tab', { commandId: runs[0].commandId, tabId: 11 });
    const again = await mw.timeout(2000).emitWithAck('lease_tab', { commandId: runs[0].commandId, tabId: 11 });
    const b = await mw.timeout(2000).emitWithAck('lease_tab', { commandId: runs[1].commandId, tabId: 11 });
    expect(a.ok).toBe(true);
    expect(again.ok).toBe(true);
    expect(b.ok).toBe(false);
    expect(b.code).toBe('tab_leased');
  });
});

describe('parallel jobs', () => {
  test('jobs on two profiles run concurrently and each result returns to its own caller', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    const mwRuns = recordRuns(mw);
    autoRespond(claude, 'claude', 30);

    const pMw = request('POST', '/run', { payload: PAYLOAD, target: { tabId: 11 } });
    const pClaude = request('POST', '/run', { payload: PAYLOAD, target: { tabId: 21 } });

    // The claude job finishes while the mw job is still running.
    const claudeRes = await pClaude;
    expect(claudeRes.status).toBe(200);
    expect(claudeRes.data.ranOn).toBe('claude');
    expect(claudeRes.data.tabId).toBe(21);
    expect(mwRuns).toHaveLength(1);

    // Another instance cannot answer for the mw job.
    claude.emit('chain_result', { commandId: mwRuns[0].commandId, result: { success: true, ranOn: 'spoof' } });
    await sleep(50);

    mw.emit('chain_result', { commandId: mwRuns[0].commandId, result: { success: true, ranOn: 'mw', tabId: 11 } });
    const mwRes = await pMw;
    expect(mwRes.status).toBe(200);
    expect(mwRes.data.ranOn).toBe('mw');
    expect(mwRes.data.route.instanceId).toBe('inst-mw');
  });

  test('jobs on two tabs of one profile are dispatched without waiting for each other', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const runs = recordRuns(mw);
    const p11 = request('POST', '/run', { payload: PAYLOAD, target: { tabId: 11 } });
    const p12 = request('POST', '/run', { payload: PAYLOAD, target: { tabId: 12 } });
    // Both are dispatched while neither has answered.
    await waitFor(() => runs.length === 2, 'both skill_runs dispatched');
    expect(runs.map(r => r.tabId).sort()).toEqual([11, 12]);
    // Answer in reverse order; each caller still gets its own tab's result.
    for (const r of [...runs].reverse()) mw.emit('chain_result', { commandId: r.commandId, result: { success: true, tabId: r.tabId } });
    const [r11, r12] = await Promise.all([p11, p12]);
    expect(r11.data.tabId).toBe(11);
    expect(r12.data.tabId).toBe(12);
  });

  test('a disconnect fails only the jobs of that instance', async () => {
    const mw = await connectInstance('inst-mw', MW, mwTabs);
    const claude = await connectInstance('inst-claude', CLAUDE, claudeTabs);
    const mwRuns = recordRuns(mw);
    const claudeRuns = recordRuns(claude);
    const pMw = request('POST', '/run', { payload: PAYLOAD, target: { tabId: 11 } });
    const pClaude = request('POST', '/run', { payload: PAYLOAD, target: { tabId: 21 } });
    await waitFor(() => mwRuns.length === 1 && claudeRuns.length === 1, 'both skill_runs dispatched');
    mw.disconnect();
    const mwRes = await pMw;
    expect(mwRes.status).toBe(500);
    expect(mwRes.data.error).toContain('disconnected');
    claude.emit('chain_result', { commandId: claudeRuns[0].commandId, result: { success: true, ranOn: 'claude' } });
    const claudeRes = await pClaude;
    expect(claudeRes.status).toBe(200);
    expect(claudeRes.data.ranOn).toBe('claude');
  });
});
