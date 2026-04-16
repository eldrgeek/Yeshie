#!/usr/bin/env node
// dry-run.js — verify payload selectors resolve without executing actions
// Usage: node dry-run.js <payload-path> [--tab-id=N]

import fs from 'fs';
import path from 'path';

const payloadPath = process.argv[2];
if (!payloadPath) { console.error('Usage: dry-run.js <payload-path>'); process.exit(1); }

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const RELAY = process.env.RELAY_URL || 'http://localhost:3333';

async function resolveSelector(tabId, selector) {
  // Use resolveSelector logic (handles :has-text() via extension)
  const res = await fetch(`${RELAY}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tabId,
      action: 'resolve_selector',
      selector,
      dryRun: true
    })
  });
  return res.json();
}

async function getTabId() {
  const res = await fetch(`${RELAY}/tabs/list`);
  const tabs = await res.json();
  // Find first non-extension tab
  const tab = tabs.find(t => t.url && !t.url.startsWith('chrome-') && !t.url.startsWith('chrome-extension://'));
  return tab?.tabId ?? tab?.id;
}

async function runDryRun() {
  const tabId = process.argv.find(a => a.startsWith('--tab-id='))?.split('=')[1] || await getTabId();
  if (!tabId) { console.error('No tab found'); process.exit(1); }

  const results = [];
  const steps = payload.chain || [];

  for (const step of steps) {
    if (!step.target) { results.push({ stepId: step.id, status: 'skip', reason: 'no_target' }); continue; }

    const target = payload.abstractTargets?.[step.target];
    if (!target) { results.push({ stepId: step.id, status: 'fail', reason: 'target_not_in_abstractTargets' }); continue; }

    try {
      const resolved = await resolveSelector(tabId, target.cachedSelector);
      if (resolved.found) {
        results.push({ stepId: step.id, status: 'pass', selector: target.cachedSelector });
      } else {
        // Try fallbacks
        let fallbackPassed = false;
        for (const fb of (target.fallbacks || [])) {
          const fbResolved = await resolveSelector(tabId, fb);
          if (fbResolved.found) {
            results.push({ stepId: step.id, status: 'pass_via_fallback', selector: fb });
            fallbackPassed = true; break;
          }
        }
        if (!fallbackPassed) {
          results.push({ stepId: step.id, status: 'fail', reason: 'selector_not_found', tried: [target.cachedSelector, ...(target.fallbacks||[])] });
        }
      }
    } catch (e) {
      results.push({ stepId: step.id, status: 'error', error: e.message });
    }
  }

  const passed = results.filter(r => r.status.startsWith('pass')).length;
  const failed = results.filter(r => r.status === 'fail' || r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log(JSON.stringify({ payload: path.basename(payloadPath), passed, failed, skipped, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

runDryRun().catch(e => { console.error(e); process.exit(1); });
