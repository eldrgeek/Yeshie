#!/usr/bin/env node
// scripts/explore.js — autonomous cold-site exploration
// Starts from the site's own navigation (not a hardcoded route list).
// Emits a L3 site model + L4 urlSchema to sites/{host}/site.model.json.
//
// Usage: node scripts/explore.js <base_url> [--output sites/demo-snipeitapp]
//
// Credentials may be passed via env vars:
//   EXPLORE_USERNAME, EXPLORE_PASSWORD
// or will be read from a "credentials" file in the site directory.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RELAY = 'http://localhost:3333';
const DEFAULT_TIMEOUT = 60_000;

// ── Denylist: never click affordances matching these patterns ─────────────────
const DENYLIST = /logout|sign.?out|delete|remove|destroy|deactivate|archive|purge|wipe|reset.?pass/i;
// Never explore these path patterns
const PATH_DENYLIST = /logout|signout|delete|remove|destroy|password\/reset|\.json|\.csv|\.pdf|\.xml|\.zip/i;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function run(payload, params = {}, tabId = null, timeoutMs = DEFAULT_TIMEOUT) {
  const resp = await fetch(`${RELAY}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, params, tabId, timeoutMs }),
  });
  if (!resp.ok) throw new Error(`Relay HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function singleStepPayload(step) {
  return { _meta: { task: 'explore-step' }, chain: [step] };
}

async function navigate(url, delay = 1500, timeoutMs = DEFAULT_TIMEOUT) {
  return run({
    _meta: { task: 'explore-nav' },
    chain: [
      { stepId: 's1', action: 'navigate', url },
      { stepId: 's2', action: 'delay', ms: delay },
      { stepId: 's3', action: 'read', store_as: 'snap' },
    ],
  }, {}, null, timeoutMs);
}

async function snapshot() {
  return run({
    _meta: { task: 'explore-snap' },
    chain: [{ stepId: 's1', action: 'read', store_as: 'snap' }],
  });
}

function parseSnapshot(result) {
  const step = result?.stepResults?.find(s => s.action === 'read');
  if (!step) return null;
  try {
    return step.snapshot ?? JSON.parse(step.text ?? '{}');
  } catch {
    return null;
  }
}

function sameOrigin(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    const b = new URL(baseUrl);
    return u.hostname === b.hostname;
  } catch { return false; }
}

function normPath(href, baseUrl) {
  try { return new URL(href, baseUrl).pathname; } catch { return null; }
}

// ── URL schema extraction ─────────────────────────────────────────────────────
function extractUrlSchema(urls) {
  // Find URL patterns with numeric/uuid segments → replace with {id} slot
  const patterns = {};
  for (const u of urls) {
    const slotted = u.replace(/\/\d{1,8}(\/|$)/g, '/{id}$1')
                      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/gi, '/{uuid}$1');
    if (!patterns[slotted]) {
      patterns[slotted] = { pattern: slotted, examples: [], paramType: 'none' };
    }
    patterns[slotted].examples.push(u);
    if (slotted !== u) {
      patterns[slotted].paramType = u.match(/[0-9a-f]{8}-[0-9a-f-]{27}/) ? 'uuid' : 'integer';
    }
  }
  return Object.values(patterns);
}

