#!/usr/bin/env node
/**
 * collab-edit — let an agent/worker join a report's collab room and edit the
 * live Yjs doc (so a human watching the SOMA editor sees the change in realtime,
 * and it persists to the .md via the relay). Reuses the same room scheme as the
 * editor: room = base64url(filepath).
 *
 * Usage:
 *   collab-edit --path <file> [--user "agent:dee"] [--color "#a855f7"] [--url http://localhost:3333] <cmd> [text]
 *   cmds: read | append [text|-] | set [text|-] | insert --at N [text|-]
 *   text "-" (or omitted for append/set) reads the payload from stdin.
 */
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { readFileSync } from 'fs';

const argv = process.argv.slice(2);
const opts = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { opts[argv[i].slice(2)] = argv[i + 1]; i++; }
  else pos.push(argv[i]);
}
const path = opts.path, user = opts.user || 'agent', color = opts.color || '#a855f7';
const url = opts.url || 'http://localhost:3333';
const cmd = pos[0];
let text = pos.slice(1).join(' ');
if ((cmd === 'append' || cmd === 'set' || cmd === 'insert') && (text === '-' || text === '')) {
  try { text = readFileSync(0, 'utf8'); } catch { text = ''; }
}
if (!path || !cmd) { console.error('usage: collab-edit --path <file> <read|append|set|insert> [text|-]'); process.exit(2); }

const room = Buffer.from(path, 'utf8').toString('base64url');
const doc = new Y.Doc();
const provider = new SocketIOProvider(url, room, doc, { autoConnect: true, disableBc: true });
const ytext = doc.getText('content');
provider.awareness.setLocalStateField('user', { name: user, color, colorLight: color + '33' });

await new Promise(r => { let d = false; provider.on('sync', s => { if (s && !d) { d = true; r(); } }); setTimeout(() => { if (!d) { d = true; r(); } }, 4000); });
await new Promise(r => setTimeout(r, 200));

if (cmd === 'read') {
  process.stdout.write(ytext.toString());
} else if (cmd === 'append') {
  const cur = ytext.toString();
  const sep = (cur === '' || cur.endsWith('\n')) ? '' : '\n';
  ytext.insert(ytext.length, sep + text + (text.endsWith('\n') ? '' : '\n'));
} else if (cmd === 'set') {
  ytext.delete(0, ytext.length); ytext.insert(0, text);
} else if (cmd === 'insert') {
  const at = parseInt(opts.at || '0', 10) || 0;
  ytext.insert(Math.min(at, ytext.length), text);
} else { console.error('unknown cmd: ' + cmd); process.exit(2); }

await new Promise(r => setTimeout(r, cmd === 'read' ? 50 : 1300)); // flush + server debounced save
provider.destroy();
process.exit(0);
