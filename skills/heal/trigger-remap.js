#!/usr/bin/env node
// trigger-remap.js — trigger site-mapper via Hermes and wait for completion
// Usage: node trigger-remap.js <site-id> [--urls=url1,url2] [--timeout=300]

import { randomUUID } from 'crypto';

const siteId = process.argv[2];
if (!siteId) { console.error('Usage: trigger-remap.js <site-id>'); process.exit(1); }

const urlArg = process.argv.find(a => a.startsWith('--urls='))?.split('=')[1];
const urls = urlArg ? urlArg.split(',') : [];
const timeout = parseInt(process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1] || '300') * 1000;

const HERMES = process.env.HERMES_URL || 'http://localhost:3333';
const correlationId = randomUUID();

console.log(`Triggering remap for ${siteId}, correlationId: ${correlationId}`);

// Publish site-map/request
const res = await fetch(`${HERMES}/hermes/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'yeshie/site-map/request',
    payload: { correlationId, requestedBy: 'heal-agent', siteId, urls, force: false }
  })
}).catch(() => null);

if (!res?.ok) {
  console.error('Hermes publish failed — relay may not support Hermes events yet');
  console.error('Falling back: run site-mapper manually, then re-run HEAL');
  process.exit(1);
}

// Poll for site-map/updated with matching correlationId
const deadline = Date.now() + timeout;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 3000));
  const eventsRes = await fetch(`${HERMES}/hermes/poll?channel=yeshie/site-map/updated&since=${Date.now()-5000}`).catch(() => null);
  if (!eventsRes?.ok) continue;
  const events = await eventsRes.json().catch(() => []);
  const match = events.find(e => e.correlationId === correlationId);
  if (match) {
    console.log(JSON.stringify({ status: 'completed', siteId, mapFile: match.outputFile, correlationId }));
    process.exit(0);
  }
}
console.error(`Timeout waiting for site-map/updated (${timeout/1000}s)`);
process.exit(1);
