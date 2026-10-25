/**
 * @jest-environment node
 *
 * WXT lists a file in manifest.json's content_scripts only when it is named
 * content.ts or <name>.content.ts. Any other entrypoint that calls
 * defineContentScript builds as an unlisted .js and never runs unless the
 * background injects it. The Do-It-Once recorder sat as content-observer.ts
 * from its first commit until 2026-10-25, so Ctrl+Alt+R recorded nothing.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ENTRYPOINTS = join(process.cwd(), 'packages/extension/src/entrypoints');
const background = readFileSync(join(ENTRYPOINTS, 'background.ts'), 'utf8');

test('every content script is either listed by WXT or injected by the background', () => {
  const unregistered = readdirSync(ENTRYPOINTS)
    .filter(f => /\.ts$/.test(f))
    .filter(f => readFileSync(join(ENTRYPOINTS, f), 'utf8').includes('defineContentScript('))
    .filter(f => !/^(content|[\w-]+\.content)\.ts$/.test(f))
    .filter(f => !background.includes(`'${f.replace(/\.ts$/, '.js')}'`));
  expect(unregistered).toEqual([]);
});

test('the Do-It-Once recorder is a listed content script', () => {
  expect(readdirSync(ENTRYPOINTS)).toContain('observer.content.ts');
});
