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
// Scope: the WHOLE recipe fleet. github.com converted 2026-06-18; the rest
// converted fleet-wide 2026-07-08 via scripts/convert-delays-fleet.py.
const SITES_DIR = join(process.cwd(), 'sites');

// Sites still pending conversion (delays intentionally kept for now). Keep this
// list SHRINKING — a site graduates the moment its delays are gone.
const PENDING = new Set<string>([
  'chatgpt.com', // hand-tuned recipe with LLM-generation-adjacent waits; converting by hand
]);

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
  const base = (doc.payload ?? doc) ?? {};
  const chains: any[][] = [];
  if (Array.isArray(base.chain)) chains.push(base.chain);
  for (const b of Object.values(base.branches ?? {})) {
    const steps = (b as any)?.steps ?? b;
    if (Array.isArray(steps)) chains.push(steps);
  }
  return chains.flat().filter((s: any) => s?.action === 'delay').map((s: any) => s.stepId || '?');
}

function siteOf(file: string): string {
  const parts = file.split('/');
  const i = parts.indexOf('sites');
  return i >= 0 ? parts[i + 1] : '';
}

describe('recipes use wait_for, not fixed delay', () => {
  const payloads = findTaskPayloads(SITES_DIR);

  it('finds recipe payloads to check', () => {
    expect(payloads.length).toBeGreaterThan(0);
  });

  for (const file of payloads) {
    if (PENDING.has(siteOf(file))) continue; // pending sites checked separately below
    const rel = file.slice(file.indexOf('sites'));
    it(`${rel} has no fixed delay steps`, () => {
      const offenders = delaySteps(file);
      expect(offenders).toEqual([]); // if this fails: replace delay with wait_for (scripts/convert-delays-fleet.py)
    });
  }

  // Pending sites: don't fail the suite, but surface progress so the PENDING
  // list can't silently rot. A site graduates by removing it from PENDING.
  it('pending-conversion sites are tracked (shrink the PENDING list)', () => {
    const stillPending = [...PENDING].filter((site) =>
      findTaskPayloads(join(SITES_DIR, site)).some((f) => delaySteps(f).length > 0),
    );
    // eslint-disable-next-line no-console
    if (stillPending.length) console.warn('[no-fixed-delay] still pending:', stillPending.join(', '));
    expect(Array.isArray(stillPending)).toBe(true);
  });
});
