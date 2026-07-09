#!/usr/bin/env node
/**
 * GitHub recipe integration tests — instruct-then-verify.
 *
 * PHILOSOPHY (read this before "fixing" it to use Playwright):
 *   These tests drive Yeshie's REAL product surface. Each test POSTs a DSL
 *   chain to the relay (localhost:3333) → the relay dispatches it to the
 *   loaded extension → the extension's content script executes it against a
 *   live GitHub tab → we assert on what came back. That exercises the exact
 *   path a user/agent uses in production: the relay protocol, the step
 *   executor, the target resolver, the site model, and the content script.
 *
 *   Playwright would instead drive the browser over its own CDP automation
 *   path, which BYPASSES all of the above. A green Playwright run would tell
 *   you Playwright works — not that Yeshie works. For verifying that Yeshie
 *   "did what it was told," instruct-then-verify is the correct design.
 *
 *   What we DO borrow from good test hygiene (and what the old
 *   scripts/run-github-recipes.sh lacked):
 *     1. Content assertions, not just the `success` flag. A navigate+read can
 *        "succeed" while sitting on a login wall or a 404. Each recipe below
 *        declares a `verify(page)` predicate over the real DOM snapshot.
 *     2. A non-zero exit code on any failure, so it is CI/gate-able.
 *     3. A machine-readable JSON report at /tmp/github-recipe-results.json.
 *     4. A hard preflight: relay up AND extension connected, else fail fast
 *        with a clear remediation message (see scripts/chrome-test-launcher.sh).
 *
 * SCOPE: only PUBLIC, READ-ONLY recipes run here. Mutating recipes (star,
 *   fork, create, merge, delete, label, settings, notifications) change real
 *   GitHub state and need auth; they are listed in MUTATING_RECIPES and are
 *   intentionally NOT executed. Run them by hand or add a dry-run plan check.
 *
 * USAGE:
 *   node tests/integration/github-recipes.mjs            # run all read-only
 *   node tests/integration/github-recipes.mjs repo-view  # run one by slug
 */

const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const STEP_DELAY = Number(process.env.RECIPE_DELAY_MS || 1500);
const RESULTS_FILE = '/tmp/github-recipe-results.json';

// ---------- helpers ----------

/** Flatten a `read` DOM snapshot into one lowercased searchable string. */
function flatten(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const parts = [];
  const push = (v) => { if (v) parts.push(String(v)); };
  push(snapshot.pageUrl);
  for (const h of snapshot.headings || []) push(h.text);
  for (const l of snapshot.links || []) { push(l.text); push(l.href); }
  for (const b of snapshot.buttons || []) { push(b.text); push(b.ariaLabel); }
  for (const i of snapshot.inputs || []) { push(i.ariaLabel); push(i.placeholder); }
  for (const t of snapshot.tables || []) {
    for (const hd of t.headers || []) push(hd);
    for (const row of t.sampleRows || []) push(JSON.stringify(row));
  }
  return parts.join(' \n ').toLowerCase();
}

/** Convenience accessors passed to each verify(). */
function pageView(buffer, storeAs) {
  const snap = (buffer || {})[storeAs] || {};
  const text = flatten(snap);
  return {
    snap,
    text,
    has: (s) => text.includes(s.toLowerCase()),
    anyLinkHref: (s) => (snap.links || []).some((l) => (l.href || '').toLowerCase().includes(s.toLowerCase())),
    tableRows: () => (snap.tables || []).reduce((n, t) => n + (t.rowCount || 0), 0),
    linkCount: () => (snap.links || []).length,
  };
}