// ── Main exploration ──────────────────────────────────────────────────────────
async function explore(baseUrl, opts = {}) {
  const maxPages = opts.maxPages ?? 15;
  const creds = opts.credentials ?? { username: process.env.EXPLORE_USERNAME, password: process.env.EXPLORE_PASSWORD };
  const outputDir = opts.outputDir ?? join(PROJECT_ROOT, 'sites', new URL(baseUrl).hostname.replace(/\./g, '-'));

  console.log(`[explore] Starting autonomous exploration of ${baseUrl}`);
  console.log(`[explore] Max pages: ${maxPages}, output: ${outputDir}`);

  // ── Step 1: check relay ───────────────────────────────────────────────────
  const status = await fetch(`${RELAY}/status`).then(r => r.json()).catch(() => null);
  if (!status?.ok || !status?.extensionConnected) {
    throw new Error(`Relay not ready: ${JSON.stringify(status)}`);
  }
  console.log('[explore] Relay: connected');

  // ── Step 2: navigate to site ──────────────────────────────────────────────
  // Some sites redirect from root to /login; the redirect can hang the extension's
  // nav handler. Try root with a short timeout, fall back to /login.
  console.log(`[explore] Navigating to ${baseUrl} ...`);
  let navResult;
  try {
    navResult = await navigate(baseUrl, 2000, 20_000);
  } catch (err) {
    const loginFallback = baseUrl.replace(/\/$/, '') + '/login';
    console.warn(`[explore] Root nav failed (${err.message}), retrying at ${loginFallback}`);
    navResult = await navigate(loginFallback, 2000, 30_000);
  }
  let snap = parseSnapshot(navResult);
  const currentUrl = navResult?.stepResults?.[0]?.url ?? baseUrl;

  let authenticated = false;
  let loginSnap = snap;

  // ── Step 3: login if needed ───────────────────────────────────────────────
  const onLoginPage = snap?.inputs?.some(i => i.type === 'password') ?? false;
  if (onLoginPage && creds.username && creds.password) {
    console.log('[explore] Login page detected — logging in ...');

    // Find login form fields
    const userInput = snap.inputs.find(i => i.type === 'text' || i.type === 'email' || i.placeholder?.toLowerCase().includes('user'));
    const passInput = snap.inputs.find(i => i.type === 'password');
    const submitBtn = snap.buttons.find(b => /login|sign.?in|submit/i.test(b.text));

    if (!userInput || !passInput) throw new Error('Could not find login form inputs');

    const userSel = userInput.id ? `#${userInput.id}` : `input[placeholder*="${userInput.placeholder}"]`;
    const passSel = passInput.id ? `#${passInput.id}` : `input[type="password"]`;
    // classes is a space-separated string; check for btn-primary using string.includes
    const btnSel = submitBtn && typeof submitBtn.classes === 'string' && submitBtn.classes.includes('btn-primary')
      ? 'button.btn-primary'
      : 'button[type="submit"]';

    // Phase 1: type credentials; set_value may auto-submit some forms
    const typeResult = await run({
      _meta: { task: 'explore-login-type' },
      chain: [
        { stepId: 'l1', action: 'type', selector: userSel, value: creds.username, method: 'set_value' },
        { stepId: 'l2', action: 'type', selector: passSel, value: creds.password, method: 'set_value' },
        { stepId: 'l3', action: 'delay', ms: 2500 },
        { stepId: 'l4', action: 'read', store_as: 'snap' },
      ],
    }, {}, null, 30_000);

    snap = parseSnapshot(typeResult);
    const onLoginAfterType = !snap || snap?.inputs?.some(i => i.type === 'password');

    if (onLoginAfterType) {
      // Auto-submit didn't happen; explicitly click the submit button
      const clickResult = await run({
        _meta: { task: 'explore-login-click' },
        chain: [
          { stepId: 'c1', action: 'click', selector: btnSel },
          { stepId: 'c2', action: 'delay', ms: 3000 },
          { stepId: 'c3', action: 'read', store_as: 'snap' },
        ],
      }, {}, null, 20_000);
      snap = parseSnapshot(clickResult);
    }

    // If snap is null, the chain likely errored — treat as login failure
    const stillOnLogin = !snap || snap?.inputs?.some(i => i.type === 'password');
    if (stillOnLogin) {
      throw new Error(`Login failed — ${snap ? 'still on login page' : 'chain did not complete'}`);
    }
    authenticated = true;
    console.log('[explore] Login success — now at', snap?.pageUrl ?? '?');
  } else if (!onLoginPage) {
    authenticated = true;
  }

  // ── Step 4: collect navigation links from authenticated page ──────────────
  console.log('[explore] Collecting navigation from authenticated page ...');

  // Re-read the current page to get fresh nav links (post-login render may differ)
  const freshSnap = await snapshot();
  const freshParsed = parseSnapshot(freshSnap);
  if (freshParsed && (freshParsed.links?.length || freshParsed.navLinks?.length)) {
    snap = freshParsed;
  }

  // Gather all links from the first authenticated snapshot
  const navCandidates = [
    ...(snap?.links ?? []),
    ...(snap?.navLinks ?? []),
    ...(snap?.buttons ?? []).filter(b => b.href),
  ]
    .filter(l => l.href && sameOrigin(l.href, baseUrl))
    .filter(l => !PATH_DENYLIST.test(l.href))
    .filter(l => !DENYLIST.test(l.text ?? ''))
    .map(l => ({ text: l.text ?? '', href: l.href }));

  // Deduplicate by path
  const seenPaths = new Set();
  const queue = [];
  for (const l of navCandidates) {
    const p = normPath(l.href, baseUrl);
    if (p && !seenPaths.has(p)) {
      seenPaths.add(p);
      queue.push({ url: new URL(l.href, baseUrl).href, text: l.text, depth: 1 });
    }
  }

  console.log(`[explore] Found ${queue.length} nav candidates from initial page`);

  // ── Step 5: breadth-first page crawl ─────────────────────────────────────
  const pages = [];
  const visitedUrls = new Set();

  // Add current page to visited
  visitedUrls.add(normPath(currentUrl, baseUrl) ?? '/');

  // Record the initial authenticated page
  if (snap) {
    pages.push({
      url: currentUrl,
      path: normPath(currentUrl, baseUrl),
      title: snap.headings?.[0]?.text ?? 'Home',
      snap,
    });
  }

  let qi = 0;
  while (pages.length < maxPages && qi < queue.length) {
    const item = queue[qi++];
    const itemPath = normPath(item.url, baseUrl);

    if (!itemPath || visitedUrls.has(itemPath)) continue;
    visitedUrls.add(itemPath);

    console.log(`[explore] [${pages.length + 1}/${maxPages}] ${itemPath}`);

    let pageResult;
    try {
      pageResult = await navigate(item.url, 1500);
    } catch (err) {
      console.warn(`[explore] Nav failed for ${item.url}: ${err.message}`);
      continue;
    }

    const pageSnap = parseSnapshot(pageResult);
    const actualUrl = pageResult?.stepResults?.[0]?.url ?? item.url;
    const actualPath = normPath(actualUrl, baseUrl);

    // Skip if redirected to login
    if (pageSnap?.inputs?.some(i => i.type === 'password')) {
      console.warn(`[explore] Redirected to login at ${itemPath} — session may have expired`);
      continue;
    }

    pages.push({
      url: actualUrl,
      path: actualPath ?? itemPath,
      discoveredAs: item.text,
      snap: pageSnap,
    });

    // Discover more links from this page (breadth expansion)
    if (pages.length < maxPages && pageSnap) {
      const moreLinks = [
        ...(pageSnap.links ?? []),
        ...(pageSnap.navLinks ?? []),
      ]
        .filter(l => l.href && sameOrigin(l.href, baseUrl))
        .filter(l => !PATH_DENYLIST.test(l.href))
        .filter(l => !DENYLIST.test(l.text ?? ''));

      for (const l of moreLinks) {
        const p = normPath(l.href, baseUrl);
        if (p && !seenPaths.has(p)) {
          seenPaths.add(p);
          queue.push({ url: new URL(l.href, baseUrl).href, text: l.text, depth: item.depth + 1 });
        }
      }
    }
  }

  console.log(`[explore] Crawled ${pages.length} pages`);

  // ── Step 6: build L3 site model ──────────────────────────────────────────
  const host = new URL(baseUrl).hostname;
  const stateGraph = { nodes: {} };
  const targetRegistry = {};
  const allPaths = pages.map(p => p.path).filter(Boolean);

  for (const page of pages) {
    const snap = page.snap;
    const nodeId = page.path?.replace(/\//g, '-').replace(/^-/, '') || 'root';

    stateGraph.nodes[nodeId] = {
      description: page.discoveredAs ?? snap?.headings?.[0]?.text ?? page.path,
      url: page.url,
      path: page.path,
      signals: [
        { type: 'url_matches', pattern: (page.path ?? '/').replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') },
      ],
    };

    // Collect affordances as abstract targets
    for (const btn of snap?.buttons ?? []) {
      if (!btn.text || DENYLIST.test(btn.text)) continue;
      const key = `${nodeId}.${btn.text.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`;
      targetRegistry[key] = {
        description: btn.text,
        page: nodeId,
        type: 'button',
        match: { name_contains: [btn.text] },
        fallbackSelectors: btn.href ? [`a[href="${btn.href}"]`] : [],
        classes: btn.classes,
      };
    }

    for (const inp of snap?.inputs ?? []) {
      const label = inp.label ?? inp.placeholder ?? inp.ariaLabel ?? inp.id;
      if (!label) continue;
      const key = `${nodeId}.input.${label.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`;
      targetRegistry[key] = {
        description: label,
        page: nodeId,
        type: 'input',
        inputType: inp.type,
        match: { name_contains: [label] },
        fallbackSelectors: inp.id ? [`#${inp.id}`] : [],
      };
    }
  }

  // ── Step 7: L4 URL schema ─────────────────────────────────────────────────
  const urlSchema = extractUrlSchema(allPaths);

  // ── Step 8: detect framework ──────────────────────────────────────────────
  const firstSnap = pages[0]?.snap ?? {};
  const allClasses = pages.flatMap(p =>
    (p.snap?.buttons ?? []).flatMap(b => (b.classes ?? '').split(' '))
  );
  let framework = 'vanilla';
  if (allClasses.some(c => c.startsWith('v-'))) framework = 'vue';
  else if (allClasses.some(c => c.startsWith('MuiButton'))) framework = 'react-mui';
  else if (allClasses.some(c => c.includes('btn-primary') || c.includes('btn-default'))) framework = 'bootstrap';

  // ── Step 9: emit L3+L4 site model ────────────────────────────────────────
  const siteModel = {
    _meta: {
      layer: 3,
      name: `${host} Site Model`,
      description: `Auto-generated by explore.js on ${new Date().toISOString()}`,
      version: '0.1',
      site: host,
      baseUrl,
      framework,
      lastExplored: new Date().toISOString(),
      exploredBy: 'explore.js autonomous crawl',
      pagesDiscovered: pages.length,
      targetsFound: Object.keys(targetRegistry).length,
    },
    auth: {
      type: onLoginPage ? 'form_login' : 'none',
      loginPath: onLoginPage ? normPath(baseUrl, baseUrl) : null,
      loginFields: onLoginPage
        ? loginSnap?.inputs?.filter(i => i.type !== 'hidden').map(i => ({ id: i.id, type: i.type, placeholder: i.placeholder }))
        : null,
    },
    stateGraph,
    targetRegistry,
    urlSchema,
    explorationRaw: pages.map(p => ({
      path: p.path,
      url: p.url,
      discoveredAs: p.discoveredAs,
      headings: p.snap?.headings ?? [],
      inputCount: p.snap?.inputs?.length ?? 0,
      buttonCount: p.snap?.buttons?.length ?? 0,
      linkCount: p.snap?.links?.length ?? 0,
      tableCount: p.snap?.tables?.length ?? 0,
      tables: p.snap?.tables ?? [],
      forms: p.snap?.inputs?.map(i => ({ id: i.id, type: i.type, label: i.label ?? i.placeholder ?? i.ariaLabel })) ?? [],
    })),
  };

  // ── Step 10: write output ─────────────────────────────────────────────────
  mkdirSync(outputDir, { recursive: true });
  const modelPath = join(outputDir, 'site.model.json');
  writeFileSync(modelPath, JSON.stringify(siteModel, null, 2));
  console.log(`[explore] Site model written to ${modelPath}`);
  console.log(`[explore] Stats: ${pages.length} pages, ${Object.keys(targetRegistry).length} targets, ${urlSchema.length} URL patterns`);

  return { siteModel, modelPath, pages };
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const baseUrl = args[0] ?? 'https://demo.snipeitapp.com';
const outputDir = args.includes('--output') ? args[args.indexOf('--output') + 1] : undefined;

explore(baseUrl, {
  maxPages: 15,
  credentials: {
    username: process.env.EXPLORE_USERNAME ?? 'admin',
    password: process.env.EXPLORE_PASSWORD ?? 'password',
  },
  outputDir,
}).then(({ siteModel, modelPath }) => {
  console.log(`[explore] Done. Model: ${modelPath}`);
  console.log(`[explore] Framework: ${siteModel._meta.framework}`);
  console.log(`[explore] Pages: ${siteModel._meta.pagesDiscovered}`);
  console.log(`[explore] Targets: ${siteModel._meta.targetsFound}`);
  console.log(`[explore] URL patterns: ${siteModel.urlSchema.length}`);
}).catch(err => {
  console.error('[explore] Fatal:', err.message);
  process.exit(1);
});
