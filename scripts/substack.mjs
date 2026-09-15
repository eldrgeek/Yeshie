#!/usr/bin/env node
/**
 * One-call Substack tasks through Yeshie (sites/substack.com/tasks).
 *
 * Substack has no public write API, and Mike signs in by emailed link, never
 * by password. So every change goes through his signed-in Chrome, via the
 * Yeshie relay. This wrapper:
 *   1. uses its own Substack tab, remembered in ~/.yeshie/substack-tab.json,
 *      or opens one. It never drives a tab it did not open;
 *   2. turns Markdown into HTML for Substack's editor (python3 markdown);
 *   3. fills a recipe's params, runs it with scripts/run-async.mjs, and prints
 *      one line per step;
 *   4. with --dry-run, sends the recipe only up to its "dryRunUntil" step, the
 *      last step before anything is typed, saved, sent or published;
 *   5. for draft and publish, reads Substack's own JSON to find the draft and
 *      check what was saved.
 *
 * USAGE
 *   node scripts/substack.mjs login
 *   node scripts/substack.mjs drafts
 *   node scripts/substack.mjs about   --file about.md --proof "plain words"                  [--dry-run]
 *   node scripts/substack.mjs welcome --kind free|paid --subject "..." --file email.md --proof "plain words" [--dry-run]
 *   node scripts/substack.mjs invite  --email someone@example.com                              [--dry-run]
 *   node scripts/substack.mjs draft   --file post.md [--draft-id N]                           [--dry-run]
 *   node scripts/substack.mjs byline  --draft-id N --query "Verso" [--pick "Verso"]           [--dry-run]
 *   node scripts/substack.mjs publish --draft-id N [--audience everyone|only_paid]             [--dry-run]
 *
 * FLAGS
 *   --pub SUB   publication subdomain (default aiwtf)
 *   --tab N     run on this tab id instead of the remembered Substack tab
 *
 * post.md starts with front matter: title, subtitle (optional), proof. The body
 * is Markdown. proof (and --proof) must be plain ASCII words that appear in the
 * text inside one run of unformatted text, because the checks read Substack's
 * JSON, which escapes other characters and splits text at bold, italic and links.
 *
 * EXIT: 0 green · 1 a recipe or a check failed · 2 usage, relay or tab problem.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const TASKS = path.join(REPO, 'sites/substack.com/tasks');
const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const TAB_STATE = path.join(os.homedir(), '.yeshie', 'substack-tab.json');
const RECIPES = {
  login: '01-login.payload.json',
  draft: '02-create-draft.payload.json',
  about: '03-edit-about-page.payload.json',
  welcome: '04-edit-welcome-email.payload.json',
  invite: '05-invite-team-member.payload.json',
  byline: '06-add-byline.payload.json',
  publish: '07-publish-no-email.payload.json',
};
const WELCOME = {
  free: { editor_title: 'Welcome%20email%20to%20free%20subscribers', body_field: 'unfinished_subscription_email_content', subject_field: 'unfinished_subscription_email_subject' },
  paid: { editor_title: 'Welcome%20email%20to%20paid%20subscribers', body_field: 'welcome_email_content', subject_field: 'welcome_email_subject' },
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const pub = String(opt('pub', 'aiwtf'));
const dryRun = flag('dry-run');

function die(msg, code = 2) {
  console.error(`substack: ${msg}`);
  process.exit(code);
}

/** A string as it appears inside Substack's JSON: JSON-escaped, non-ASCII as lowercase \uXXXX. */
export function jsonEscape(s) {
  return JSON.stringify(String(s)).slice(1, -1)
    .replace(/[-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Front matter (key: value lines between --- fences) and the Markdown body. */
export function parsePost(text) {
  const meta = {};
  let body = text;
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  return { meta, body };
}

function markdownToHtml(md) {
  const py = 'import sys, markdown; sys.stdout.write(markdown.markdown(sys.stdin.read(), extensions=["extra", "sane_lists"]))';
  const r = spawnSync('python3', ['-c', py], { input: md, encoding: 'utf8' });
  if (r.status !== 0) die(`Markdown conversion failed (python3 -m pip install markdown?): ${r.stderr}`);
  return r.stdout.trim();
}

const plainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();

function checkProof(proof, html, label = '--proof') {
  if (!proof) die(`${label} is required: a few plain words from the text, used to prove the save`);
  if (!/^[A-Za-z0-9 ,.;:!?'()-]+$/.test(proof)) die(`${label} must be plain ASCII words (no quotes, dashes or accents): "${proof}"`);
  if (!plainText(html).includes(proof)) die(`${label} "${proof}" does not appear in the text`);
}

async function relay(pathname, body) {
  const init = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const res = await fetch(`${RELAY}${pathname}`, init).catch((e) => die(`relay unreachable at ${RELAY}: ${e.message}`));
  return res.json().catch(() => ({}));
}

/** This wrapper's own Substack tab: the remembered one if it is still open on substack.com, else a new one. */
async function substackTab() {
  if (opt('tab')) return Number(opt('tab'));
  const tabs = await relay('/tabs/list');
  if (!Array.isArray(tabs)) die(`the relay could not list tabs: ${JSON.stringify(tabs)}`);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(TAB_STATE, 'utf8')).tabId; } catch { /* first run */ }
  const open = tabs.find((t) => t.tabId === saved);
  if (open && /^https:\/\/([a-z0-9-]+\.)?substack\.com\//.test(String(open.url || ''))) return saved;
  const r = await relay('/tabs/open', { url: `https://${pub}.substack.com/publish/home` });
  if (!r.tabId) die(`could not open a Substack tab: ${JSON.stringify(r)}`);
  fs.mkdirSync(path.dirname(TAB_STATE), { recursive: true });
  fs.writeFileSync(TAB_STATE, JSON.stringify({ tabId: r.tabId, openedAt: new Date().toISOString() }));
  return r.tabId;
}

/** Run a payload object on the tab. Returns { green, result }. */
function runPayload(payload, tabId, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'substack-'));
  const file = path.join(dir, 'payload.json');
  fs.writeFileSync(file, JSON.stringify(payload));
  const r = spawnSync(process.execPath, [path.join(HERE, 'run-async.mjs'), file, '--tab', String(tabId), '--json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
  });
  fs.rmSync(dir, { recursive: true, force: true });
  let result = null;
  try { result = JSON.parse(r.stdout); } catch { /* reported below */ }
  if (!result) die(`${label}: no result from run-async (exit ${r.status}): ${String(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  return { green: r.status === 0 && !!result.success, result };
}

function printSteps(result) {
  for (const s of result.stepResults || []) {
    const bits = [`  ${s.stepId}`, s.action, s.status];
    if (s.state) bits.push(`state=${s.state}`);
    if (s.error) bits.push(`— ${String(s.error).slice(0, 200)}`);
    console.log(bits.join(' '));
  }
}

/** Load a recipe, fill its params, optionally cut it at dryRunUntil, run it. */
function runRecipe(name, params, tabId) {
  const payload = JSON.parse(fs.readFileSync(path.join(TASKS, RECIPES[name]), 'utf8'));
  payload.params = { ...(payload.params || {}), ...params };
  if (dryRun) {
    const stop = payload.dryRunUntil;
    if (!stop) die(`${RECIPES[name]} has no dryRunUntil step, so it cannot dry-run`);
    const i = payload.chain.findIndex((s) => s.stepId === stop);
    payload.chain = payload.chain.slice(0, i + 1);
    delete payload.branches;
  }
  console.log(`substack: ${name}${dryRun ? ' (dry run, through ' + payload.dryRunUntil + ')' : ''} on tab ${tabId}`);
  const { green, result } = runPayload(payload, tabId, name);
  printSteps(result);
  if (!green) {
    const failed = (result.stepResults || []).find((s) => s.status === 'error');
    die(`${name} did not finish green${failed ? `: ${failed.stepId} ${failed.error}` : result.error ? `: ${result.error}` : ''}`, 1);
  }
  return result;
}

/** Read one of Substack's JSON endpoints in the tab (it carries Mike's session). */
function readJson(url, tabId) {
  const payload = {
    name: 'substack-read-json', site: 'substack.com', mode: 'verification', params: {},
    chain: [
      { stepId: 'r1', action: 'navigate', url },
      { stepId: 'r2', action: 'read', candidates: ['body'], store_as: 'json' },
    ],
  };
  const { green, result } = runPayload(payload, tabId, `read ${url}`);
  const text = (result.stepResults || []).find((s) => s.stepId === 'r2')?.text;
  if (!green || !text) die(`could not read ${url}`);
  try { return JSON.parse(text); } catch { die(`${url} did not return JSON (signed out?): ${text.slice(0, 120)}`); }
}

const draftsUrl = () => `https://${pub}.substack.com/api/v1/post_management/drafts?offset=0&limit=50&order_by=draft_updated_at&order_direction=desc`;
const secretLink = (d) => `https://${pub}.substack.com/p/${d.uuid}`;

async function main() {
  if (!RECIPES[cmd] && cmd !== 'drafts') die('usage: substack.mjs login|drafts|about|welcome|invite|draft|byline|publish [flags] (see the header of this file)');
  const status = await relay('/status');
  if (!status.extensionConnected) die('the Yeshie extension is not connected to the relay');
  const tabId = await substackTab();

  if (cmd === 'login') {
    runRecipe('login', {}, tabId);
    console.log('substack: signed in as @rsilt');
    return;
  }

  if (cmd === 'drafts') {
    const list = readJson(draftsUrl(), tabId);
    for (const d of list.posts || []) {
      console.log([d.id, d.is_published ? 'published' : 'draft', d.audience, JSON.stringify(d.draft_title || d.title || ''), secretLink(d)].join('\t'));
    }
    return;
  }

  if (cmd === 'about') {
    const file = opt('file'); if (!file) die('--file is required');
    const body_html = markdownToHtml(fs.readFileSync(file, 'utf8'));
    const proof_text = opt('proof'); checkProof(proof_text, body_html);
    runRecipe('about', { publication_subdomain: pub, body_html, proof_text }, tabId);
    if (!dryRun) console.log(`substack: About page saved; live at https://${pub}.substack.com/about`);
    return;
  }

  if (cmd === 'welcome') {
    const kind = opt('kind'); if (!WELCOME[kind]) die('--kind must be free or paid');
    const subject = opt('subject'); if (!subject) die('--subject is required');
    const file = opt('file'); if (!file) die('--file is required');
    const body_html = markdownToHtml(fs.readFileSync(file, 'utf8'));
    const proof_text = opt('proof'); checkProof(proof_text, body_html);
    runRecipe('welcome', { publication_subdomain: pub, ...WELCOME[kind], subject, subject_json: jsonEscape(subject), body_html, proof_text }, tabId);
    if (!dryRun) console.log(`substack: ${kind} welcome email saved`);
    return;
  }

  if (cmd === 'invite') {
    const email = opt('email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) die('--email must be an email address');
    runRecipe('invite', { publication_subdomain: pub, email }, tabId);
    if (!dryRun) console.log(`substack: invited ${email}; they accept from the email Substack sent`);
    return;
  }

  if (cmd === 'draft') {
    const file = opt('file'); if (!file) die('--file is required');
    const { meta, body } = parsePost(fs.readFileSync(file, 'utf8'));
    if (!meta.title) die(`${file} has no title in its front matter`);
    const body_html = markdownToHtml(body);
    checkProof(meta.proof, body_html, 'front matter proof');
    // No audience here: a Substack draft does not keep one (02-create-draft
    // anomalies). `publish --audience` chooses it in the Publish panel.
    const draft_id = opt('draft-id', 'new');
    runRecipe('draft', {
      publication_subdomain: pub, draft_id, title: meta.title, title_json: jsonEscape(meta.title),
      subtitle: meta.subtitle || '', body_html, proof_text: meta.proof,
    }, tabId);
    if (dryRun) return;
    // Find the draft (a new one's id is not in the editor's URL) and check what Substack saved.
    const list = readJson(draftsUrl(), tabId);
    const mine = (list.posts || []).filter((d) => d.draft_title === meta.title)
      .sort((a, b) => String(b.draft_updated_at).localeCompare(String(a.draft_updated_at)));
    const found = draft_id !== 'new' ? mine.find((d) => String(d.id) === String(draft_id)) : mine[0];
    if (!found) die(`no draft titled ${JSON.stringify(meta.title)} in the drafts list`, 1);
    const d = readJson(`https://${pub}.substack.com/api/v1/drafts/${found.id}`, tabId);
    const problems = [];
    if (d.draft_title !== meta.title) problems.push(`title is ${JSON.stringify(d.draft_title)}`);
    if ((meta.subtitle || '') && d.draft_subtitle !== meta.subtitle) problems.push(`subtitle is ${JSON.stringify(d.draft_subtitle)}`);
    if (!String(d.draft_body || '').includes(meta.proof)) problems.push('the saved body lacks the proof words (the autosave may not have landed)');
    // The first block must keep its kind. A paste that merged into the old first
    // block saved a credit paragraph as a heading (2026-09-15).
    const firstTag = (body_html.match(/^\s*<(\w+)/) || [])[1] || '';
    let firstSaved = '';
    try { firstSaved = JSON.parse(d.draft_body).content[0].type; } catch { /* reported below */ }
    if (firstTag === 'p' && firstSaved !== 'paragraph') problems.push(`the first block saved as ${firstSaved || 'nothing'}, not a paragraph`);
    if (/^h[1-6]$/.test(firstTag) && firstSaved !== 'heading') problems.push(`the first block saved as ${firstSaved || 'nothing'}, not a heading`);
    if (d.is_published) problems.push('it is published');
    if (problems.length) die(`draft ${found.id} saved wrong: ${problems.join('; ')}`, 1);
    if (mine.length > 1 && draft_id === 'new') console.log(`substack: note: ${mine.length} drafts share this title; checked the newest`);
    console.log(`substack: draft ${found.id} saved and checked (title, subtitle, body, first block). Secret link: ${secretLink(d)}`);
    return;
  }

  if (cmd === 'byline') {
    const draft_id = opt('draft-id'); if (!draft_id) die('--draft-id is required');
    const query = opt('query'); if (!query) die('--query is required');
    const pick = opt('pick', query);
    runRecipe('byline', { publication_subdomain: pub, draft_id, query, pick_text: pick, name_json: jsonEscape(pick) }, tabId);
    if (!dryRun) console.log(`substack: ${pick} is on draft ${draft_id}'s byline`);
    return;
  }

  if (cmd === 'publish') {
    const draft_id = opt('draft-id'); if (!draft_id) die('--draft-id is required');
    const d = readJson(`https://${pub}.substack.com/api/v1/drafts/${draft_id}`, tabId);
    if (!d.draft_title) die(`draft ${draft_id} has no title`);
    const audience = opt('audience', 'everyone');
    runRecipe('publish', { publication_subdomain: pub, draft_id, audience, title_json: jsonEscape(d.draft_title) }, tabId);
    if (!dryRun) console.log(`substack: published draft ${draft_id} with no email; https://${pub}.substack.com/archive`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => die(e.stack || e.message));
}
