#!/usr/bin/env node
/**
 * Learn a task from one Do-It-Once recording: turn what Mike clicked and typed
 * into a guide (tooltips he follows) and a draft payload (Yeshie does it).
 *
 * Record first: Ctrl+Alt+R in Chrome (or POST /trace/toggle), do the task,
 * Ctrl+Alt+R again. The extension posts every event to the relay, which keeps
 * it in ~/.dispatch/traces/<episodeId>.jsonl.
 *
 * USAGE:
 *   node scripts/learn-task.mjs --list                          # recent recordings
 *   node scripts/learn-task.mjs <episodeId> --name zoom-passcode
 *   node scripts/learn-task.mjs trace.jsonl --name x --title "Change the Zoom passcode"
 *   node scripts/learn-task.mjs <episodeId> --name x --dry-run  # print, write nothing
 *
 * WRITES (refuses to overwrite without --force):
 *   sites/<host>/guides/<name>.guide.json   run with: node scripts/guide.mjs <file>
 *   sites/<host>/tasks/<name>.payload.json  _meta.learned.status = "draft"
 *
 * The compiler is mechanical. Its instructions are terse and it prints review
 * notes for anything it could not pin down; the learn-task skill has Claude
 * reword the guide and settle the notes before Mike runs it.
 *
 * ENV: YESHIE_RELAY (default http://localhost:3333), DISPATCH_DIR (default ~/.dispatch)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

/** Field names whose recorded values must never be written to a file. */
const SECRET_NAME_RE = /pass|pwd|secret|token|pin\b|otp|code|cvc|cvv|ssn/i;

const ACTION_EVENTS = new Set(['click', 'input', 'navigate']);

function clean(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 40).trim() : t;
}

function quoteSel(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function targetKey(t) {
  return t ? `${t.role || ''}|${clean(t.name)}|${t.selector || ''}` : '';
}

/** Selector the overlay and the runtime both accept: stable attribute first, then :has-text. */
export function selectorFor(target) {
  const name = clean(target?.name);
  const parts = [];
  if (target?.selector) parts.push(target.selector);
  if (name) {
    const q = quoteSel(name);
    if (target.role === 'button') parts.push(`button:has-text("${q}")`, `[role="button"]:has-text("${q}")`);
    else if (target.role === 'link') parts.push(`a:has-text("${q}")`);
    else if (target.role === 'menuitem' || target.role === 'option' || target.role === 'tab') parts.push(`[role="${target.role}"]:has-text("${q}")`);
    else if (!['textbox', 'combobox', 'checkbox', 'radio'].includes(target.role)) parts.push(`${target.role || '*'}:has-text("${q}")`);
  }
  return [...new Set(parts)].join(', ');
}

/** What the guide's urlIncludes checks: path (and hash route), or the host for a bare root. */
export function urlMarker(url) {
  try {
    const u = new URL(url);
    const marker = u.pathname + (u.hash.startsWith('#/') || u.hash.startsWith('#settings') ? u.hash : '');
    return marker === '/' ? u.hostname : u.hostname + marker;
  } catch {
    return url;
  }
}

/**
 * doneWhen for a click that loaded another page. urlIncludes is a substring
 * test, so when the new URL is a prefix of the old one (/meeting/1/edit ->
 * /meeting/1) it already holds; wait for the clicked control to go instead.
 */
function leftPage(click) {
  const marker = urlMarker(click.navigatedTo);
  if (click.url && click.url.includes(marker)) {
    return { selectorGone: selectorFor(click.target) };
  }
  return { urlIncludes: marker };
}

function samePage(a, b) {
  return urlMarker(a) === urlMarker(b);
}

function slug(text, fallback) {
  const s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return s || fallback;
}

/**
 * Reduce raw events to the actions Mike meant: one input per field (its last
 * value), no focus click right before typing, and each navigation tied to the
 * click that caused it. Returns { startUrl, actions }.
 */
export function reduceTrace(events) {
  const evs = events
    .filter(e => ACTION_EVENTS.has(e.event_type || e.type))
    .map(e => ({ ...e, kind: e.event_type || e.type }))
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const firstAction = evs.find(e => e.kind !== 'navigate');
  const startUrl = firstAction?.url || evs[0]?.url || null;
  const actions = [];
  let currentUrl = startUrl;
  let started = false;

  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    if (ev.kind === 'navigate') {
      if (!started || !ev.url || samePage(ev.url, currentUrl)) { if (ev.url) currentUrl = ev.url; continue; }
      const last = actions[actions.length - 1];
      if (last?.kind === 'click' && !last.navigatedTo) last.navigatedTo = ev.url;
      else actions.push({ kind: 'navigate', url: ev.url });
      currentUrl = ev.url;
      continue;
    }
    started = true;
    const key = targetKey(ev.target);
    if (ev.kind === 'click') {
      const next = evs.slice(i + 1).find(e => e.kind !== 'navigate');
      if (next?.kind === 'input' && targetKey(next.target) === key) continue; // focus click
      actions.push({ kind: 'click', target: ev.target, url: ev.url });
      continue;
    }
    const last = actions[actions.length - 1];
    if (last?.kind === 'input' && last.key === key) last.value = ev.value?.literal ?? last.value;
    else actions.push({ kind: 'input', key, target: ev.target, url: ev.url, value: ev.value?.literal ?? '' });
  }
  return { startUrl, actions };
}

