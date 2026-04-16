import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// Use process.cwd() — Jest always runs from the project root
const ROOT = process.cwd();

const PAYLOAD_DIRS = [
  { dir: resolve(ROOT, 'sites/yeshid/tasks'), prefix: 'yeshid' },
  { dir: resolve(ROOT, 'sites/admin.google.com/tasks'), prefix: 'admin.google.com' },
];

const KNOWN_ACTIONS = new Set([
  'navigate', 'type', 'click', 'click_text', 'click_preset',
  'wait_for', 'assess_state', 'find_row', 'read', 'perceive',
  'delay', 'assert', 'respond', 'select_entity', 'for_each_row',
  'guard_tier', 'js',
]);

// Only yeshid hardened payloads mandate verification steps
const YESHID_HARDENED_PREFIXES = ['01-', '02-', '03-', '14-', '15-'];

interface Step {
  stepId?: string;
  action?: string;
  url?: string;
  selector?: string;
  text?: string;
  target?: string;
  [key: string]: unknown;
}

interface Payload {
  _meta?: { description?: string; [key: string]: unknown };
  chain?: Step[];
  [key: string]: unknown;
}

interface PayloadFile {
  name: string;
  label: string;
  path: string;
  prefix: string;
}

function loadPayloadFiles(): PayloadFile[] {
  const files: PayloadFile[] = [];
  for (const { dir, prefix } of PAYLOAD_DIRS) {
    const entries = readdirSync(dir).filter((f: string) => f.endsWith('.json')).sort();
    for (const entry of entries) {
      files.push({ name: entry, label: `${prefix}/${entry}`, path: resolve(dir, entry), prefix });
    }
  }
  return files;
}

describe('payload-coverage', () => {
  const payloadFiles = loadPayloadFiles();

  for (const file of payloadFiles) {
    let payload: Payload | null = null;
    let parseError: Error | null = null;

    try {
      const raw = readFileSync(file.path, 'utf-8');
      payload = JSON.parse(raw) as Payload;
    } catch (e) {
      parseError = e as Error;
    }

    describe(file.label, () => {
      it('parses as valid JSON', () => {
        expect(parseError).toBeNull();
        expect(payload).not.toBeNull();
      });

      if (payload === null) return;

      it('has _meta block with description', () => {
        expect(payload!._meta).toBeDefined();
        expect(typeof payload!._meta?.description).toBe('string');
        expect((payload!._meta!.description as string).length).toBeGreaterThan(0);
      });

      it('has chain array with at least 1 step', () => {
        expect(Array.isArray(payload!.chain)).toBe(true);
        expect((payload!.chain as Step[]).length).toBeGreaterThanOrEqual(1);
      });

      if (!Array.isArray(payload.chain) || payload.chain.length === 0) return;

      const steps = payload.chain as Step[];

      it('every step has an action field', () => {
        for (const step of steps) {
          expect(typeof step.action).toBe('string');
        }
      });

      it('every step uses a known action type', () => {
        for (const step of steps) {
          if (step.action) {
            expect(KNOWN_ACTIONS.has(step.action)).toBe(true);
          }
        }
      });

      // Navigate steps must have url
      const navigateSteps = steps.filter((s: Step) => s.action === 'navigate');
      if (navigateSteps.length > 0) {
        it('navigate steps have url field', () => {
          for (const step of navigateSteps) {
            expect(typeof step.url).toBe('string');
          }
        });
      }

      // Click/type steps must reference something
      const interactiveSteps = steps.filter((s: Step) =>
        ['click', 'type', 'click_text', 'click_preset'].includes(s.action ?? '')
      );
      if (interactiveSteps.length > 0) {
        it('click/type steps have selector, text, or target', () => {
          for (const step of interactiveSteps) {
            const hasRef = !!(step.selector || step.text || step.target);
            expect(hasRef).toBe(true);
          }
        });
      }

      // Yeshid hardened payloads must have ≥1 verification step
      const isHardenedYeshid = file.prefix === 'yeshid' &&
        YESHID_HARDENED_PREFIXES.some((p: string) => file.name.startsWith(p));
      if (isHardenedYeshid) {
        it('has at least one verification step (wait_for, assert, or find_row)', () => {
          const verifySteps = steps.filter((s: Step) =>
            s.action === 'wait_for' || s.action === 'assert' || s.action === 'find_row'
          );
          expect(verifySteps.length).toBeGreaterThanOrEqual(1);
        });
      }

      // Query payloads must have ≥1 data extraction step
      const isQuery = file.prefix === 'yeshid' && file.name.startsWith('q');
      if (isQuery) {
        it('has at least one data extraction step (perceive, respond, or read)', () => {
          const extractSteps = steps.filter((s: Step) =>
            ['perceive', 'respond', 'read'].includes(s.action ?? '')
          );
          expect(extractSteps.length).toBeGreaterThanOrEqual(1);
        });
      }
    });
  }
});
