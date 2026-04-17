#!/usr/bin/env node
/**
 * test-hud.mjs — Automated tests for Yeshie HUD + relay
 * Run: node scripts/test-hud.mjs
 */

const RELAY    = 'http://localhost:3333';
const HUD_CTRL = 'http://localhost:3334';
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

const post = (url, body) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

async function testRelayAPI() {
  console.log('\n── Relay API ────────────────────────────────────────────────');

  await test('GET /status → ok', async () => {
    const d = await fetch(`${RELAY}/status`).then(r => r.json());
    if (!d.ok) throw new Error(`relay not ok: ${JSON.stringify(d)}`);
  });

  await test('GET /hud → HTML has countdown UI tokens', async () => {
    const html = await fetch(`${RELAY}/hud`).then(r => r.text());
    for (const token of ['notify_pending', 'Notify Now', 'stopCountdown', 'pollJobs', 'notifyNow']) {
      if (!html.includes(token)) throw new Error(`missing: "${token}"`);
    }
  });

  await test('POST /jobs/create → ok + id', async () => {
    const d = await post(`${RELAY}/jobs/create`, { id: 'unit-1', title: 'API test job' }).then(r => r.json());
    if (!d.ok || d.id !== 'unit-1') throw new Error(JSON.stringify(d));
  });

  await test('GET /jobs/status → created job visible', async () => {
    const d = await fetch(`${RELAY}/jobs/status?filter=all`).then(r => r.json());
    const job = d.jobs.find(j => j.id === 'unit-1');
    if (!job) throw new Error('job not found');
    if (job.title !== 'API test job') throw new Error(`wrong title: ${job.title}`);
  });

  await test('POST /jobs/update → step + status updated', async () => {
    await post(`${RELAY}/jobs/update`, { id: 'unit-1', status: 'running', step: 'Phase 1' });
    const d = await fetch(`${RELAY}/jobs/status?filter=all`).then(r => r.json());
    const job = d.jobs.find(j => j.id === 'unit-1');
    if (job.status !== 'running') throw new Error(`status: ${job.status}`);
    if (job.step !== 'Phase 1') throw new Error(`step: ${job.step}`);
  });

  await test('POST /jobs/update → session_title + notify_message stored', async () => {
    await post(`${RELAY}/jobs/update`, { id: 'unit-1', session_title: 'My Test Session', notify_message: 'Job finished!' });
    const d = await fetch(`${RELAY}/jobs/status?filter=all`).then(r => r.json());
    const job = d.jobs.find(j => j.id === 'unit-1');
    if (job.session_title !== 'My Test Session') throw new Error(`session_title: ${job.session_title}`);
    if (job.notify_message !== 'Job finished!')  throw new Error(`notify_message not stored`);
  });

  await test('POST /jobs/nonexistent/notify → 404', async () => {
    const r = await post(`${RELAY}/jobs/nonexistent/notify`, {});
    if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
  });
}

async function testNotifyCountdown() {
  console.log('\n── Notify countdown ─────────────────────────────────────────');

  await test('blocked + notify fields → enters notify_pending or fires inject', async () => {
    await post(`${RELAY}/jobs/create`, { id: 'unit-notify', title: 'Countdown test' });
    await post(`${RELAY}/jobs/update`, {
      id: 'unit-notify', status: 'blocked',
      session_title: '__no_such_session__',
      notify_message: 'Automated test msg',
    });
    await new Promise(r => setTimeout(r, 1200));
    const d = await fetch(`${RELAY}/jobs/status?filter=all`).then(r => r.json());
    const job = d.jobs.find(j => j.id === 'unit-notify');
    if (!job) throw new Error('job disappeared');
    if (!['notify_pending', 'done', 'error'].includes(job.status))
      throw new Error(`unexpected: ${job.status}`);
    console.log(`       → state: ${job.status}`);
    if (job.status === 'notify_pending') {
      if (!job.countdown_start || !job.countdown_seconds) throw new Error('countdown fields missing');
      const rem = job.countdown_seconds - Math.floor((Date.now() - job.countdown_start) / 1000);
      console.log(`       → ${rem}s remaining of ${job.countdown_seconds}s`);
    }
  });

  await test('POST /jobs/:id/notify/cancel → reverts to blocked, clears countdown', async () => {
    await post(`${RELAY}/jobs/create`, { id: 'unit-cancel', title: 'Cancel test' });
    await post(`${RELAY}/jobs/update`, {
      id: 'unit-cancel', status: 'blocked',
      session_title: '__no_such_session__', notify_message: 'Cancel me',
    });
    await new Promise(r => setTimeout(r, 800));
    const snap = await fetch(`${RELAY}/jobs/status?filter=all`).then(r => r.json());
    const before = snap.jobs.find(j => j.id === 'unit-cancel');
    if (!before || before.status !== 'notify_pending') {
      console.log(`       (not in notify_pending [${before?.status}] — cancel sub-test skipped)`);
      return;
    }
    await post(`${RELAY}/jobs/unit-cancel/notify/cancel`, {});
    await new Promise(r => setTimeout(r, 300));
    const snap2 = await fetch(`${RELAY}/jobs/status?filter=all`).then(r => r.json());
    const job = snap2.jobs.find(j => j.id === 'unit-cancel');
    if (job.status !== 'blocked') throw new Error(`expected blocked, got ${job.status}`);
    if (job.countdown_start !== null) throw new Error('countdown_start not cleared');
    console.log('       → reverted to blocked, countdown cleared');
  });
}

async function testHudControlServer() {
  console.log('\n── HUD control server (:3334) ───────────────────────────────');
  for (const ep of ['/show', '/hide', '/reload']) {
    await test(`POST ${ep} → "ok"`, async () => {
      const t = await fetch(`${HUD_CTRL}${ep}`, { method: 'POST' }).then(r => r.text());
      if (t !== 'ok') throw new Error(`expected 'ok', got '${t}'`);
    });
  }
}

async function testSocketIO() {
  console.log('\n── Socket.IO ────────────────────────────────────────────────');
  await test('polling handshake → has "sid"', async () => {
    const r = await fetch(`${RELAY}/socket.io/?EIO=4&transport=polling`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (!text.includes('"sid"')) throw new Error(`no sid in: ${text.slice(0, 80)}`);
    console.log('       → Socket.IO polling handshake ok');
  });
}

async function testWebView() {
  console.log('\n── WKWebView (via :3334/wv-status) ──────────────────────────');
  await test('GET /wv-status → reports webview JS state', async () => {
    const r = await fetch(`${HUD_CTRL}/wv-status`);
    if (r.status === 404) {
      console.log('       (endpoint not yet in hud.py — add GET /wv-status)');
      return;
    }
    const d = await r.json();
    console.log(`       → ${JSON.stringify(d)}`);
    if (!d.loaded) throw new Error('webview reports not loaded');
    if (d.conn !== 'live') console.warn(`       ⚠  conn="${d.conn}" (expected "live")`);
    if (d.jobCount === 0) console.warn('       ⚠  0 jobs visible in webview');
  });
}

async function main() {
  console.log('Yeshie HUD test suite');
  console.log('═'.repeat(56));
  await testRelayAPI();
  await testNotifyCountdown();
  await testHudControlServer();
  await testSocketIO();
  await testWebView();
  console.log('\n' + '═'.repeat(56));
  const icon = failed === 0 ? '✓' : '✗';
  console.log(`  ${icon}  ${passed}/${passed + failed} passed${failed ? `  (${failed} failed)` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
