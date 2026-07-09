#!/usr/bin/env python3
"""
Fleet-wide delay -> wait_for converter (all sites except github.com, which has its
own selector-specific converter — scripts/convert-delays-to-waitfor.py).

RULES (by the delay's next step):
  * next step has its own `target`/`selector` (click/type/wait_for/select):
      -> wait_for THAT element, state visible. NO onTimeout — it's the real
         precondition for the next action, and it's the recipe's OWN selector
         (not a guess), so a loud timeout is correct.
  * everything else (settle before read/perceive/find_row/click_text/nav/END):
      -> wait_for a broad content-root union, with onTimeout:'continue'. This is
         a SETTLE wait: it resolves the instant a content root is present and, if
         the guess never matches, PROCEEDS anyway (never worse than the old fixed
         sleep). Requires the wait_for onTimeout:'continue' engine support.
  * >= 15s delays (LLM-generation sleeps): same settle+onTimeout, but keep the long
      timeout as the fallback max. Flagged for hand-tuning to a real completion
      signal (stop-button gone / response present) per site.

timeout: max(original_ms, floor) so the wait has room to actually catch content;
for onTimeout waits a longer max only matters when nothing ever matches, and it
still proceeds. Idempotent: skips files with no remaining `delay` steps.
"""
import json, glob, os, sys

ROOT = os.path.expanduser('~/Projects/yeshie/sites')
EXCLUDE_SITES = {'github.com'}  # chatgpt.com graduated 2026-07-08 (verified)
GENERIC_SETTLE = "main, [role='main'], .v-main, .v-data-table, .application-main, #app, #root, [data-testid='app-root']"

def next_target(nxt):
    if not isinstance(nxt, dict):
        return None
    # NOTE: 'wait_for' deliberately excluded. A delay sitting before a wait_for
    # is a SETTLE ("let the thing appear before we wait for it") — converting it
    # to wait_for(that same target, visible) creates a fragile transient wait
    # that hard-fails when the target flashes by (e.g. a stop-streaming button on
    # a fast LLM response). Those fall through to the settle+onTimeout branch.
    if nxt.get('action') not in ('click', 'type', 'select', 'select_entity'):
        return None
    if nxt.get('target'):
        return ('target', nxt['target'])
    if nxt.get('selector'):
        return ('selector', nxt['selector'])
    return None

def convert_chain(steps):
    changed = 0; llm = 0
    for i, s in enumerate(steps):
        if not isinstance(s, dict) or s.get('action') != 'delay':
            continue
        ms = s.get('ms', 0) or 0
        nxt = steps[i + 1] if i + 1 < len(steps) else None
        new = {'stepId': s.get('stepId', f's{i}'), 'action': 'wait_for'}
        tgt = next_target(nxt)
        if tgt:
            key, val = tgt
            new[key] = val
            new['state'] = {'visible': True}
            new['timeout'] = max(ms, 8000)
            new['note'] = f"wait for {val} before next step (was delay {ms}ms)"
        else:
            new['selector'] = GENERIC_SETTLE
            new['timeout'] = ms if ms >= 15000 else max(ms, 6000)
            new['onTimeout'] = 'continue'
            new['note'] = (f"settle (was delay {ms}ms); resolves on content root, "
                           f"proceeds on timeout" + (" — HAND-TUNE: LLM-generation, use a completion signal" if ms >= 15000 else ""))
            if ms >= 15000:
                llm += 1
        steps[i] = new
        changed += 1
    return changed, llm

def main():
    files = sorted(glob.glob(f'{ROOT}/**/*.payload.json', recursive=True))
    tot_files = tot_steps = tot_llm = 0
    touched = []
    for f in files:
        site = f.split('/sites/')[1].split('/')[0]
        if site in EXCLUDE_SITES:
            continue
        try:
            doc = json.load(open(f))
        except Exception as e:
            print(f"  !! parse error {f}: {e}"); continue
        base = doc.get('payload') if isinstance(doc.get('payload'), dict) else doc
        total = llm = 0
        if isinstance(base.get('chain'), list):
            c, l = convert_chain(base['chain']); total += c; llm += l
        for b in (base.get('branches') or {}).values():
            bs = b.get('steps') if isinstance(b, dict) else b
            if isinstance(bs, list):
                c, l = convert_chain(bs); total += c; llm += l
        if total:
            json.dump(doc, open(f, 'w'), indent=2)
            open(f, 'a').write('\n')
            touched.append((f, total, llm))
            tot_files += 1; tot_steps += total; tot_llm += llm
    print(f"Converted {tot_steps} delay->wait_for across {tot_files} files "
          f"({tot_llm} LLM-generation waits flagged for hand-tuning).")
    for f, t, l in touched:
        print(f"  {f.split('/sites/')[1]}: {t}" + (f"  ({l} LLM)" if l else ""))

if __name__ == '__main__':
    main()
