#!/usr/bin/env node
/**
 * Yeshie Self-Improvement Merge Script
 *
 * Reads a ChainResult from a completed payload run and merges model updates
 * back into the payload file and its sibling site model.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_CACHED_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GENERATED_ID_RE = /^(input-v-\d+|checkbox-v-\d+|_react_|react-\d+|:r)/;

function normalizeResolvedTargetUpdate(update = {}) {
  const resolvedVia = update.resolvedVia || update.resolutionMethod || 'escalate';
  const resolvedOn = update.resolvedOn || update.cachedAt || new Date().toISOString();
  return {
    selector: update.selector ?? null,
    confidence: update.confidence ?? 0,
    resolvedVia,
    resolvedOn,
    resolutionMethod: resolvedVia,
  };
}

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function deriveAnchors(rawUpdate = {}) {
  const anchors = { ...(rawUpdate.anchors || {}) };
  const selector = typeof rawUpdate.selector === 'string' ? rawUpdate.selector : '';
  let match;

  match = selector.match(/^\[aria-label="([^"]+)"\]$/);
  if (match && !anchors.ariaLabel) anchors.ariaLabel = match[1];

  match = selector.match(/^[a-z0-9_-]+\[placeholder="([^"]+)"\]$/i);
  if (match && !anchors.placeholder) anchors.placeholder = match[1];

  match = selector.match(/^[a-z0-9_-]+\[name="([^"]+)"\]$/i);
  if (match && !anchors.name) anchors.name = match[1];

  match = selector.match(/^\[data-testid="([^"]+)"\]$/);
  if (match && !anchors.dataTestId) anchors.dataTestId = match[1];

  match = selector.match(/^#([A-Za-z][\w:-]*)$/);
  if (match && !GENERATED_ID_RE.test(match[1]) && !anchors.id) anchors.id = match[1];

  return Object.keys(anchors).length > 0 ? anchors : undefined;
}

function resolveSiteModelPath(payloadPath) {
  const taskDir = path.dirname(payloadPath);
  const siteDir = path.dirname(taskDir);
  return path.join(siteDir, 'site.model.json');
}

/**
 * Merge a single resolved target into an abstractTargets registry.
 * Higher confidence wins. Stale entries (> 30 days) are always replaced.
 */
export function mergeTarget(registry, targetName, rawUpdate) {
  const existing = registry[targetName];
  if (!existing) return false;

  const update = normalizeResolvedTargetUpdate(rawUpdate || {});
  const derivedAnchors = deriveAnchors(rawUpdate || {});
  const now = Date.now();
  const existingResolvedOn = existing.resolvedOn || existing.cachedAt;
  const resolvedOnMs = existingResolvedOn ? new Date(existingResolvedOn).getTime() : 0;
  const isStale = !resolvedOnMs || (now - resolvedOnMs) > MAX_CACHED_AGE_MS;

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
      resolvedOn: update.resolvedOn,
      resolutionMethod: update.resolutionMethod,
      resolvedVia: update.resolvedVia,
      ...(derivedAnchors ? { anchors: { ...(existing.anchors || {}), ...derivedAnchors } } : {}),
    };
    return true;
  }

  console.log(`  ~ ${targetName}: keeping existing (${(existing.cachedConfidence || 0).toFixed(2)} ≥ ${update.confidence.toFixed(2)})`);
  return false;
}

/**
 * Merge observed response signatures into the site model's observedResponseSignatures.
 */
export function mergeResponseSignatures(siteModel, stepId, observed) {
  if (!siteModel.observedResponseSignatures) {
    siteModel.observedResponseSignatures = {};
  }
  const key = `step-${stepId}-observed`;
  siteModel.observedResponseSignatures[key] = {
    description: `Observed from step ${stepId} during successful run`,
    observedAt: new Date().toISOString(),
    signals: observed,
  };
  console.log(`  ✓ Recorded response signature for step ${stepId}`);
}

