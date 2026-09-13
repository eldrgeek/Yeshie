#!/usr/bin/env node
/**
 * Yeshie run documenter (sidecar).
 *
 * Produces ONE self-contained Markdown file with inline base64 screenshots (no
 * image folder), an auto caption per frame, a red highlight box on the element
 * Yeshie touched, and a `.failures.json` sidecar (for the self-improvement loop)
 * whenever a frame fails.
 *
 * FAITHFUL execution: each "frame" is a COMPLETE Yeshie chain run autonomously
 * through the relay (`/run`) — never lone steps, which behave differently from
 * how Yeshie really runs. After a frame completes we locate the tab the
 * extension actually drove (searching every known debug port) and screenshot it.
 *
 * INPUT (JSON):
 *   { "payload": { "title", "site", "params",
 *       "frames": [ { "caption": "...", "highlight": "<css>", "chain": [ ...steps ] }, ... ] } }
 *   — or a plain { "payload": { "chain": [...] } }, which is captured as a single frame.
 *
 * USAGE:
 *   node scripts/document-run.mjs <payload.json> [--ports 9223,9222] [--out file.md] [--title "..."]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const args = process.argv.slice(2);
const inPath = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const PORTS = (opt('ports', '9223,9222')).split(',').map((s) => Number(s.trim())).filter(Boolean);
if (!inPath) { console.error('Usage: document-run.mjs <payload.json> [--ports 9223,9222] [--out file.md] [--title "..."]'); process.exit(2); }

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const P = raw.payload || raw;
const site = P.site || '';
const params = P.params || {};
const frames = P.frames || [{ chain: P.chain || [] }];
const title = opt('title', P.title || P.runId || path.basename(inPath));
const OUT = opt('out', `/tmp/yeshie-run-${Date.now()}.md`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastNavUrl = (chain) => [...chain].reverse().find((s) => s.action === 'navigate')?.url || '';

async function relayStatus() { return (await fetch(`${RELAY}/status`, { signal: AbortSignal.timeout(4000) })).json(); }

async function runChain(chain) {
  const body = { payload: { runId: `doc-${Date.now()}`, mode: 'verification', site, params, chain } };
  const res = await fetch(`${RELAY}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  return res.json();
}

async function highlightAndDescribe(page, selector) {
  if (!selector) return null;
  try {
    return await page.evaluate((sel) => {
      let el = null;
      for (const s of sel.split(',')) { try { el = document.querySelector(s.trim()); } catch {} if (el) break; }
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const o = document.createElement('div');
      Object.assign(o.style, { position: 'fixed', left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`, border: '3px solid #ff3b30', borderRadius: '6px', boxShadow: '0 0 0 3px rgba(255,59,48,0.25)', zIndex: 2147483647, pointerEvents: 'none' });
      o.setAttribute('data-yeshie-doc-highlight', '1');
      document.body.appendChild(o);
      const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      return { text: txt };
    }, selector);
  } catch { return null; }
}

/** Find, across all debug ports, the page whose URL best matches `want`; screenshot it. */
async function captureMatching(browsers, want, highlight) {
  // small settle + give SPA navigations a beat
  await sleep(1200);
  let best = null, bestScore = -1, bestPort = null;
  for (const { port, browser } of browsers) {
    let pages = [];
    try { pages = await browser.pages(); } catch { continue; }
    for (const pg of pages) {
      let url = ''; try { url = pg.url(); } catch {}
      if (!/^https?:/.test(url)) continue;
      let score = 0;
      if (want && url === want) score = 3;
      else if (want && url.startsWith(want.split('?')[0])) score = 2;
      else if (want) { try { if (url.includes(new URL(want).pathname)) score = 1; } catch {} }
      else score = 0.5;
      if (score > bestScore) { best = pg; bestScore = score; bestPort = port; }
    }
  }
  if (!best) return null;
  try { await best.bringToFront(); } catch {}
  await sleep(400);
  const desc = highlight ? await highlightAndDescribe(best, highlight) : null;
  let img = null;
  try { img = (await best.screenshot({ type: 'jpeg', quality: 62 })).toString('base64'); } catch {}
  try { await best.evaluate(() => document.querySelectorAll('[data-yeshie-doc-highlight]').forEach((n) => n.remove())); } catch {}
  return { img, url: best.url(), port: bestPort, desc };
}

(async () => {
  const st = await relayStatus().catch(() => null);
  if (!st?.extensionConnected) { console.error(`Extension not connected to relay (${RELAY}). Launch via SOMA/tools/chrome-test-launcher.sh.`); process.exit(1); }

  const browsers = [];
  for (const port of PORTS) {
    try { browsers.push({ port, browser: await puppeteer.connect({ browserURL: `http://localhost:${port}`, defaultViewport: null }) }); }
    catch { /* port not up; skip */ }
  }
  if (!browsers.length) { console.error(`No debug Chrome reachable on ports ${PORTS.join(',')}.`); process.exit(1); }
  console.log(`Documenting "${title}" — ${frames.length} frame(s), ports ${browsers.map((b) => b.port).join(',')}`);

  const out = [];
  const failures = [];
  let shots = 0;

  const flush = () => {
    const ts = new Date().toISOString();
    const md = [`# ${title}`, '', `*Documented run · ${ts}${site ? ` · ${site}` : ''}*`, '',
      `**Frames:** ${frames.length} · **Screenshots:** ${shots} · **Failures:** ${failures.length}`, ''];
    if (failures.length) md.push('> ⚠️ This run had failures (flagged below; saved to the `.failures.json` sidecar for self-improvement).', '');
    md.push('---', '');
    for (const f of out) {
      md.push(`## ${f.n}. ${f.caption}${f.ok ? '' : ' ❌'}`, '');
      if (f.url) md.push(`\`${f.url}\``, '');
      if (!f.ok && f.err) md.push(`**Error:** ${f.err}`, '');
      if (f.img) md.push(`![frame ${f.n}](data:image/jpeg;base64,${f.img})`, '');
      md.push('---', '');
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, md.join('\n'));
    if (failures.length) fs.writeFileSync(OUT.replace(/\.md$/, '') + '.failures.json', JSON.stringify({ title, when: ts, failures }, null, 2));
  };

  let n = 0;
  for (const frame of frames) {
    n++;
    const chain = frame.chain || [];
    const result = await runChain(chain).catch((e) => ({ success: false, error: e.message }));
    const ok = !!(result.success && result.goalReached !== false);
    const want = lastNavUrl(chain);
    const cap = await captureMatching(browsers, want, frame.highlight);
    if (cap?.img) shots++;
    const caption = frame.caption || (chain.map((s) => s.action).join(' → '));
    out.push({ n, caption, ok, img: cap?.img, url: cap?.url || want, err: result.error });
    if (!ok) failures.push({ frame: n, caption, error: result.error || 'chain failed', url: cap?.url || want, chain });
    flush();
    console.log(`  frame ${n} -> ${ok ? 'ok' : 'FAIL'}${cap?.img ? ` [shot @${cap.port}]` : ' [no shot]'} ${cap?.url || ''}`);
  }

  for (const { browser } of browsers) { try { browser.disconnect(); } catch {} }
  flush();
  console.log(`\nWrote ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB, ${shots} screenshots, ${failures.length} failures).`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
