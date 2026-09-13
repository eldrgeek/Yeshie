#!/usr/bin/env node
// List the Yeshie extension instances connected to the relay: one per Chrome
// profile, with its windows, tabs and any active tab leases / running jobs.
//
//   node scripts/yeshie-instances.mjs            # table
//   node scripts/yeshie-instances.mjs --no-tabs  # instances only
//   node scripts/yeshie-instances.mjs --json     # raw GET /instances
//
// Relay URL: $YESHIE_RELAY_URL, default http://127.0.0.1:3333.
// Design: docs/design/multi-connection-relay.md

const RELAY = process.env.YESHIE_RELAY_URL || 'http://127.0.0.1:3333';
const args = new Set(process.argv.slice(2));

let data;
try {
  const r = await fetch(`${RELAY}/instances`, { signal: AbortSignal.timeout(5000) });
  data = await r.json();
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
} catch (err) {
  console.error(`relay ${RELAY} not reachable or too old for /instances: ${err.message}`);
  process.exit(2);
}

if (args.has('--json')) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

const trunc = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const leaseOf = new Map((data.leases || []).map(l => [`${l.instanceId}:${l.tabId}`, l.jobId]));

console.log(`default profile: ${data.defaultProfile}   instances: ${data.instances.length}   leases: ${(data.leases || []).length}   jobs: ${(data.jobs || []).length}`);
for (const i of data.instances) {
  const tabs = Array.isArray(i.tabs) ? i.tabs : null;
  console.log('');
  console.log(`● ${i.profile}${i.isDefault ? ' (default)' : ''}  ${i.email || '(no email)'}  v${i.version || '?'}  ${i.instanceId}${i.legacy ? '  [legacy build]' : ''}`);
  console.log(`  connected ${i.connectedAt}   windows ${Array.isArray(i.windows) ? i.windows.length : '?'}   tabs ${tabs ? tabs.length : '? (not reported)'}`);
  if (!tabs || args.has('--no-tabs')) continue;
  for (const t of tabs) {
    const lease = leaseOf.get(`${i.instanceId}:${t.tabId}`);
    console.log(`  ${t.active ? '*' : ' '} tab ${String(t.tabId).padEnd(10)} win ${String(t.windowId).padEnd(10)} ${trunc(t.url, 70).padEnd(70)} ${trunc(t.title, 40)}${lease ? `  [leased by ${lease}]` : ''}`);
  }
}
