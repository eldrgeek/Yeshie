#!/usr/bin/env node
// regenerate-step.js — use LLM reasoning to match a broken step to a new site map
// Usage: node regenerate-step.js <payload-path> <step-id> <new-map-path>

import { readFileSync, writeFileSync } from 'fs';

const payloadPath = process.argv[2];
const stepId = process.argv[3];
const newMapPath = process.argv[4];

if (!payloadPath || !stepId || !newMapPath) {
  console.error('Usage: regenerate-step.js <payload-path> <step-id> <new-map-path>');
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
const newMap = JSON.parse(readFileSync(newMapPath, 'utf8'));

const step = payload.steps?.find(s => s.id === stepId);
if (!step) { console.error(`Step ${stepId} not found`); process.exit(1); }

const targetName = step.abstractTarget;
const oldTarget = payload.abstractTargets?.[targetName];

// Build a candidate list from the new map
const candidates = [];
for (const [pagePath, page] of Object.entries(newMap.pages || {})) {
  for (const [selName, sel] of Object.entries(page.selectors || {})) {
    candidates.push({ name: selName, selector: sel.selector, fallbacks: sel.fallbacks||[], page: pagePath, stabilityTier: sel.stabilityTier });
  }
  for (const field of (page.fields || [])) {
    candidates.push({ name: field.label, selector: field.selector, fallbacks: field.fallbacks||[], page: pagePath, type: 'field', required: field.required });
  }
  for (const action of (page.actions || [])) {
    candidates.push({ name: action.label, selector: action.selector, fallbacks: action.fallbacks||[], page: pagePath, type: 'action' });
  }
}

// Score candidates
function levenshtein(a, b) {
  const dp = Array.from({length: a.length+1}, (_,i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function score(candidate) {
  const oldName = (oldTarget?.description || targetName).toLowerCase();
  const newName = candidate.name.toLowerCase();
  const dist = levenshtein(oldName, newName);
  const maxLen = Math.max(oldName.length, newName.length);
  const labelSimilarity = 1 - (dist / maxLen);
  
  // Selector overlap bonus
  const oldSelectors = new Set([oldTarget?.cachedSelector, ...(oldTarget?.fallbacks||[])].filter(Boolean));
  const selectorOverlap = [candidate.selector, ...candidate.fallbacks].some(s => oldSelectors.has(s)) ? 0.3 : 0;
  
  // Action type match bonus
  const actionMatch = (step.action === 'click' && candidate.type === 'action') ? 0.1 :
                      (step.action === 'type' && candidate.type === 'field') ? 0.1 : 0;
  
  return Math.min(1.0, labelSimilarity * 0.6 + selectorOverlap + actionMatch);
}

const scored = candidates.map(c => ({ ...c, confidence: score(c) }))
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 5);

const best = scored[0];
const result = {
  stepId,
  oldTarget: targetName,
  oldSelector: oldTarget?.cachedSelector,
  bestMatch: best,
  topCandidates: scored,
  verdict: best.confidence >= 0.75 ? 'auto_heal' : best.confidence >= 0.50 ? 'low_confidence_heal' : 'escalate',
  healConfidence: best.confidence
};

console.log(JSON.stringify(result, null, 2));

// If auto_heal or low_confidence_heal, patch the payload
if (result.verdict !== 'escalate') {
  payload.abstractTargets[targetName] = {
    ...payload.abstractTargets[targetName],
    cachedSelector: best.selector,
    cachedConfidence: best.confidence,
    fallbacks: best.fallbacks,
    resolvedOn: new Date().toISOString().split('T')[0],
    _healMeta: { healedAt: new Date().toISOString(), healConfidence: result.verdict, regeneratedFrom: best.name }
  };
  writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
  console.error(`Patched ${targetName} → ${best.selector} (confidence: ${best.confidence.toFixed(2)})`);
}

process.exit(result.verdict === 'escalate' ? 2 : 0);
