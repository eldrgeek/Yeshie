#!/usr/bin/env node
// run-all.js — HEAL test runner
import { results as queueResults } from './test-heal-queue.js';
import { results as loopResults } from './test-detect-loop.js';
import { results as diffResults } from './test-diff-maps.js';
import { getDryRunAllResults } from './test-dry-run-all.js';

const suites = [
  { name: 'heal-queue', ...queueResults },
  { name: 'detect-loop', ...loopResults },
  { name: 'diff-maps', ...diffResults },
];

let totalPassed = 0, totalFailed = 0;
for (const s of suites) {
  totalPassed += s.passed;
  totalFailed += s.failed;
}

// dry-run-all is live/optional — report but do not count failures toward test:heal exit code
const dryRunResults = await getDryRunAllResults();
if (dryRunResults.note) {
  console.log(`\ndry-run-all: ${dryRunResults.note}`);
} else {
  const dryStatus = dryRunResults.failed > 0 ? `${dryRunResults.failed} FAILURES (run test:dry-run-all for details)` : `${dryRunResults.passed} passed`;
  console.log(`\ndry-run-all (informational): ${dryStatus}, ${dryRunResults.skipped} skipped`);
}

console.log('\n' + '='.repeat(50));
console.log(`HEAL Tests: ${totalPassed} passed, ${totalFailed} failed`);
console.log('='.repeat(50));

if (totalFailed > 0) process.exit(1);
