#!/usr/bin/env node
/**
 * Claude → Suno song pipeline orchestrator.
 *
 * Runs the Yeshie recipes in sequence through the relay:
 *   1. claude.ai/open-project        (project_name)
 *   2. claude.ai/create-song-spec    (content)         -> reads TITLE/STYLE/LYRICS
 *   3. parse the spec
 *   4. suno.com/select-workspace     (workspace_name)
 *   5. suno.com/create-song          (title, style, lyrics)  -> GENERATES
 *
 * Recipes are interpolated client-side ({{param}} -> value) and POSTed to the
 * relay's /run, so we don't depend on relay-side param substitution.
 *
 * USAGE:
 *   node scripts/claude-to-suno.mjs --content "..." [--project "Yeshie Songs"] [--workspace "Yeshie Sandbox"] [--no-generate]
 */
import fs from 'node:fs';
import path from 'node:path';

const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const ROOT = path.join(process.env.HOME, 'Projects/yeshie/sites');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const noGenerate = args.includes('--no-generate');
const content = opt('content', 'what we are doing here');
const project = opt('project', 'Yeshie Songs');
const workspace = opt('workspace', 'Yeshie Sandbox');

const interpolate = (obj, params) => {
  if (typeof obj === 'string') return obj.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in params ? params[k] : `{{${k}}}`));
  if (Array.isArray(obj)) return obj.map((o) => interpolate(o, params));
  if (obj && typeof obj === 'object') { const r = {}; for (const k of Object.keys(obj)) r[k] = interpolate(obj[k], params); return r; }
  return obj;
};

async function runRecipe(relPath, params, timeoutMs = 120000) {
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  const payload = interpolate(file, params);
  const res = await fetch(`${RELAY}/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  return data;
}

const ok = (d) => !!(d && d.success && d.goalReached !== false);

function parseSpec(text) {
  if (!text) return null;
  const t = String(text);
  const title = (t.match(/TITLE:\s*(.+)/i) || [])[1]?.trim() || null;
  const style = (t.match(/STYLE:\s*(.+)/i) || [])[1]?.trim() || null;
  const li = t.search(/LYRICS:/i);
  const lyrics = li >= 0 ? t.slice(li + t.match(/LYRICS:/i)[0].length).trim() : null;
  return { title, style, lyrics };
}

(async () => {
  console.log('=== Claude → Suno pipeline ===');
  console.log('project:', project, '| workspace:', workspace, '| generate:', !noGenerate);

  console.log('\n[1/5] open project…');
  let r = await runRecipe('claude.ai/tasks/02-open-project.payload.json', { project_name: project }, 60000);
  console.log('   ', ok(r) ? 'OK' : 'FAIL ' + (r.error || ''));
  if (!ok(r)) process.exit(1);

  console.log('[2/5] ask Claude to write the song (waiting for the turn to finish)…');
  r = await runRecipe('claude.ai/tasks/03-create-song-spec.payload.json', { content }, 120000);
  if (!ok(r)) { console.log('    FAIL', r.error || ''); process.exit(1); }
  const spec = parseSpec(r.buffer?.song_spec);
  console.log('[3/5] parsed spec:');
  console.log('    TITLE:', spec?.title);
  console.log('    STYLE:', spec?.style);
  console.log('    LYRICS (head):', (spec?.lyrics || '').slice(0, 90).replace(/\n/g, ' / '));
  if (!spec?.title || !spec?.style || !spec?.lyrics) { console.log('    FAIL: could not parse all fields'); process.exit(1); }

  console.log('[4/5] select Suno workspace…');
  r = await runRecipe('suno.com/tasks/02-select-workspace.payload.json', { workspace_name: workspace }, 60000);
  console.log('   ', ok(r) ? 'OK' : 'warn ' + (r.error || '')); // non-fatal

  console.log('[5/5] create song in Suno' + (noGenerate ? ' (fill only)' : ' (GENERATING)') + '…');
  const songFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'suno.com/tasks/03-create-song.payload.json'), 'utf8'));
  if (noGenerate) songFile.chain = songFile.chain.filter((s) => s.stepId !== 's8');
  const payload = interpolate(songFile, { title: spec.title, style: spec.style, lyrics: spec.lyrics });
  const res = await fetch(`${RELAY}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }), signal: AbortSignal.timeout(90000) });
  const songResult = await res.json();
  const steps = (songResult.stepResults || []).map((s) => `${s.stepId}:${s.status}`).join(' ');
  console.log('    steps:', steps);
  console.log('\n=== ' + (ok(songResult) ? 'DONE — song submitted to Suno' : 'Suno step FAILED: ' + (songResult.error || '')) + ' ===');
  console.log('Title:', spec.title);
  process.exit(ok(songResult) ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
