#!/usr/bin/env node
/**
 * Yeshie Self-Improvement Merge Script
 *
 * Reads a ChainResult from a completed payload run and merges the modelUpdates
 * back into the payload file and site model. This is the "recursive" part of
 * the recursive self-improving model — each execution makes the next one faster
 * and more reliable.
 *
 * Usage:
 *   node improve.js <payload-file> <chain-result-json>
 *   node improve.js sites/yeshid/tasks/01-user-add.payload.json '{"event":"chain_complete","goalReached":true,"modelUpdates":{...}}'
 *
 * Or pipe from a runtime:
 *   yeshie-runtime execute 01-user-add.payload.json | node improve.js sites/yeshid/tasks/01-user-add.payload.json
 */

const fs = require('fs');
const path = require('path');

const SITE_MODEL_PATH = path.join(__dirname, 'sites/yeshid/site.model.json');
const MAX_CACHED_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Merge a single resolved target into an abstractTargets registry.
 * Higher confidence wins. Stale entries (> 30 days) are always replaced.
 */
function mergeTarget(registry, targetName, update) {
  const existing = registry[targetName];
  if (!existing) return; // Only update targets already in the registry

  const now = Date.now();
  const cachedAt = existing.cachedAt ? new Date(existing.cachedAt).getTime() : 0;
  const isStale = (now - cachedAt) > MAX_CACHED_AGE_MS;

  const shouldUpdate =
    isStale ||
    !existing.cachedSelector ||
    (update.confidence > (existing.cachedConfidence || 0));

  if (shouldUpdate) {
    console.log(`  ✓ ${targetName}: ${existing.cachedSelector || '(none)'} → ${update.selector} (${update.confidence.toFixed(2)})`);
    registry[targetName] = {
      ...existing,
      cachedSelector: update.selector,
      cachedConfidence: update.confidence,
      cachedAt: new Date().toISOString(),
      resolutionMethod: update.resolutionMethod || 'unknown'
    };
  } else {
    console.log(`  ~ ${targetName}: keeping existing (${existing.cachedConfidence.toFixed(2)} ≥ ${update.confidence.toFixed(2)})`);
  }
}

/**
 * Merge observed response signatures into the site model's observedResponseSignatures.
 */
function mergeResponseSignatures(siteModel, stepId, observed) {
  if (!siteModel.observedResponseSignatures) {
    siteModel.observedResponseSignatures = {};
  }
  const key = `step-${stepId}-observed`;
  siteModel.observedResponseSignatures[key] = {
    description: `Observed from step ${stepId} during successful run`,
    observedAt: new Date().toISOString(),
    signals: observed
  };
  console.log(`  ✓ Recorded response signature for step ${stepId}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node improve.js <payload-file> <chain-result-json-or-file>');
    process.exit(1);
  }

  const payloadPath = path.resolve(args[0]);
  let chainResult;

  // Accept JSON string or file path
  const resultArg = args[1];
  if (resultArg.endsWith('.json') && fs.existsSync(resultArg)) {
    chainResult = loadJSON(resultArg);
  } else {
    chainResult = JSON.parse(resultArg);
  }

  // Only improve on successful runs
  if (chainResult.event !== 'chain_complete' || !chainResult.goalReached) {
    console.log('Run did not complete successfully — no improvements applied.');
    console.log(`Event: ${chainResult.event}, goalReached: ${chainResult.goalReached}`);
    if (chainResult.guardFails) {
      console.log('Guard failures:', JSON.stringify(chainResult.guardFails, null, 2));
    }
    process.exit(0);
  }

  console.log(`\nApplying improvements from successful run (${chainResult.durationMs}ms)...\n`);

  // Load files
  const payload = loadJSON(payloadPath);
  const siteModel = fs.existsSync(SITE_MODEL_PATH) ? loadJSON(SITE_MODEL_PATH) : null;

  const updates = chainResult.modelUpdates || {};

  // 1. Update abstractTargets in the payload file
  if (updates.resolvedTargets && Object.keys(updates.resolvedTargets).length > 0) {
    console.log('Updating abstractTargets in payload:');
    for (const [targetName, update] of Object.entries(updates.resolvedTargets)) {
      if (payload.abstractTargets?.[targetName]) {
        mergeTarget(payload.abstractTargets, targetName, update);
      }
    }
  }

  // 2. Update abstractTargets in site model (cross-payload sharing)
  if (siteModel && updates.resolvedTargets && Object.keys(updates.resolvedTargets).length > 0) {
    console.log('\nUpdating abstractTargets in site model:');
    for (const [targetName, update] of Object.entries(updates.resolvedTargets)) {
      if (siteModel.abstractTargets?.[targetName]) {
        mergeTarget(siteModel.abstractTargets, targetName, update);
      }
    }
  }

  // 3. Record observed response signatures in site model
  if (siteModel && updates.observedResponseSignatures) {
    console.log('\nRecording response signatures:');
    for (const [stepId, observed] of Object.entries(updates.observedResponseSignatures)) {
      mergeResponseSignatures(siteModel, stepId, observed);
    }
  }

  // 4. Update run metadata
  payload._meta.runCount = (payload._meta.runCount || 0) + 1;
  payload._meta.lastSuccess = new Date().toISOString();
  payload._meta.lastDurationMs = chainResult.durationMs;

  // 5. Auto-upgrade mode if consistently successful
  if (payload._meta.runCount >= 5 && payload.mode === 'verification') {
    console.log('\n↑ Upgrading mode: verification → production (5+ successful runs)');
    payload.mode = 'production';
  }

  // 6. Save
  saveJSON(payloadPath, payload);
  console.log(`\n✓ Saved updated payload: ${payloadPath}`);

  if (siteModel) {
    siteModel._meta.lastUpdated = new Date().toISOString();
    saveJSON(SITE_MODEL_PATH, siteModel);
    console.log(`✓ Saved updated site model: ${SITE_MODEL_PATH}`);
  }

  // 7. Summary
  console.log('\n─── Improvement Summary ─────────────────────────────');
  console.log(`Payload run count: ${payload._meta.runCount}`);
  console.log(`Execution mode: ${payload.mode}`);
  const cachedTargets = Object.values(payload.abstractTargets || {}).filter(t => t.cachedSelector).length;
  const totalTargets = Object.keys(payload.abstractTargets || {}).length;
  console.log(`Cached targets: ${cachedTargets}/${totalTargets}`);
  console.log('─────────────────────────────────────────────────────\n');
}

main();