export function applyImprovements(payloadPath, chainResult) {
  const succeeded =
    chainResult?.goalReached === true ||
    chainResult?.success === true ||
    chainResult?.event === 'chain_complete';

  if (!succeeded) {
    console.log('Run did not complete successfully — no improvements applied.');
    console.log(`Event: ${chainResult.event}, goalReached: ${chainResult.goalReached}`);
    if (chainResult.guardFails) {
      console.log('Guard failures:', JSON.stringify(chainResult.guardFails, null, 2));
    }
    return { changed: false };
  }

  console.log(`\nApplying improvements from successful run (${chainResult.durationMs}ms)...\n`);

  const payload = loadJSON(payloadPath);
  payload._meta = payload._meta || {};
  const siteModelPath = resolveSiteModelPath(payloadPath);
  const siteModel = fs.existsSync(siteModelPath) ? loadJSON(siteModelPath) : null;
  const updates = chainResult.modelUpdates || {};
  const resolvedTargets = updates.resolvedTargets || {};
  const signaturesObserved = updates.signaturesObserved || updates.observedResponseSignatures || {};

  if (Object.keys(resolvedTargets).length > 0) {
    console.log('Updating abstractTargets in payload:');
    for (const [targetName, update] of Object.entries(resolvedTargets)) {
      if (payload.abstractTargets?.[targetName]) {
        mergeTarget(payload.abstractTargets, targetName, update);
      }
    }
  }

  if (siteModel && Object.keys(resolvedTargets).length > 0) {
    console.log('\nUpdating abstractTargets in site model:');
    for (const [targetName, update] of Object.entries(resolvedTargets)) {
      if (siteModel.abstractTargets?.[targetName]) {
        mergeTarget(siteModel.abstractTargets, targetName, update);
      }
    }
  }

  if (siteModel && Object.keys(signaturesObserved).length > 0) {
    console.log('\nRecording response signatures:');
    for (const [stepId, observed] of Object.entries(signaturesObserved)) {
      mergeResponseSignatures(siteModel, stepId, observed);
    }
  }

  payload._meta.runCount = (payload._meta.runCount || 0) + 1;
  payload._meta.lastSuccess = new Date().toISOString();
  payload._meta.lastDurationMs = chainResult.durationMs;

  if (payload._meta.runCount >= 5 && payload.mode === 'verification') {
    console.log('\n↑ Upgrading mode: verification → production (5+ successful runs)');
    payload.mode = 'production';
  }

  saveJSON(payloadPath, payload);
  console.log(`\n✓ Saved updated payload: ${payloadPath}`);

  if (siteModel) {
    siteModel._meta = siteModel._meta || {};
    siteModel._meta.lastUpdated = new Date().toISOString();
    saveJSON(siteModelPath, siteModel);
    console.log(`✓ Saved updated site model: ${siteModelPath}`);
  }

  console.log('\n─── Improvement Summary ─────────────────────────────');
  console.log(`Payload run count: ${payload._meta.runCount}`);
  console.log(`Execution mode: ${payload.mode}`);
  const cachedTargets = Object.values(payload.abstractTargets || {}).filter((t) => t.cachedSelector).length;
  const totalTargets = Object.keys(payload.abstractTargets || {}).length;
  console.log(`Cached targets: ${cachedTargets}/${totalTargets}`);
  console.log('─────────────────────────────────────────────────────\n');

  return { changed: true, payloadPath, siteModelPath: siteModel ? siteModelPath : null };
}

function loadChainResult(resultArg) {
  if (resultArg.endsWith('.json') && fs.existsSync(resultArg)) {
    return loadJSON(resultArg);
  }
  return JSON.parse(resultArg);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node improve.js <payload-file> <chain-result-json-or-file>');
    process.exit(1);
  }

  const payloadPath = path.resolve(args[0]);
  const chainResult = loadChainResult(args[1]);
  applyImprovements(payloadPath, chainResult);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
