#!/usr/bin/env node
/**
 * One-call DNS record changes for a GoDaddy-hosted zone, through Yeshie.
 *
 * There are no GoDaddy API credentials on this Mac, so a change goes through
 * the DNS Records page in the logged-in Chrome. This wrapper:
 *   1. asks the zone's authoritative nameserver whether the change is already
 *      in place, and exits 0 early if it is;
 *   2. finds a dcc.godaddy.com tab through the relay, or opens one. It never
 *      runs on whatever tab happens to be active;
 *   3. runs sites/dcc.godaddy.com/tasks/01-add-dns-record (or 02-delete-...)
 *      on that tab via scripts/run-async.mjs;
 *   4. polls every nameserver of the zone until each one answers, with the
 *      aa flag, the way the change says it should, and prints that dig output.
 * It exits 0 only when the recipe ran green AND every nameserver agrees.
 *
 * It only ever queries the zone's own nameservers, with +norec. A public
 * resolver that is asked about a name before the name exists caches the
 * NXDOMAIN for the SOA minimum (600 s at GoDaddy), and anyone using that
 * resolver would then miss the new record for that long.
 *
 * USAGE:
 *   node scripts/godaddy-dns.mjs add    --type A   --name sala --value 217.77.6.197 [--ttl 1800]
 *   node scripts/godaddy-dns.mjs delete --type TXT --name _yeshie-test --value ok-2026-09-14
 *
 * FLAGS:
 *   --domain D   zone (default mike-wolf.com)
 *   --ttl S      add only; one of GoDaddy's presets: 1800 (default), 3600, 43200, 86400, 604800
 *   --ns HOST    verify against this nameserver only (default: every NS of the zone)
 *   --wait-s N   how long to poll the nameservers after the recipe (default 180)
 *   --dry-run    check the nameservers and find the tab; change nothing
 *
 * EXIT: 0 done and verified (or already in place) · 1 recipe or verification
 * failed · 2 usage, relay, or DNS-transport problem.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const RECIPES = {
  add: 'sites/dcc.godaddy.com/tasks/01-add-dns-record.payload.json',
  delete: 'sites/dcc.godaddy.com/tasks/02-delete-dns-record.payload.json',
};
// Types whose GoDaddy form is just Name + Value (+ TTL). MX, SRV and CAA add
// fields the recipes do not fill.
const TYPES = ['a', 'aaaa', 'cname', 'txt'];

const argv = process.argv.slice(2);
const op = argv[0];
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

function die(msg, code = 2) {
  console.error(`godaddy-dns: ${msg}`);
  process.exit(code);
}

if (!RECIPES[op]) die('usage: godaddy-dns.mjs add|delete --type T --name N --value V [--ttl S] [--domain D]');
const domain = String(opt('domain', 'mike-wolf.com')).toLowerCase().replace(/\.$/, '');
const name = opt('name');
const value = opt('value');
const type = String(opt('type', '')).toLowerCase();
const ttl = String(opt('ttl', '1800'));
if (!name || !value || !type) die('--type, --name and --value are required');
if (!TYPES.includes(type)) die(`--type must be one of ${TYPES.join(', ')} (got "${type}")`);
const fqdn = name === '@' ? domain : `${name}.${domain}`;

/** dig one nameserver directly (+norec: the nameserver's own answer, never a resolver's). */
function dig(ns) {
  let out;
  try {
    out = execFileSync('dig', ['+norec', '+noall', '+comments', '+answer', `@${ns}`, fqdn, type.toUpperCase()], { encoding: 'utf8', timeout: 20000 });
  } catch (e) {
    die(`dig @${ns} failed: ${e.message}`);
  }
  const flags = ((out.match(/;; flags: ([^;]*);/) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
  const status = (out.match(/status: (\w+)/) || [])[1] || 'UNKNOWN';
  const answers = out.split('\n').filter((l) => l.trim() && !l.startsWith(';'));
  // "<name> <ttl> IN <TYPE> <data...>"; TXT data arrives quoted, possibly split into several strings.
  const values = answers
    .filter((l) => l.split(/\s+/)[3] === type.toUpperCase())
    .map((l) => l.split(/\s+/).slice(4).join(' ').replace(/"\s+"/g, '').replace(/^"|"$/g, ''));
  const evidence = out.split('\n').filter((l) => /^;; (->>HEADER|flags)/.test(l) || (l.trim() && !l.startsWith(';'))).join('\n');
  return { ns, flags, status, values, evidence };
}

const norm = (v) => (type === 'txt' ? v : v.toLowerCase().replace(/\.$/, ''));
const hasRecord = (r) => r.values.some((v) => norm(v) === norm(value));

function checkAll(nameservers) {
  return nameservers.map((ns) => {
    const r = dig(ns);
    if (!r.flags.includes('aa')) {
      die(`${ns} did not answer authoritatively for ${fqdn} (flags: ${r.flags.join(' ') || 'none'}, status ${r.status}). Something between this Mac and the nameserver is answering instead.`);
    }
    return r;
  });
}

function zoneNameservers() {
  const out = execFileSync('dig', ['+short', 'NS', domain], { encoding: 'utf8', timeout: 20000 });
  return out.split('\n').map((s) => s.trim().replace(/\.$/, '')).filter(Boolean).sort();
}

/** The id of an open dcc.godaddy.com tab, or null. Retries a failed listing rather than opening a duplicate tab. */
async function listGodaddyTab() {
  for (let attempt = 1; ; attempt++) {
    const tabs = await fetch(`${RELAY}/tabs/list`).then((r) => r.json()).catch((e) => ({ error: e.message }));
    if (Array.isArray(tabs)) return tabs.find((t) => String(t.url || '').startsWith('https://dcc.godaddy.com/'))?.tabId ?? null;
    if (attempt === 3) die(`the relay at ${RELAY} could not list tabs: ${JSON.stringify(tabs)}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function godaddyTab() {
  const existing = await listGodaddyTab();
  if (existing) return existing;
  const url = `https://dcc.godaddy.com/control/portfolio/${domain}/settings?tab=dns`;
  const res = await fetch(`${RELAY}/tabs/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.tabId) return data.tabId;
  // The relay stops waiting for open_tab after 20 s, but GoDaddy's page can take
  // longer to load, and the tab usually exists by then (seen 2026-09-14).
  const late = await listGodaddyTab();
  if (late) return late;
  die(`could not open a GoDaddy tab: HTTP ${res.status} ${JSON.stringify(data)}`);
}

function runRecipe(tabId) {
  const args = [
    path.join(HERE, 'run-async.mjs'), path.join(REPO, RECIPES[op]), '--tab', String(tabId), '--json',
    '--param', `domain=${domain}`, '--param', `type=${type}`, '--param', `name=${name}`, '--param', `value=${value}`,
  ];
  if (op === 'add') args.push('--param', `ttl=${ttl}`);
  // A ChainResult carries DOM-mutation diagnostics and easily passes spawnSync's
  // default 1 MB stdout cap. Past the cap Node kills the child and the JSON arrives
  // cut off, which is how the first live run lost its step list.
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 });
  let result = null;
  try { result = JSON.parse(r.stdout); } catch { /* explained in `why` */ }
  const steps = (result?.stepResults || []).map((s) => `${s.stepId}:${s.status}`).join(' ');
  const failed = (result?.stepResults || []).find((s) => s.status === 'error');
  const why = failed
    ? `${failed.stepId} (${failed.action}): ${failed.error}`
    : result?.error || (result
      ? 'no failing step reported'
      : `no parseable result from run-async (exit ${r.status}${r.error ? `, ${r.error.message}` : ''}, ${String(r.stdout || '').length} bytes on stdout)`);
  return { green: r.status === 0, result, steps, why };
}

(async () => {
  const nameservers = opt('ns') ? [opt('ns')] : zoneNameservers();
  if (!nameservers.length) die(`no NS records found for ${domain}`);
  const wantRecord = op === 'add';
  const label = `${fqdn} ${type.toUpperCase()} ${value}`;

  const before = checkAll(nameservers);
  if (before.every((r) => hasRecord(r) === wantRecord)) {
    console.log(`already ${wantRecord ? 'present' : 'absent'} on ${nameservers.join(', ')}: ${label}`);
    before.forEach((r) => console.log(`--- ${r.ns}\n${r.evidence}`));
    return;
  }

  // Each recipe starts with s00, an assert that requires the runtime features
  // it uses (src/runtime-features.ts): select for add, within_row.cells for
  // delete. Every build since 2026-09-13 stops at s00 unless it lists them.
  // Builds from before 2026-09-13 do not stop on a failed assert, and on those
  // the delete recipe would click the first Delete button in the table. This
  // check keeps them out: Yeshie #66 (select, within_row) loaded as 0.1.540.
  const MIN_BUILD = '0.1.540';
  const status = await fetch(`${RELAY}/status`).then((r) => r.json()).catch((e) => die(`relay unreachable at ${RELAY}: ${e.message}`));
  const instance = (status.instances || []).find((i) => i.isDefault);
  const build = instance?.version || status.buildVersion;
  const parts = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const [have, need] = [parts(build), parts(MIN_BUILD)];
  const cmp = have.map((h, i) => h - (need[i] || 0)).find((d) => d !== 0) || 0;
  if (!status.extensionConnected || cmp < 0) {
    die(`the Yeshie extension must be connected at build ${MIN_BUILD} or later (connected: ${!!status.extensionConnected}, build: ${build || 'unknown'})`);
  }

  const tabId = await godaddyTab();
  if (flag('dry-run')) {
    console.log(JSON.stringify({ dryRun: true, op, label, tabId, nameservers, before: before.map((r) => ({ ns: r.ns, status: r.status, values: r.values })) }, null, 2));
    return;
  }

  // Bring the tab to the front for the run. In a hidden, unfocused tab Chrome
  // throttles the page: GoDaddy's DNS page took 27 s to load there, and a Filters
  // click made during that load was lost (2026-09-14). The add recipe reads every
  // field back before Save, so stray typing during the run cannot change a record
  // unnoticed.
  const shown = await fetch(`${RELAY}/tabs/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId }) })
    .then((r) => r.ok).catch(() => false);
  if (!shown) console.error(`godaddy-dns: could not bring tab ${tabId} to the front; running anyway`);
  console.error(`godaddy-dns: ${op} ${label} on GoDaddy tab ${tabId}${shown ? ' (brought to the front for the run)' : ''}`);
  const run = runRecipe(tabId);
  console.error(`godaddy-dns: recipe steps ${run.steps || '(none reported)'}`);
  if (!run.green) die(`recipe did not finish green: ${run.why}`, 1);

  const waitS = Number(opt('wait-s', '180'));
  const deadline = Date.now() + waitS * 1000;
  for (;;) {
    const now = checkAll(nameservers);
    if (now.every((r) => hasRecord(r) === wantRecord)) {
      console.log(`verified ${wantRecord ? 'present' : 'gone'} on ${nameservers.join(', ')} (authoritative, aa): ${label}`);
      now.forEach((r) => console.log(`--- ${r.ns}\n${r.evidence}`));
      return;
    }
    if (Date.now() > deadline) {
      now.forEach((r) => console.error(`--- ${r.ns}\n${r.evidence}`));
      die(`the recipe ran green, but after ${waitS}s the nameservers do not all show the record ${wantRecord ? 'present' : 'gone'}`, 1);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
})().catch((e) => die(e.message));