/** Compile a recorded trace into { guide, payload, notes, host }. */
export function compileTrace(events, { name, title, episodeId } = {}) {
  const { startUrl, actions } = reduceTrace(events);
  if (!actions.length) throw new Error('The recording has no clicks or typing to learn from');
  const host = (() => { try { return new URL(startUrl).hostname; } catch { return 'unknown'; } })();
  const notes = [];
  if (!/^https:\/\//.test(startUrl || '')) {
    notes.push(`The start page ${startUrl} is not https; guide.mjs only opens https pages, so this guide cannot run as is.`);
  }

  // Abstract targets, one per distinct control, named from what Mike saw.
  const targets = {};
  const targetIds = new Map();
  const params = { start_url: { required: false, default: startUrl, description: 'Page the task starts on' } };
  const paramIds = new Map();
  for (const a of actions) {
    if (!a.target || targetIds.has(targetKey(a.target))) continue;
    const label = clean(a.target.name);
    let id = slug(label, `${a.target.role || 'control'}_${targetIds.size + 1}`);
    while (targets[id]) id += '_2';
    targetIds.set(targetKey(a.target), id);
    const selector = selectorFor(a.target);
    if (!selector) notes.push(`Control ${id} has no name or stable attribute; add a selector before running.`);
    targets[id] = {
      description: `${a.target.role || 'control'} "${label}"${a.url ? ` on ${urlMarker(a.url)}` : ''}`,
      ...(label ? { match: { name_contains: [label] } } : {}),
      ...(a.target.selector?.startsWith('[aria-label=') ? { anchors: { ariaLabel: a.target.name } } : {}),
      fallbackSelectors: selector ? selector.split(', ') : [],
    };
  }
  for (const a of actions.filter(x => x.kind === 'input')) {
    const label = clean(a.target?.name) || 'value';
    let id = slug(label, 'value');
    while (params[id]) id += '_2';
    paramIds.set(a, id);
    const secret = SECRET_NAME_RE.test(label);
    params[id] = {
      required: true,
      description: `What to type in "${label}"`,
      ...(!secret && a.value ? { example: a.value } : {}),
    };
    if (secret) notes.push(`"${label}" looks secret, so the recorded value was not kept.`);
  }

  // Guide: typing folds into the click that submits it ("Type X, then click Save").
  const steps = [];
  let typing = [];
  for (const a of actions) {
    if (a.kind === 'input') { typing.push(a); continue; }
    if (a.kind === 'navigate') {
      steps.push({ instruction: `Go to ${urlMarker(a.url)}.`, target: '', doneWhen: { urlIncludes: urlMarker(a.url) } });
      continue;
    }
    const label = clean(a.target?.name) || a.target?.role || 'the highlighted control';
    const click = a.target?.role === 'link' ? `click the ${label} link` : `click ${label}`;
    const typed = typing.map(t => `type the ${(clean(t.target?.name) || 'value').toLowerCase()} in the ${clean(t.target?.name) || 'highlighted'} box`);
    const text = typed.length ? `${typed.join(', ')}, then ${click}` : click;
    steps.push({
      instruction: `${text[0].toUpperCase()}${text.slice(1)}.`,
      target: selectorFor(a.target),
      ...(a.navigatedTo ? { doneWhen: leftPage(a) } : {}),
    });
    typing = [];
  }
  for (const t of typing) {
    const label = clean(t.target?.name) || 'value';
    steps.push({ instruction: `Type the ${label.toLowerCase()} in the ${label} box.`, target: selectorFor(t.target) });
    notes.push(`The last step only types into "${label}" with nothing clicked after; clicking the box will finish it, so add a doneWhen.`);
  }

  const guide = {
    title: title || name || `Learned task on ${host}`,
    url: startUrl,
    closeOnDone: true,
    learnedFrom: episodeId || null,
    steps,
  };

  // Payload: same actions, done by Yeshie with the typed values as params.
  const chain = [{ stepId: 's1', action: 'navigate', url: '{{start_url}}' }];
  let n = 1;
  actions.forEach((a, i) => {
    const stepId = `s${++n}`;
    if (a.kind === 'navigate') { chain.push({ stepId, action: 'navigate', url: a.url }); return; }
    const target = targetIds.get(targetKey(a.target));
    if (a.kind === 'input') { chain.push({ stepId, action: 'type', target, value: `{{${paramIds.get(a)}}}` }); return; }
    chain.push({ stepId, action: 'click', target });
    const next = actions[i + 1];
    if (a.navigatedTo && next?.target) {
      chain.push({ stepId: `${stepId}-settle`, action: 'wait_for', target: targetIds.get(targetKey(next.target)), timeout: 15000 });
    }
  });

  const taskName = name || slug(title, 'learned_task');
  const payload = {
    _meta: {
      task: taskName,
      description: title || `Learned from a Do-It-Once recording on ${host}`,
      selfImproving: true,
      runCount: 0,
      lastSuccess: null,
      params,
      learned: {
        episodeId: episodeId || null,
        compiledAt: new Date().toISOString(),
        status: 'draft',
        cleanGuidedRuns: 0,
        promoteAfter: 2,
      },
    },
    site: host,
    params: Object.fromEntries(Object.entries(params).filter(([, p]) => p.default !== undefined).map(([k, p]) => [k, p.default])),
    abstractTargets: targets,
    chain,
  };
  return { guide, payload, notes, host };
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function relayHeaders() {
  const dir = process.env.DISPATCH_DIR || path.join(os.homedir(), '.dispatch');
  let token = '';
  try { token = fs.readFileSync(path.join(dir, 'relay.secret'), 'utf8').trim(); } catch { /* none */ }
  return { 'x-dispatch-token': token };
}

async function relayGet(p) {
  const relay = process.env.YESHIE_RELAY || 'http://localhost:3333';
  const res = await fetch(relay + p, { headers: relayHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `relay ${res.status}`);
  return data;
}

async function loadEvents(source) {
  if (fs.existsSync(source)) {
    return fs.readFileSync(source, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
  return (await relayGet(`/trace/${encodeURIComponent(source)}`)).events;
}

function writeOnce(file, data, force) {
  if (fs.existsSync(file) && !force) throw new Error(`${path.relative(REPO_ROOT, file)} exists; pass --force to replace it`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

async function main(args) {
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--list')) {
    for (const t of (await relayGet('/trace')).traces) {
      console.log(`${t.episodeId}  ${t.updatedAt}  ${String(t.events).padStart(4)} events  ${t.url || ''}`);
    }
    return;
  }
  const source = args.find(a => !a.startsWith('--') && a !== opt('name') && a !== opt('title') && a !== opt('out'));
  if (!source) throw new Error('usage: learn-task.mjs <episodeId|trace.jsonl> --name <slug> [--title T] [--dry-run] [--force]');
  const name = opt('name');
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('--name must be a lowercase slug, e.g. zoom-passcode');
  const episodeId = fs.existsSync(source) ? path.basename(source, '.jsonl') : source;
  const { guide, payload, notes, host } = compileTrace(await loadEvents(source), { name, title: opt('title'), episodeId });

  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ guide, payload }, null, 2));
  } else {
    const out = opt('out') || path.join(REPO_ROOT, 'sites');
    const guideFile = path.join(out, host, 'guides', `${name}.guide.json`);
    const payloadFile = path.join(out, host, 'tasks', `${name}.payload.json`);
    writeOnce(guideFile, guide, args.includes('--force'));
    writeOnce(payloadFile, payload, args.includes('--force'));
    console.log(`guide:   ${path.relative(process.cwd(), guideFile)} (${guide.steps.length} steps)`);
    console.log(`payload: ${path.relative(process.cwd(), payloadFile)} (draft)`);
  }
  for (const n of notes) console.error(`review: ${n}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(err => { console.error(`learn-task: ${err.message}`); process.exit(1); });
}
