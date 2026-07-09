#!/usr/bin/env python3
"""
Convert fixed `delay` steps in GitHub recipes to `wait_for` guards (the canon).

WHY: a fixed `delay` is fragile (too short → acts before content exists; too long →
every run pays worst-case) and slow. `wait_for` resolves the instant its target is
present+visible and only times out on a genuinely stuck page — faster AND safer.

RULES (by the delay's surrounding context: prev action → delay → next action):
  * → read                      : settle — wait_for `.application-main` (GitHub's
                                  stable content wrapper; verified present+visible
                                  across repo/issues/pulls/search/profile/gist).
  navigate → (click|key|...)     : settle before interacting — wait_for `.application-main`.
  click → click                  : a menu/overlay is opening — wait_for the menu.
  click → END                    : terminal mutation — wait_for a confirmation flash
                                  (the canonical "did it land" signal). NOTE: these
                                  live in state-changing recipes that need auth, so
                                  they are converted but NOT live-verified here.
  (fallback)                      : settle — wait_for `.application-main`.

Idempotent: re-running skips files with no remaining `delay` steps.
"""
import json, glob, os, sys

TASKS = sorted(glob.glob(os.path.expanduser('~/Projects/yeshie/sites/github.com/tasks/*.payload.json')))
SETTLE = lambda: {"action": "wait_for", "selector": ".application-main", "timeout": 8000}
MENU   = lambda: {"action": "wait_for", "selector": '[role="menu"], [role="dialog"], [role="listbox"], .Overlay', "timeout": 6000}
FLASH  = lambda: {"action": "wait_for", "selector": '[role="alert"], .flash, .js-flash-alert, [data-testid="toast"]', "timeout": 8000}

def repl_for(prev, nxt):
    if nxt == 'read': return SETTLE(), 'settle→read'
    if prev == 'click' and nxt == 'click': return MENU(), 'menu'
    if prev == 'click' and nxt == 'END': return FLASH(), 'confirm-flash'
    return SETTLE(), 'settle'

report, total = [], 0
for path in TASKS:
    doc = json.load(open(path))
    p = doc.get('payload', doc)
    ch = p.get('chain', [])
    if not any(s.get('action') == 'delay' for s in ch):
        continue
    new, kinds = [], []
    for i, s in enumerate(ch):
        if s.get('action') != 'delay':
            new.append(s); continue
        prev = ch[i-1]['action'] if i > 0 else 'START'
        nxt  = ch[i+1]['action'] if i+1 < len(ch) else 'END'
        wf, kind = repl_for(prev, nxt)
        wf['stepId'] = s.get('stepId', f'wf{i}')
        if s.get('note'): wf['note'] = s['note']
        new.append(wf); kinds.append(kind)
    p['chain'] = new
    json.dump(doc, open(path, 'w'), indent=2)
    open(path, 'a').write('\n')
    report.append((os.path.basename(path).replace('.payload.json',''), kinds))
    total += len(kinds)

print(f"Converted {len(report)} files, {total} delay→wait_for steps.")
from collections import Counter
allk = Counter(k for _, ks in report for k in ks)
print("By kind:", dict(allk))
for name, ks in report:
    print(f"  {name}: {len(ks)} ({','.join(ks)})")
