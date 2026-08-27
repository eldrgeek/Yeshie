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
const PROTECTED_RECIPE_RES = [
  /sites\/app\.rocketmoney\.com\/tasks\/01-list-all-recurring(?:\.payload)?\.json$/i,
  /sites\/app\.rocketmoney\.com\/tasks\/02-list-inactive(?:\.payload)?\.json$/i,
];

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

export function isProtectedRecipe(payloadPath, payload) {
  const pathStr = String(payloadPath || '').replace(/\\/g, '/');
  if (PROTECTED_RECIPE_RES.some((re) => re.test(pathStr))) return true;
  const site = String(payload?.site || '').toLowerCase();
  const task = String(payload?._meta?.task || payload?._meta?.id || '').toLowerCase();
  const isRM = site.includes('rocketmoney') || pathStr.toLowerCase().includes('rocketmoney');
  if (!isRM) return false;
  return /01-list-all-recurring|list-all-recurring/.test(`${pathStr} ${task}`)
    || /(?:^|[/\s])02-list-inactive(?:\.payload)?/.test(`${pathStr} ${task}`)
    || task === 'list-inactive';
}

export function runSucceeded(chainResult) {
  return chainResult?.success === true && chainResult?.goalReached === true;
}

function isSelfImproving(payload) {
  return payload?._meta?.selfImproving === true || payload?.selfImproving === true;
}

/**
 * True iff candidate is inside rootDir after resolving symlinks.
 * Rejects `..` escape and symlink-out-of-tree.
 */
export function isInsideRoot(candidate, rootDir) {
  if (!candidate || !rootDir) return false;
  let rootReal;
  try { rootReal = fs.realpathSync(rootDir); }
  catch { return false; }

  let childReal;
  try {
    childReal = fs.realpathSync(candidate);
  } catch {
    try {
      const parentReal = fs.realpathSync(path.dirname(path.resolve(candidate)));
      childReal = path.join(parentReal, path.basename(candidate));
    } catch {
      childReal = path.resolve(candidate);
    }
  }

  const rel = path.relative(rootReal, childReal);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function isHealAllowed({ payload, payloadPath, chainResult } = {}) {
  if (!chainResult) return { ok: false, reason: 'no_result' };
  if (!runSucceeded(chainResult)) {
    return { ok: false, reason: 'run_not_successful' };
  }
  if (!isSelfImproving(payload)) return { ok: false, reason: 'selfImproving_disabled' };
  if (isProtectedRecipe(payloadPath, payload)) return { ok: false, reason: 'protected_recipe' };
  if (!payloadPath) return { ok: false, reason: 'no_payload_path' };
  if (!fs.existsSync(payloadPath)) return { ok: false, reason: 'payload_missing' };
  return { ok: true };
}

function walkPayloadFiles(dir, acc = []) {
  if (!dir || !fs.existsSync(dir)) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPayloadFiles(full, acc);
    else if (entry.name.endsWith('.payload.json')) acc.push(full);
  }
  return acc;
}

export function resolvePayloadPath({ payloadPath, payload, sitesRoot } = {}) {
  const confined = resolveHealWritePath({ payloadPath, payload, sitesRoot });
  return confined.ok ? confined.payloadPath : null;
}

/**
 * Auto-heal write target. Only a path that realpath-resolves inside sitesRoot.
 * Client-supplied payloadPath outside that tree is ignored (path_escape).
 */
export function resolveHealWritePath({ payloadPath, payload, sitesRoot } = {}) {
  if (!sitesRoot) return { ok: false, reason: 'no_sites_root' };
  try { fs.realpathSync(sitesRoot); }
  catch { return { ok: false, reason: 'no_sites_root' }; }

  const explicit = payloadPath || payload?._meta?.payloadPath || payload?._meta?.sourcePath;
  if (explicit) {
    const tries = [];
    if (path.isAbsolute(explicit)) {
      tries.push(path.resolve(explicit));
    } else {
      tries.push(path.resolve(sitesRoot, explicit));
      tries.push(path.resolve(path.dirname(sitesRoot), explicit));
    }
    let sawInside = false;
    for (const candidate of tries) {
      if (!isInsideRoot(candidate, sitesRoot)) continue;
      sawInside = true;
      if (!fs.existsSync(candidate)) continue;
      if (!isInsideRoot(candidate, sitesRoot)) continue;
      return { ok: true, payloadPath: fs.realpathSync(candidate) };
    }
    return { ok: false, reason: sawInside ? 'payload_missing' : 'path_escape' };
  }

  const task = payload?._meta?.task;
  const site = payload?.site;
  if (!task) return { ok: false, reason: 'no_payload_path' };
  const matches = [];
  for (const file of walkPayloadFiles(sitesRoot)) {
    try {
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (doc?._meta?.task !== task) continue;
      if (site && doc.site && doc.site !== site) continue;
      if (!isInsideRoot(file, sitesRoot)) continue;
      matches.push(file);
    } catch { /* skip unreadable */ }
  }
  if (matches.length !== 1) return { ok: false, reason: 'no_payload_path' };
  return { ok: true, payloadPath: fs.realpathSync(matches[0]) };
}

export function maybeAutoHeal({ payload, payloadPath, chainResult, sitesRoot } = {}) {
  if (!runSucceeded(chainResult)) {
    return { healed: false, reason: 'run_not_successful', payloadPath: null };
  }
  const confined = resolveHealWritePath({ payloadPath, payload, sitesRoot });
  if (!confined.ok) {
    return { healed: false, reason: confined.reason, payloadPath: null };
  }
  const allowed = isHealAllowed({ payload, payloadPath: confined.payloadPath, chainResult });
  if (!allowed.ok) return { healed: false, reason: allowed.reason, payloadPath: confined.payloadPath };
  try {
    const result = applyImprovements(confined.payloadPath, chainResult);
    return {
      healed: !!result?.changed,
      reason: result?.changed ? 'applied' : (result?.reason || 'unchanged'),
      payloadPath: confined.payloadPath,
    };
  } catch (err) {
    console.warn('[heal] auto-heal failed:', err.message);
    return { healed: false, reason: 'heal_error', error: err.message, payloadPath: confined.payloadPath };
  }
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
  if (isProtectedRecipe(payloadPath)) {
    console.log('Protected recipe — no improvements applied:', payloadPath);
    return { changed: false, reason: 'protected_recipe' };
  }

  if (!runSucceeded(chainResult)) {
    console.log('Run did not complete successfully — no improvements applied.');
    console.log(`success: ${chainResult?.success}, goalReached: ${chainResult?.goalReached}`);
    if (chainResult?.guardFails) {
      console.log('Guard failures:', JSON.stringify(chainResult.guardFails, null, 2));
    }
    return { changed: false, reason: 'run_not_successful' };
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
