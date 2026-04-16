#!/usr/bin/env node
// heal-status.js — scan all payloads for _heal metadata and poll relay for recent failures
// Usage: node skills/heal/heal-status.js
// Output: JSON to stdout + writes skills/heal/status-cache.json

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const RELAY = process.env.RELAY_URL || 'http://localhost:3333';
const RECENT_HOURS = 24;
const RECENT_MS = RECENT_HOURS * 60 * 60 * 1000;

function findPayloads(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        results.push(...findPayloads(full));
      } else if (entry.endsWith('.payload.json')) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

async function pollRelay() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${RELAY}/chat/logs?since=0`, { signal: controller.signal });
    if (!res.ok) return { up: false, logs: [] };
    const logs = await res.json();
    clearTimeout(timeout);
    return { up: true, logs: Array.isArray(logs) ? logs : [] };
  } catch {
    clearTimeout(timeout);
    return { up: false, logs: [] };
  }
}

function extractId(filePath) {
  const rel = relative(REPO_ROOT, filePath);
  return rel.replace(/\.payload\.json$/, '').replace(/\//g, '/');
}

async function main() {
  const payloadFiles = findPayloads(join(REPO_ROOT, 'sites'));
  const { up: relayUp, logs } = await pollRelay();

  // Count recent step_failed events per payload
  const now = Date.now();
  const failureCounts = {};
  for (const log of logs) {
    if (log.event !== 'step_failed') continue;
    const age = now - (log.timestamp || 0);
    if (age > RECENT_MS) continue;
    const key = log.payloadId || 'unknown';
    failureCounts[key] = (failureCounts[key] || 0) + 1;
  }

  const payloads = payloadFiles.map(filePath => {
    const id = extractId(filePath);
    let heal = null;
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      heal = raw._heal || null;
    } catch {}
    return {
      id,
      path: relative(REPO_ROOT, filePath),
      lastHealedAt: heal?.healedAt || null,
      lastVerdict: heal?.verdict || null,
      lastBackup: heal?.lastBackup || null,
      recentFailures: failureCounts[id] || 0
    };
  });

  const recentCutoff = now - RECENT_MS;
  const summary = {
    total: payloads.length,
    neverHealed: payloads.filter(p => !p.lastHealedAt).length,
    healedRecently: payloads.filter(p => p.lastHealedAt && new Date(p.lastHealedAt).getTime() > recentCutoff).length,
    escalated: payloads.filter(p => p.lastVerdict === 'L3').length
  };

  const output = {
    generatedAt: new Date().toISOString(),
    relayUp,
    payloads,
    summary
  };

  const json = JSON.stringify(output, null, 2);
  process.stdout.write(json + '\n');

  const cachePath = join(__dirname, 'status-cache.json');
  writeFileSync(cachePath, json);
  process.stderr.write(`Wrote ${cachePath}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
