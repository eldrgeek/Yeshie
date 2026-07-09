/**
 * Guard: recipes must not use fixed `delay` steps.
 *
 * A fixed delay is fragile (too short → acts before content exists; too long →
 * slow) and is the wrong tool for "wait until ready". The canon is `wait_for`
 * (guard the next action on the element it needs; for whole-page reads,
 * `wait_for` `.application-main`). See sites/github.com/README.md.
 *
 * This test fails if any payload reintroduces a `delay` step, with a pointer to
 * the fix. To convert existing recipes: scripts/convert-delays-to-waitfor.py
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Tests run from the repo root (npm test). Resolve from cwd to stay ESM-safe
// (no __dirname under jest's experimental-vm-modules).
// Scope: the GitHub recipe set, which was converted to wait_for on 2026-06-18.
// Widen this to all of sites/ once other sites' recipes are converted too.
const SITES_DIR = join(process.cwd(), 'sites', 'github.com');

function findTaskPayloads(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTaskPayloads(p));
    else if (entry.name.endsWith('.payload.json')) out.push(p);
  }
  return out;
}

function delaySteps(file: string): string[] {
  let doc: any;
  try { doc = JSON.parse(readFileSync(file, 'utf-8')); } catch { return []; }
  const chain = (doc.payload ?? doc)?.chain ?? [];
  return chain.filter((s: any) => s?.action === 'delay').map((s: any) => s.stepId || '?');
}

describe('recipes use wait_for, not fixed delay', () => {
  const payloads = findTaskPayloads(SITES_DIR);

  it('finds recipe payloads to check', () => {
    expect(payloads.length).toBeGreaterThan(0);
  });

  for (const file of payloads) {
    const rel = file.slice(file.indexOf('sites'));
    it(`${rel} has no fixed delay steps`, () => {
      const offenders = delaySteps(file);
      expect(offenders).toEqual([]); // if this fails: replace delay with wait_for (see sites/github.com/README.md)
    });
  }
});
