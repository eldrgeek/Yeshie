import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TASKS_DIR = resolve(__dirname, '../../sites/app.yeshid.com/tasks');
const files = readdirSync(TASKS_DIR).filter((f: string) => f.endsWith('.payload.json')).sort();

describe('app.yeshid.com workflows — schema + success confirmation', () => {
  for (const file of files) {
    const wf = JSON.parse(readFileSync(join(TASKS_DIR, file), 'utf-8'));

    describe(file, () => {
      it('has valid _meta with auth flag', () => {
        expect(wf._meta?.id).toBeTruthy();
        expect(wf._meta?.title).toBeTruthy();
        expect(wf._meta?.baseUrl).toBe('https://app.yeshid.com');
        expect(wf._meta?.requiresAuth).toBe(true);
      });

      it('chain has at least 3 steps', () => {
        expect(Array.isArray(wf.chain)).toBe(true);
        expect(wf.chain.length).toBeGreaterThan(2);
      });

      it('first step navigates to an app path', () => {
        const first = wf.chain[0];
        expect(first.action).toBe('navigate');
        expect(first.url).toMatch(/^\//);
      });

      it('ends with independent verify-success perceive step', () => {
        const last = wf.chain[wf.chain.length - 1];
        expect(last.stepId).toBe('verify-success');
        expect(last.action).toBe('perceive');
        expect(last.store_as).toBeTruthy();
        expect(last.description).toMatch(/independent|confirm|verify/i);
      });

      it('all perceive steps have store_as', () => {
        const perceives = wf.chain.filter((s: any) => s.action === 'perceive');
        expect(perceives.length).toBeGreaterThan(0);
        perceives.forEach((s: any) => expect(s.store_as).toBeTruthy());
      });

      it('every step has a stepId', () => {
        wf.chain.forEach((s: any) => expect(s.stepId?.length).toBeGreaterThan(0));
      });

      it('has at least one documented param', () => {
        expect(Object.keys(wf._meta?.params ?? {}).length).toBeGreaterThan(0);
      });
    });
  }
});
