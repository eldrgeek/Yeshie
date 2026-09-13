import { readFileSync } from 'fs';
import ts from 'typescript';

const background = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');
function harness(action: string, stalled = '', cancelAt = '') {
  const branch = background.split(`      if (a === '${action}') {`)[1];
  const callback = branch.match(/attach: async \(\) => \{([\s\S]*?)\n\s*\},/)![1];
  const helper = background.includes('  async function ensureInputDebugger(')
    ? background.split('  // Bounded input attachment recovery')[1].split('  async function releaseDebugger')[0] : '';
  const calls: string[] = [];
  let cancelled = false, attached = true, resolve!: () => void;
  const operation = async (name: string) => {
    calls.push(name);
    if (name === cancelAt) cancelled = true;
    if (name === stalled) await new Promise<void>(r => { resolve = r; });
  };
  let attempts = 0;
  const chrome = { debugger: {
    attach: async () => { await operation(`attach${++attempts}`); if (attached) throw new Error('Another debugger is already attached to the tab'); attached = true; },
    detach: async () => { await operation('detach'); attached = false; },
  }};
  const source = `let _debuggerTabId=null; const tabId=42, run={runId:'test'}, abortFlags={get:()=>cancelled()};
    ${helper}
    return {attach:async()=>{${callback}}, tracked:()=>_debuggerTabId};`;
  const result = new Function('chrome', 'cancelled', ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(chrome, () => cancelled);
  return {...result, calls, resolve: () => resolve()};
}

for (const action of ['key', 'drag_select', 'anchor_comment']) {
  it(`${action} recovers an attachment surviving a worker restart`, async () => {
    const h = harness(action);
    expect(h.tracked()).toBeNull();
    await h.attach();
    expect(h.calls).toEqual(['attach1', 'detach', 'attach2']);
    expect(h.tracked()).toBe(42);
    await h.attach();
    expect(h.calls).toHaveLength(3);
  });
  it.each(['attach1', 'detach', 'attach2'])(`${action} checks cancellation after %s`, async stage => {
    const h = harness(action, '', stage);
    await expect(h.attach()).rejects.toThrow(/cancel/i);
    expect(h.calls).toEqual(['attach1', 'detach', 'attach2'].slice(0, ['attach1', 'detach', 'attach2'].indexOf(stage) + 1));
    expect(h.tracked()).toBeNull();
  });
  it.each(['attach1', 'detach', 'attach2'])(`${action} bounds %s without late continuation`, async stage => {
    const h = harness(action, stage);
    await expect(h.attach()).rejects.toThrow(/timed out/i);
    const calls = [...h.calls];
    h.resolve();
    await new Promise(r => setTimeout(r, 20));
    expect(h.calls).toEqual(calls);
    expect(h.tracked()).toBeNull();
  });
}