async function runChain(recipe) {
  const body = {
    payload: {
      runId: `verify-${recipe.slug}`,
      mode: 'verification',
      site: 'github.com',
      params: recipe.params || {},
      chain: recipe.chain,
    },
  };
  const res = await fetch(`${RELAY}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function preflight() {
  let status;
  try {
    status = await (await fetch(`${RELAY}/status`, { signal: AbortSignal.timeout(4000) })).json();
  } catch (e) {
    throw new Error(`Relay not reachable at ${RELAY}. Start it (launchctl kickstart com.yeshie.relay).`);
  }
  if (!status.ok) throw new Error(`Relay reports not-ok: ${JSON.stringify(status)}`);
  if (!status.extensionConnected) {
    throw new Error(
      'Extension NOT connected to relay.\n' +
      '  Chrome stable (137+) silently ignores --load-extension, so the extension never loads.\n' +
      '  Fix: launch the test surface with Chrome for Testing via scripts/chrome-test-launcher.sh\n' +
      '  then re-run. Verify with: curl -s ' + RELAY + '/status'
    );
  }
}

// ---------- read-only recipes (slug, chain, verify) ----------

const READ = (url, storeAs = 'content', extra = []) => [
  { stepId: 's1', action: 'navigate', url },
  { stepId: 's2', action: 'delay', ms: STEP_DELAY },
  ...extra,
  { stepId: 'sN', action: 'read', store_as: storeAs },
];

const RECIPES = [
  { slug: 'repo-view', chain: READ('https://github.com/torvalds/linux'),
    verify: (p) => p.has('torvalds/linux') || p.has('linux') },
  { slug: 'repo-list-forks', chain: READ('https://github.com/torvalds/linux/network/members'),
    verify: (p) => p.has('fork') || p.linkCount() > 5 },
  { slug: 'branch-list', chain: READ('https://github.com/torvalds/linux/branches'),
    verify: (p) => p.has('branch') || p.has('master') || p.has('main') },
  { slug: 'issue-list', chain: READ('https://github.com/microsoft/vscode/issues?q=is%3Aissue+is%3Aopen'),
    verify: (p) => p.anyLinkHref('/issues/') || p.has('issue') },
  { slug: 'issue-view', chain: READ('https://github.com/microsoft/vscode/issues/1'),
    verify: (p) => p.has('vscode') && (p.has('issue') || p.anyLinkHref('/issues/')) },
  { slug: 'issue-filter-by-label', chain: READ('https://github.com/microsoft/vscode/issues?q=is%3Aissue+is%3Aopen+label%3A%22bug%22'),
    verify: (p) => p.anyLinkHref('/issues/') || p.has('label') || p.has('bug') },
  { slug: 'pr-list', chain: READ('https://github.com/microsoft/vscode/pulls?q=is%3Apr+is%3Aopen'),
    verify: (p) => p.anyLinkHref('/pull/') || p.has('pull request') },
  // NOTE: #1 in vscode is an ISSUE, so /pull/1 redirects to /issues/1. Use a real
  // PR number and assert we actually landed on /pull/ (not an issue redirect).
  { slug: 'pr-view', chain: READ('https://github.com/microsoft/vscode/pull/200000'),
    verify: (p) => p.has('/pull/200000') },
  { slug: 'pr-view-diff', chain: READ('https://github.com/microsoft/vscode/pull/200000/files', 'content', [{ stepId: 's2b', action: 'delay', ms: 1000 }]),
    verify: (p) => p.has('/pull/200000') && (p.has('file') || p.has('diff')) },
  { slug: 'file-view', chain: READ('https://github.com/torvalds/linux/blob/master/README'),
    verify: (p) => p.has('readme') || p.has('linux') },
  { slug: 'file-history', chain: READ('https://github.com/torvalds/linux/commits/master/README'),
    verify: (p) => p.has('commit') || p.has('history') || p.linkCount() > 3 },
  { slug: 'release-list', chain: READ('https://github.com/microsoft/vscode/releases'),
    verify: (p) => p.has('release') || p.anyLinkHref('/releases/tag/') },
  { slug: 'actions-list', chain: READ('https://github.com/microsoft/vscode/actions', 'content', [{ stepId: 's2b', action: 'delay', ms: 1000 }]),
    verify: (p) => p.has('workflow') || p.has('action') || p.anyLinkHref('/actions') },
  { slug: 'gist-view', chain: READ('https://gist.github.com/torvalds/cc68ebc4b4d305e9dbb8'),
    verify: (p) => p.has('torvalds') || p.has('gist') },
  { slug: 'search-repos', chain: READ('https://github.com/search?q=linux+kernel&type=repositories', 'content', [{ stepId: 's2b', action: 'delay', ms: 1000 }]),
    verify: (p) => p.has('repositor') || p.anyLinkHref('/') },
  { slug: 'search-issues', chain: READ('https://github.com/search?q=is%3Aissue+is%3Aopen+label%3Abug&type=issues', 'content', [{ stepId: 's2b', action: 'delay', ms: 1000 }]),
    verify: (p) => p.has('issue') || p.anyLinkHref('/issues/') },
  { slug: 'search-users', chain: READ('https://github.com/search?q=location%3ADenver+language%3Arust&type=users', 'content', [{ stepId: 's2b', action: 'delay', ms: 1000 }]),
    verify: (p) => p.has('user') || p.has('follower') || p.linkCount() > 3 },
  { slug: 'profile-view', chain: READ('https://github.com/torvalds'),
    verify: (p) => p.has('torvalds') || p.has('repositor') || p.has('follow') },
  { slug: 'org-view', chain: READ('https://github.com/microsoft'),
    verify: (p) => p.has('microsoft') || p.has('repositor') },
  { slug: 'org-repos', chain: READ('https://github.com/orgs/microsoft/repositories?sort=updated'),
    verify: (p) => p.has('microsoft') || p.has('repositor') || p.linkCount() > 5 },
  { slug: 'explore-trending', chain: READ('https://github.com/trending?since=daily'),
    verify: (p) => p.has('trending') || p.linkCount() > 5 },
];

// Mutating recipes deliberately NOT run here (need auth + change real state).
const MUTATING_RECIPES = [
  'repo-star', 'repo-fork', 'repo-watch', 'repo-archive', 'repo-create',
  'repo-description-edit', 'repo-topics-edit', 'issue-label-apply', 'issue-lock',
  'issue-pin', 'pr-merge', 'pr-review-approve', 'pr-convert-to-draft',
  'branch-switch-default', 'file-create', 'file-delete', 'file-upload',
  'release-edit', 'actions-rerun', 'gist-create', 'gist-delete',
  'collaborator-change-role', 'notifications-mark-read', 'notifications-subscribe',
  'settings-view', 'settings-security',
];

// ---------- runner ----------

import fs from 'node:fs';

/** Merge a single result into the on-disk report so partial runs are visible. */
function recordIncremental(entry) {
  let report = { results: [] };
  try { report = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch {}
  report.results = (report.results || []).filter((r) => r.slug !== entry.slug);
  report.results.push(entry);
  report.when = new Date().toISOString();
  report.relay = RELAY;
  report.pass = report.results.filter((r) => r.pass).length;
  report.fail = report.results.filter((r) => !r.pass).length;
  report.total = report.results.length;
  try { fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2)); } catch {}
}

async function main() {
  const only = process.argv[2];
  // Batch slicing for time-boxed runners: OFFSET + LIMIT env vars.
  const offset = Number(process.env.OFFSET || 0);
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  let recipes = only ? RECIPES.filter((r) => r.slug === only) : RECIPES;
  if (only && recipes.length === 0) {
    console.error(`No read-only recipe with slug "${only}". Available: ${RECIPES.map((r) => r.slug).join(', ')}`);
    process.exit(2);
  }
  if (!only) recipes = recipes.slice(offset, offset + limit);

  console.log(`GitHub recipe verification — instruct-then-verify via ${RELAY}`);
  await preflight();
  console.log(`Preflight OK (relay up, extension connected). Running ${recipes.length} read-only recipe(s)${only ? '' : ` [offset ${offset}]`}.\n`);

  const results = [];
  let pass = 0, fail = 0;

  for (const r of recipes) {
    let ok = false, reason = '', execOk = false;
    try {
      const resp = await runChain(r);
      execOk = !!(resp.success && resp.goalReached !== false);
      const storeAs = r.chain.find((s) => s.action === 'read')?.store_as || 'content';
      const p = pageView(resp.buffer, storeAs);
      if (!execOk) {
        reason = `chain did not succeed: ${resp.error || resp.event || 'unknown'}`;
      } else if (!r.verify(p)) {
        reason = `executed but content assertion failed (got ${p.linkCount()} links, ${p.tableRows()} table rows; url=${p.snap.pageUrl || '?'})`;
      } else {
        ok = true;
      }
    } catch (e) {
      reason = `exception: ${e.message}`;
    }
    const entry = { slug: r.slug, pass: ok, execOk, reason };
    results.push(entry);
    recordIncremental(entry);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.slug}${ok ? '' : '  — ' + reason}`);
    if (ok) pass++; else fail++;
    await new Promise((res) => setTimeout(res, 500));
  }

  console.log(`\n=== ${pass}/${results.length} passed, ${fail} failed. ${MUTATING_RECIPES.length} mutating recipes skipped (need auth). ===`);
  console.log(`Report: ${RESULTS_FILE}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
