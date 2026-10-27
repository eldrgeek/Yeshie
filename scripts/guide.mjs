#!/usr/bin/env node
/**
 * Guide Mike through a page by hand: open it in his Chrome, point a tooltip at
 * each control he has to use, and wait until he has done every step. When he
 * finishes, the relay shows a macOS notification and (closeOnDone) the
 * extension closes the tab. Yeshie never clicks for him; this is for steps a
 * human must do (sign-ins, export confirmations, consent screens).
 *
 * USAGE:
 *   node scripts/guide.mjs sites/chatgpt.com/guides/data-export.guide.json
 *   node scripts/guide.mjs <guide.json> --no-wait        # print {guideId, tabId} and exit
 *   node scripts/guide.mjs --wait <guideId>              # wait for a guide already running
 *   node scripts/guide.mjs --events <guideId>            # stream teach events (explain + steps)
 *   node scripts/guide.mjs --reply <guideId> --step N [--message TEXT] [--action skip|redo|replace] [--step-json FILE]
 *   node scripts/guide.mjs <guide.json> --profile mw.personalmail@gmail.com
 *
 * GUIDE FILE (short form; the script fills in stepIndex/totalSteps/defaults):
 *   {
 *     "title": "ChatGPT data export",
 *     "url": "https://chatgpt.com/#settings/DataControls",
 *     "closeOnDone": true,
 *     "steps": [
 *       { "instruction": "Click Export data.", "target": "button:has-text(\"Export\")",
 *         "doneWhen": { "selectorAppears": "button:has-text(\"Confirm export\")" },
 *         "alreadyDoneWhen": { "textAppears": "export requested" },
 *         "alreadyDoneNote": "Export already requested" }
 *     ]
 *   }
 *   target: CSS selector, may use :has-text("…") and comma fallbacks; "" for no
 *   single control (then doneWhen is required). doneWhen / alreadyDoneWhen: any of
 *   textAppears, selectorAppears, selectorGone, urlIncludes. Without doneWhen,
 *   clicking the target finishes the step. Each step tooltip has Explain (ask the
 *   guiding session) and "Skip, already done" (advance with outcome already).
 *
 * FLAGS:
 *   --no-wait          start the guide and exit
 *   --wait <guideId>   wait for an existing guide (prints explanations when settled)
 *   --events <guideId> long-poll and print teach events as JSON lines
 *   --reply <guideId>  POST /teach/reply (requires --step)
 *   --max-wait-ms N    give up waiting after N ms (default 1800000 = 30 min); the guide stays open
 *   --profile P        Chrome profile (email or label) to open the page in
 *   --no-notify        no macOS notification when it ends
 *
 * EXIT: 0 done, 2 skipped, 3 tab closed early, 4 still active at max wait, 1 error.
 *
 * ENV: YESHIE_RELAY (default http://localhost:3333), DISPATCH_DIR (default ~/.dispatch,
 *      holds relay.secret)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RELAY = process.env.YESHIE_RELAY || 'http://localhost:3333';
const DISPATCH_DIR = process.env.DISPATCH_DIR || path.join(os.homedir(), '.dispatch');
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const EXIT = { done: 0, skipped: 2, closed: 3, active: 4 };

function die(message) {
  console.error(`guide: ${message}`);
  process.exit(1);
}

const token = (() => {
  try { return fs.readFileSync(path.join(DISPATCH_DIR, 'relay.secret'), 'utf8').trim(); } catch { return ''; }
})();
if (!token) die(`no relay secret at ${path.join(DISPATCH_DIR, 'relay.secret')}`);
const headers = { 'content-type': 'application/json', 'x-dispatch-token': token };

export function expandGuide(guide) {
  const steps = (guide.steps || []).map((s, i, all) => ({
    stepIndex: i,
    totalSteps: all.length,
    instruction: s.instruction,
    targetSelector: s.target ?? '',
    highlightTarget: s.highlight ?? !!s.target,
    position: s.position || 'auto',
    ...(s.doneWhen ? { doneWhen: s.doneWhen } : {}),
    ...(s.alreadyDoneWhen ? { alreadyDoneWhen: s.alreadyDoneWhen } : {}),
    ...(s.alreadyDoneNote ? { alreadyDoneNote: s.alreadyDoneNote } : {}),
  }));
  const body = { steps };
  for (const key of ['url', 'title', 'guideId', 'closeOnDone']) if (guide[key] !== undefined) body[key] = guide[key];
  if (body.closeOnDone === undefined) body.closeOnDone = true;
  return body;
}

function printExplanations(guide) {
  if (Array.isArray(guide.explanations) && guide.explanations.length > 0) {
    console.error('guide explanations:');
    for (const ex of guide.explanations) {
      console.error(`  step ${ex.stepIndex}: ${ex.text}`);
    }
  }
}

async function waitFor(guideId) {
  const deadline = Date.now() + Number(opt('max-wait-ms', 1_800_000));
  let guide;
  while (Date.now() < deadline) {
    const waitMs = Math.min(240_000, Math.max(1000, deadline - Date.now()));
    const res = await fetch(`${RELAY}/teach/result/${guideId}?waitMs=${waitMs}`, { headers });
    guide = await res.json();
    if (!res.ok) die(`result ${res.status}: ${guide.error || JSON.stringify(guide)}`);
    if (guide.status !== 'active') break;
  }
  printExplanations(guide);
  console.log(JSON.stringify(guide));
  process.exit(EXIT[guide.status] ?? 1);
}

async function streamEvents(guideId) {
  let since = 0;
  for (;;) {
    const waitMs = 240_000;
    const res = await fetch(`${RELAY}/teach/events/${guideId}?since=${since}&waitMs=${waitMs}`, { headers });
    const data = await res.json();
    if (!res.ok) die(`events ${res.status}: ${data.error || JSON.stringify(data)}`);
    for (const event of data.events || []) {
      console.log(JSON.stringify(event));
    }
    since = data.next ?? since;
    const statusRes = await fetch(`${RELAY}/teach/result/${guideId}?waitMs=0`, { headers });
    const status = await statusRes.json();
    if (status.status && status.status !== 'active') break;
  }
}

async function postReply(guideId) {
  const stepIndex = Number(opt('step'));
  if (!Number.isInteger(stepIndex) || stepIndex < 0) die('--reply requires --step N');
  const body = { stepIndex };
  const message = opt('message');
  if (message !== undefined) body.message = message;
  const action = opt('action');
  if (action !== undefined) body.action = action;
  const stepJson = opt('step-json');
  if (stepJson) body.step = JSON.parse(fs.readFileSync(stepJson, 'utf8'));
  const res = await fetch(`${RELAY}/teach/reply/${guideId}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) die(`reply ${res.status}: ${data.error || JSON.stringify(data)}`);
  console.log(JSON.stringify(data));
}

const eventsId = opt('events');
if (eventsId) {
  await streamEvents(eventsId);
  process.exit(0);
}

const replyId = opt('reply');
if (replyId) {
  await postReply(replyId);
  process.exit(0);
}

const waitId = opt('wait');
if (waitId) await waitFor(waitId);

const file = args.find(a => a.endsWith('.json'));
if (!file) die('give a guide .json file or --wait <guideId>');
const body = expandGuide(JSON.parse(fs.readFileSync(file, 'utf8')));
if (flag('no-notify')) body.notify = false;
const profile = opt('profile');
if (profile) body.target = profile;

const res = await fetch(`${RELAY}/teach/start`, { method: 'POST', headers, body: JSON.stringify(body) });
const started = await res.json();
if (!res.ok) die(`start ${res.status}: ${started.error || JSON.stringify(started)}`);
console.error(`guide ${started.guideId} running in tab ${started.tabId}`);
if (flag('no-wait')) {
  console.log(JSON.stringify(started));
  process.exit(0);
}
await waitFor(started.guideId);
