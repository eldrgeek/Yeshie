#!/usr/bin/env node
// test-dry-run-all.js — run dry-run.js against every payload that has cachedSelectors
// Usage: node skills/heal/tests/test-dry-run-all.js

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { glob } from 'fs/promises';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const RELAY = process.env.RELAY_URL || 'http://localhost:3333';

async function checkRelay() {
  try {
    const res = await fetch(`${RELAY}/tabs/list`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function getAvailableTabs() {
  try {
    const res = await fetch(`${RELAY}/tabs/list`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const tabs = await res.json();
    return Array.isArray(tabs) ? tabs.filter(t => t.url && !t.url.startsWith('chrome-') && !t.url.startsWith('chrome-extension://')) : [];
  } catch {
    return [];
  }
}

function hasCachedSelectors(payload) {
  const targets = payload.abstractTargets;
  if (!targets || typeof targets !== 'object') return false;
  return Object.values(targets).some(t => t.cachedSelector);
}

async function runDryRun(payloadPath) {
  try {
    const { stdout } = await execFileAsync('node', [
      path.join(ROOT, 'skills/heal/dry-run.js'),
      payloadPath
    ], { timeout: 60000 });
    return { ok: true, stdout };
  } catch (err) {
    // exit code 1 = failures found — still parse output
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function payloadLabel(payload, relPath) {
  const task = payload._meta?.task || path.basename(relPath, '.payload.json');
  const site = payload.site || relPath.split('/')[1];
  const queryType = payload._meta?.queryType;
  const type = queryType === 'read_only' ? 'read_only' : 'mutation';
  return { task, site, type };
}

async function main() {
  const relayUp = await checkRelay();
  if (!relayUp) {
    console.log('RELAY DOWN — skipping live checks');
    process.exit(0);
  }

  const tabs = await getAvailableTabs();
  if (tabs.length === 0) {
    console.log('NO TABS AVAILABLE — relay is up but no browser tabs found; skipping live selector checks');
    process.exit(0);
  }

  // Glob all payload files
  const pattern = path.join(ROOT, 'sites/**/tasks/*.payload.json');
  const files = [];
  for await (const f of glob(pattern)) files.push(f);
  files.sort();

  const rows = [];

  for (const absPath of files) {
    const relPath = path.relative(ROOT, absPath);
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    } catch (e) {
      rows.push({ relPath, site: '?', task: relPath, type: '?', status: 'error', detail: `parse error: ${e.message}` });
      continue;
    }

    const { task, site, type } = payloadLabel(payload, relPath);

    if (!hasCachedSelectors(payload)) {
      rows.push({ relPath, site, task, type, status: 'skip', detail: 'no cachedSelectors' });
      continue;
    }

    const { ok, stdout, stderr } = await runDryRun(absPath);
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      rows.push({ relPath, site, task, type, status: 'error', detail: stderr || stdout || 'no output' });
      continue;
    }

    const status = ok ? 'pass' : 'fail';
    const detail = `${parsed.passed}p/${parsed.failed}f/${parsed.skipped}s`;
    rows.push({ relPath, site, task, type, status, detail, parsed });
  }

  // Print summary table
  const col = (s, n) => String(s).padEnd(n);
  console.log('\n' + '='.repeat(80));
  console.log(col('Payload', 40) + col('Site', 20) + col('Type', 10) + col('Result', 10) + 'Detail');
  console.log('-'.repeat(80));

  let passed = 0, failed = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const name = path.basename(r.relPath, '.payload.json');
    console.log(col(name, 40) + col(r.site, 20) + col(r.type, 10) + col(r.status, 10) + (r.detail || ''));
    if (r.status === 'pass') passed++;
    else if (r.status === 'fail') failed++;
    else if (r.status === 'skip') skipped++;
    else errors++;
  }

  console.log('='.repeat(80));
  console.log(`Total: ${passed} passed, ${failed} failed, ${skipped} skipped, ${errors} errors`);
  console.log('='.repeat(80) + '\n');

  // Export results for run-all.js integration
  const anyFailed = failed > 0 || errors > 0;
  if (anyFailed) {
    console.error('Some dry-run checks FAILED (see above)');
    process.exit(1);
  }
}

export async function getDryRunAllResults() {
  const relayUp = await checkRelay();
  if (!relayUp) {
    return { passed: 0, failed: 0, skipped: 0, note: 'relay down — skipped' };
  }

  const tabs = await getAvailableTabs();
  if (tabs.length === 0) {
    return { passed: 0, failed: 0, skipped: 0, note: 'no browser tabs available — skipped' };
  }

  const pattern = path.join(ROOT, 'sites/**/tasks/*.payload.json');
  const files = [];
  for await (const f of glob(pattern)) files.push(f);
  files.sort();

  let passed = 0, failed = 0, skipped = 0;

  for (const absPath of files) {
    let payload;
    try { payload = JSON.parse(fs.readFileSync(absPath, 'utf8')); } catch { failed++; continue; }

    if (!hasCachedSelectors(payload)) { skipped++; continue; }

    const { ok, stdout } = await runDryRun(absPath);
    try {
      const parsed = JSON.parse(stdout);
      passed += parsed.passed;
      failed += parsed.failed;
      skipped += parsed.skipped;
    } catch {
      if (ok) passed++; else failed++;
    }
  }

  return { passed, failed, skipped };
}

// Run directly (not when imported as a module)
import { createRequire } from 'module';
const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch(e => { console.error(e); process.exit(1); });
}
