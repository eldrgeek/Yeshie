/**
 * Action coverage for the LIVE runtime, packages/extension/src/entrypoints/
 * background.ts. Until 2026-09-15 this file checked the StepExecutor mirror
 * (src/step-executor.ts) instead, so CI could not see a gap in the runtime:
 * background.ts had no `select` handler until #66, and select steps were
 * skipped silently.
 *
 * The recipe check reads every sites/<site>/tasks/*.payload.json and fails
 * when a step uses an action that background.ts has no handler for. At run
 * time such a step halts the chain with status 'unsupported'
 * (unsupported-chain.test.ts), so each recipe on KNOWN_GAPS fails at that step.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// Import StepExecutor for delay tests
import { StepExecutor } from '../../src/step-executor';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const BACKGROUND = readFileSync(resolve(ROOT, 'packages/extension/src/entrypoints/background.ts'), 'utf-8');

/** executeStep, from its header to its closing two-space-indented brace. */
function executeStepSource(src: string): string {
  const start = src.indexOf('  async function executeStep(');
  if (start < 0) throw new Error('executeStep not found in background.ts');
  return src.slice(start, src.indexOf('\n  }\n', start) + 4);
}

/** The actions executeStep dispatches on: its `      if (a === '<action>') {` lines. */
function handledActions(src: string): Set<string> {
  return new Set([...executeStepSource(src).matchAll(/^ {6}if \(a === '([a-z_]+)'\) \{$/gm)].map((m) => m[1]));
}

const EXECUTE_STEP = executeStepSource(BACKGROUND);
const HANDLED = handledActions(BACKGROUND);

describe('background.ts action coverage (the live runtime)', () => {
  const requiredActions = [
    'navigate', 'open_tab', 'activate_tab', 'capture_entities', 'navigate_to_entity',
    'type', 'clear', 'click', 'wait_for', 'assert', 'read', 'assess_state', 'js',
    'delay', 'perceive', 'find_row', 'click_text', 'select_entity', 'click_preset',
    'notify', 'anchor_comment', 'drag_select', 'key', 'wait', 'extract_text',
    'select', 'paste_html', 'scroll',
  ];

  for (const action of requiredActions) {
    it(`handles action type '${action}'`, () => {
      expect(HANDLED.has(action)).toBe(true);
    });
  }

  it('dispatches every handler before the unsupported fallthrough', () => {
    const fallthrough = EXECUTE_STEP.indexOf("status: 'unsupported'");
    expect(fallthrough).toBeGreaterThan(0);
    for (const action of HANDLED) {
      expect(EXECUTE_STEP.indexOf(`      if (a === '${action}') {`)).toBeLessThan(fallthrough);
    }
  });
});

type Step = Record<string, unknown>;
type Recipe = { name: string; payload: any };

/** A chain item with no action whose keys all start with "_" is a section comment; the runtime skips it. */
function isComment(s: unknown): boolean {
  return !!s && typeof s === 'object' && (s as Step).action === undefined && Object.keys(s as Step).every((k) => k.startsWith('_'));
}

/** The steps the runtime can execute: the chain, plus the steps of each assess_state branch. */
function runtimeSteps(payload: any): Step[] {
  const steps: Step[] = [...(payload.chain ?? [])];
  for (const branch of Object.values(payload.branches ?? {}) as any[]) {
    steps.push(...((Array.isArray(branch) ? branch : branch?.steps) ?? []));
  }
  return steps;
}

function loadRecipes(): Recipe[] {
  const sites = resolve(ROOT, 'sites');
  const recipes: Recipe[] = [];
  for (const site of readdirSync(sites).sort()) {
    const tasks = resolve(sites, site, 'tasks');
    if (!existsSync(tasks)) continue;
    for (const file of readdirSync(tasks).filter((f) => f.endsWith('.payload.json')).sort()) {
      recipes.push({ name: `${site}/tasks/${file.replace(/\.payload\.json$/, '')}`, payload: JSON.parse(readFileSync(resolve(tasks, file), 'utf-8')) });
    }
  }
  return recipes;
}

/** For each action that has no handler, the recipes whose chain or branch steps use it (sorted). */
function unhandledUses(recipes: Recipe[], handled: Set<string>): Record<string, string[]> {
  const uses: Record<string, string[]> = {};
  for (const { name, payload } of recipes) {
    for (const step of runtimeSteps(payload)) {
      const action = step?.action;
      if (typeof action !== 'string' || handled.has(action)) continue;
      uses[action] = uses[action] ?? [];
      if (!uses[action].includes(name)) uses[action].push(name);
    }
  }
  return Object.fromEntries(Object.entries(uses).map(([action, names]) => [action, [...names].sort()]));
}

/**
 * Actions that recipes use and background.ts has no handler for, and the
 * recipes that use them. Each recipe here halts at its first such step, unless
 * the step is optional. None of these recipes has a recorded live success. The
 * table must match the recipes exactly: when you add the handler or rewrite
 * the steps, delete the entry. A new recipe should not add an entry; give the
 * runtime the action instead.
 *
 * Resolved 2026-09-15: the six health-portal export recipes were retired (they
 * had never run, and this repo is public); gemini export-data now uses
 * `perceive`; `respond` is a runtime action (src/respond-step.ts); q04's
 * `guard_tier` became an assess_state branch.
 */
const KNOWN_GAPS: Record<string, string[]> = {
  // Decision 2026-09-15: q03 and q05 visit every user's detail page, which
  // needs a loop primitive the runtime does not have. Building one is its own
  // task; until then both recipes halt at their first step below.
  for_each_row: ['yeshid/tasks/q03-users-without-recovery-email', 'yeshid/tasks/q05-ungrouped-users'],
  guard_tier: ['yeshid/tasks/q05-ungrouped-users'],
};

describe('every recipe step has a handler in background.ts', () => {
  const recipes = loadRecipes();

  it('reads the recipes', () => {
    expect(recipes.length).toBeGreaterThan(100);
  });

  it('every chain and branch item is a step with an action, or a section comment', () => {
    const bad = recipes.flatMap(({ name, payload }) =>
      runtimeSteps(payload)
        .filter((s) => typeof s?.action !== 'string' && !isComment(s))
        .map((s) => `${name}: ${JSON.stringify(s).slice(0, 100)}`));
    expect(bad).toEqual([]);
  });

  it('uses no unhandled action outside KNOWN_GAPS, and KNOWN_GAPS is exact', () => {
    const known = Object.fromEntries(Object.entries(KNOWN_GAPS).map(([action, names]) => [action, [...names].sort()]));
    expect(unhandledUses(recipes, HANDLED)).toEqual(known);
  });

  it('is sensitive to the #66 defect: without the select handler, the GoDaddy DNS recipes show up as gaps', () => {
    const withoutSelect = BACKGROUND.replace("      if (a === 'select') {", "      if (a === 'select_removed') {");
    expect(withoutSelect).not.toBe(BACKGROUND);
    const uses = unhandledUses(recipes, handledActions(withoutSelect));
    expect(uses.select?.some((name) => name.startsWith('dcc.godaddy.com/'))).toBe(true);
  });
});

describe('delay action (via StepExecutor)', () => {
  // Note: StepExecutor.execute() is synchronous. The delay action in StepExecutor
  // returns ok status without actually waiting (it does not return an ms field).
  it('returns ok status', () => {
    document.body.innerHTML = '<div></div>';
    const ex = new StepExecutor(document, {}, {}, {});
    const r = ex.execute({ stepId: 'd1', action: 'delay', ms: 500 });
    expect(r.status).toBe('ok');
  });

  it('returns ok status when ms not specified', () => {
    document.body.innerHTML = '<div></div>';
    const ex = new StepExecutor(document, {}, {}, {});
    const r = ex.execute({ stepId: 'd1', action: 'delay' });
    expect(r.status).toBe('ok');
  });
});
