/**
 * Runtime feature guards: src/runtime-features.ts and `assert` + `requires`.
 *
 * A recipe step that needs a feature older builds lack must come after an
 * assert that requires the feature. The case behind the rule: a build without
 * `within_row` ignores the field, so the GoDaddy delete recipe's click would
 * hit the first Delete button in the table
 * (sites/dcc.godaddy.com/tasks/02-delete-dns-record.payload.json).
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { RUNTIME_FEATURES } from '../../src/runtime-features.js';
import { rowScope } from '../../src/row-scope.js';

// Tests run from the repo root (npm test); no __dirname under experimental-vm-modules.
const ROOT = process.cwd();
const BACKGROUND = readFileSync(join(ROOT, 'packages/extension/src/entrypoints/background.ts'), 'utf8');

type Step = Record<string, any>;

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

/** A recipe's main chain and its branch chains. A file that is not JSON is another test's problem. */
function chainsOf(file: string): Step[][] {
  let doc: any;
  try { doc = JSON.parse(readFileSync(file, 'utf-8')); } catch { return []; }
  const base = (doc.payload ?? doc) ?? {};
  const chains: Step[][] = [];
  if (Array.isArray(base.chain)) chains.push(base.chain);
  for (const b of Object.values(base.branches ?? {})) {
    const steps = (b as any)?.steps ?? b;
    if (Array.isArray(steps)) chains.push(steps);
  }
  return chains;
}

const RECIPES = findTaskPayloads(join(ROOT, 'sites')).map((f) => ({ file: relative(ROOT, f), chains: chainsOf(f) }));

function recipe(suffix: string): Step[] {
  const found = RECIPES.find((r) => r.file.endsWith(suffix));
  if (!found) throw new Error(`recipe not found: ${suffix}`);
  return found.chains[0];
}

/** The features an assert step requires (none for any other step). */
function requiredBy(step: Step): string[] {
  if (step.action !== 'assert' || step.requires === undefined) return [];
  return Array.isArray(step.requires) ? step.requires : [step.requires];
}

/** The feature a within_row click needs: the object form is the cells form. */
function withinRowFeature(step: Step): string | null {
  if (step.within_row === undefined) return null;
  const w = step.within_row;
  return w !== null && typeof w === 'object' && !Array.isArray(w) ? 'within_row.cells' : 'within_row';
}

describe('runtime feature guards in recipes', () => {
  it('reads the recipe fleet', () => {
    expect(RECIPES.length).toBeGreaterThan(100);
  });

  it('every requires names a listed feature and is the only check in its assert', () => {
    const problems: string[] = [];
    for (const { file, chains } of RECIPES) {
      for (const chain of chains) {
        for (const step of chain) {
          const wanted = requiredBy(step);
          if (wanted.length === 0) continue;
          for (const f of wanted) {
            if (!RUNTIME_FEATURES.includes(f)) problems.push(`${file} ${step.stepId}: "${f}" is not in RUNTIME_FEATURES`);
          }
          for (const k of ['condition', 'url_pattern', 'selector']) {
            if (k in step) problems.push(`${file} ${step.stepId}: requires shares its assert with ${k}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every within_row click comes after an assert that requires its form', () => {
    const problems: string[] = [];
    for (const { file, chains } of RECIPES) {
      for (const chain of chains) {
        const guarded = new Set<string>();
        for (const step of chain) {
          requiredBy(step).forEach((f) => guarded.add(f));
          const need = withinRowFeature(step);
          if (need && !guarded.has(need)) problems.push(`${file} ${step.stepId}: within_row needs an earlier assert with requires ["${need}"]`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('the GoDaddy delete recipe picks the row by exact cells, behind a guard that runs before the page is touched', () => {
    const chain = recipe('dcc.godaddy.com/tasks/02-delete-dns-record.payload.json');
    const click = chain.find((s) => s.within_row !== undefined)!;
    const fill = (s: string) => s.replace('{{name}}', 'sala').replace('{{value}}', '217.77.6.197');
    expect(rowScope(click.within_row, fill)).toEqual({ mode: 'cells', needles: ['sala', '217.77.6.197'] });
    const guardAt = chain.findIndex((s) => requiredBy(s).includes('within_row.cells'));
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(chain.findIndex((s) => s.action !== 'assert'));
  });

  it('the GoDaddy add recipe requires select before the page is touched', () => {
    const chain = recipe('dcc.godaddy.com/tasks/01-add-dns-record.payload.json');
    const guardAt = chain.findIndex((s) => requiredBy(s).includes('select'));
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(chain.findIndex((s) => s.action !== 'assert'));
    expect(guardAt).toBeLessThan(chain.findIndex((s) => s.action === 'select'));
  });
});

describe('RUNTIME_FEATURES matches the live runtime', () => {
  // One probe per listed feature: code in background.ts that implements it.
  // A new feature needs a probe here, so the list cannot claim code that is not there.
  const PROBES: Record<string, RegExp> = {
    select: /if \(a === 'select'\)/,
    within_row: /rowScope\(step\.within_row/,
    'within_row.cells': /rowScope\(step\.within_row/,
  };

  it('lists only features with code behind them', () => {
    for (const f of RUNTIME_FEATURES) {
      expect({ feature: f, probe: PROBES[f] !== undefined }).toEqual({ feature: f, probe: true });
      expect(BACKGROUND).toMatch(PROBES[f]);
    }
    expect(rowScope({ cells: ['x'] }).mode).toBe('cells');
  });

  it('the live assert hands RUNTIME_FEATURES to evaluateAssert', () => {
    expect(BACKGROUND).toContain('evaluateAssert(step, snapshot || {}, I, { features: RUNTIME_FEATURES })');
  });
});
