#!/usr/bin/env node
// heal-monitor.js — sidecar that watches relay for failures and triggers HEAL
// Usage: node heal-monitor.js [--relay=http://localhost:3333] [--poll-ms=2000]

const RELAY = process.argv.find(a => a.startsWith('--relay='))?.split('=')[1] || 'http://localhost:3333';
const POLL_MS = parseInt(process.argv.find(a => a.startsWith('--poll-ms='))?.split('=')[1] || '2000');
const MAX_RETRIES = 3;

const failureCounts = new Map(); // `${payloadId}:${stepId}` → count
const healQueue = new Map();     // payloadId → boolean (currently healing)

let since = Date.now();

async function poll() {
  try {
    const res = await fetch(`${RELAY}/chat/logs?since=${since}`);
    if (!res.ok) return;
    const logs = await res.json();
    since = Date.now();
    
    for (const entry of logs) {
      if (entry.type !== 'step_failed') continue;
      
      const key = `${entry.payloadId}:${entry.stepId}`;
      const count = (failureCounts.get(key) || 0) + 1;
      failureCounts.set(key, count);
      
      if (count >= MAX_RETRIES) {
        failureCounts.delete(key);
        
        if (healQueue.get(entry.payloadId)) {
          console.log(`[HEAL] ${entry.payloadId} already healing — queuing ${entry.stepId}`);
          continue;
        }
        
        console.log(`[HEAL] Triggering Level 1 triage for ${entry.payloadId}:${entry.stepId}`);
        healQueue.set(entry.payloadId, true);
        
        // Fire heal agent as background process
        const { spawn } = await import('child_process');
        const healProc = spawn('node', [
          new URL('./dry-run.js', import.meta.url).pathname,
          `--payload=${entry.payloadId}`
        ], { stdio: 'pipe', detached: true });
        
        healProc.stdout.on('data', d => console.log(`[HEAL/${entry.payloadId}]`, d.toString().trim()));
        healProc.on('close', code => {
          console.log(`[HEAL/${entry.payloadId}] done (exit ${code})`);
          healQueue.delete(entry.payloadId);
        });
      }
    }
  } catch (e) {
    // Relay may be down — silent retry
  }
}

console.log(`HEAL monitor started — watching ${RELAY} every ${POLL_MS}ms`);
setInterval(poll, POLL_MS);
poll();
