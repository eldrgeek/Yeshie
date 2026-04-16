#!/usr/bin/env node
// diff-maps.js — compare two site map versions to determine if change is L1, L2, or L3
// Usage: node diff-maps.js <old-map.json> <new-map.json> [--page=/path]

import { readFileSync } from 'fs';

function levenshtein(a, b) {
  const dp = Array.from({length: a.length+1}, (_,i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function sameField(oldField, newField) {
  // Identity rule 1: label text similarity
  if (levenshtein((oldField.label||'').toLowerCase(), (newField.label||'').toLowerCase()) <= 2) return true;
  // Identity rule 2: selector overlap
  const oldSelectors = new Set([oldField.selector, ...(oldField.fallbacks||[])]);
  const newSelectors = [newField.selector, ...(newField.fallbacks||[])];
  if (newSelectors.some(s => oldSelectors.has(s))) return true;
  // Identity rule 3: name attribute match
  if (oldField.name && oldField.name === newField.name) return true;
  return false;
}

const oldMap = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const newMap = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const pageFilter = process.argv.find(a => a.startsWith('--page='))?.split('=')[1];

const results = [];

for (const [pagePath, oldPage] of Object.entries(oldMap.pages || {})) {
  if (pageFilter && pagePath !== pageFilter) continue;
  const newPage = newMap.pages?.[pagePath];
  if (!newPage) { results.push({ page: pagePath, verdict: 'page_removed', level: 3 }); continue; }

  const oldRequired = (oldPage.fields||[]).filter(f => f.required);
  const newRequired = (newPage.fields||[]).filter(f => f.required);
  
  // Count unmatched required fields
  const unmatched = oldRequired.filter(of => !newRequired.some(nf => sameField(of, nf)));
  const added = newRequired.filter(nf => !oldRequired.some(of => sameField(of, nf)));
  
  const oldSelectors = Object.keys(oldPage.selectors||{});
  const newSelectors = Object.keys(newPage.selectors||{});
  const lostSelectors = oldSelectors.filter(s => !newSelectors.includes(s));
  
  let level = 1;
  let reason = 'selector_drift';
  
  if (unmatched.length >= 2 || added.length >= 2) { level = 3; reason = 'required_field_structural_change'; }
  else if (unmatched.length > 0 || lostSelectors.length >= 3) { level = 2; reason = 'structural_change'; }
  
  results.push({ page: pagePath, level, reason, unmatchedRequired: unmatched.map(f=>f.label), addedRequired: added.map(f=>f.label), lostSelectors });
}

const maxLevel = Math.max(...results.map(r => r.level), 1);
console.log(JSON.stringify({ verdict: `L${maxLevel}`, maxLevel, pages: results }, null, 2));
process.exit(maxLevel >= 3 ? 3 : maxLevel >= 2 ? 2 : 0);
