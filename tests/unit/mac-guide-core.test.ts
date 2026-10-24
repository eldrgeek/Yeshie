/**
 * @jest-environment node
 *
 * Runs the Python unit tests for scripts/mac_guide_core.py, the macOS-free part
 * of Mac guides, so CI covers them.
 */
import { execFileSync } from 'child_process';
import { resolve } from 'path';

test('mac_guide_core python tests pass', () => {
  const root = resolve(__dirname, '../..');
  const out = execFileSync('python3', ['-m', 'unittest', 'tests/unit/mac_guide_core_test.py'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(out).toBeDefined();
});
