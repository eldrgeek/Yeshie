/**
 * @jest-environment node
 *
 * A guide survives a full page load only if the background re-injects the
 * teach overlay. It decides from trySend(): a send that resolves counts as
 * delivered. Since the Do-It-Once observer became a listed content script
 * (2026-10-25) every page has a listener that resolves teach messages with
 * undefined, so only the overlay's {ok:true} may count. Both trySend copies
 * in background.ts run here against stubbed chrome.tabs.sendMessage.
 */
import ts from 'typescript';
import { BACKGROUND } from './background-harness.js';

function trySends(): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = BACKGROUND.indexOf('const trySend = async (): Promise<boolean> => {', from);
    if (start < 0) return out;
    const end = BACKGROUND.indexOf('\n    };', start);
    out.push(BACKGROUND.slice(start, end + 7));
    from = end;
  }
}

function build(src: string, reply: () => Promise<any>) {
  const js = ts.transpileModule(`${src}\nreturn trySend;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const chrome = { tabs: { sendMessage: reply } };
  return new Function('chrome', 'tabId', 'targetTabId', 'teachMsg', js)(chrome, 1, 1, { type: 'teach_start' });
}

const copies = trySends();

test('background.ts has both trySend copies (navigation restore and handleTeachMessage)', () => {
  expect(copies).toHaveLength(2);
});

test.each(copies.map((src, i) => [i, src]))('trySend #%i counts only the overlay\'s {ok:true}', async (_i, src) => {
  expect(await build(src as string, async () => undefined)()).toBe(false);
  expect(await build(src as string, async () => { throw new Error('Receiving end does not exist'); })()).toBe(false);
  expect(await build(src as string, async () => ({ ok: true }))()).toBe(true);
});
