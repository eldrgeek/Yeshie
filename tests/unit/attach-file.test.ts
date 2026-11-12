/**
 * attach_file: the CDP sequence src/attach-file.ts sends, its failure messages,
 * the live handler in background.ts, and the YouTube recipe built on it.
 */
import { readFileSync } from 'fs';
import { attachFiles, findInputExpression, normalizeFiles } from '../../src/attach-file';
import { PayloadSchema } from '../../src/schema';

const noSleep = async () => {};

function fakeCdp(evalResults: any[], opts: { refuse?: string } = {}) {
  const calls: Array<[string, any]> = [];
  let i = 0;
  const send = async (method: string, params?: any) => {
    calls.push([method, params]);
    if (method === 'Runtime.evaluate') {
      if (params.returnByValue) return { result: { type: 'object', value: { notFileInput: 'div' } } };
      return evalResults[Math.min(i++, evalResults.length - 1)];
    }
    if (method === 'DOM.setFileInputFiles' && opts.refuse) throw new Error(opts.refuse);
    return {};
  };
  return { send, calls };
}

const NODE = { result: { type: 'object', subtype: 'node', objectId: 'obj-1' } };
const NULL = { result: { type: 'object', subtype: 'null' } };

describe('normalizeFiles', () => {
  it('takes one path, a list, or a JSON list string', () => {
    expect(normalizeFiles('/a.mp4')).toEqual(['/a.mp4']);
    expect(normalizeFiles(['/a.mp4', '/b.mp4'])).toEqual(['/a.mp4', '/b.mp4']);
    expect(normalizeFiles('["/a.mp4","/b.mp4"]')).toEqual(['/a.mp4', '/b.mp4']);
  });
  it('refuses an empty or relative path', () => {
    expect(() => normalizeFiles('')).toThrow(/needs `file`/);
    expect(() => normalizeFiles('out/a.mp4')).toThrow(/absolute paths/);
  });
});

describe('attachFiles', () => {
  it('finds the input, sets the files by path, and releases the handle', async () => {
    const { send, calls } = fakeCdp([NODE]);
    const r = await attachFiles(send, 'input[type=file]', '/Users/me/film.mp4', { sleep: noSleep });
    expect(r.files).toEqual(['/Users/me/film.mp4']);
    expect(calls.map((c) => c[0])).toEqual(['Runtime.evaluate', 'DOM.setFileInputFiles', 'Runtime.releaseObject']);
    expect(calls[1][1]).toEqual({ files: ['/Users/me/film.mp4'], objectId: 'obj-1' });
  });

  it('polls until the input appears', async () => {
    const { send } = fakeCdp([NULL, NULL, NODE]);
    const r = await attachFiles(send, 'input[type=file]', '/a.mp4', { sleep: noSleep, pollMs: 10, timeoutMs: 1000 });
    expect(r.polls).toBe(3);
  });

  it('gives up with the selector in the message', async () => {
    const { send } = fakeCdp([NULL]);
    await expect(attachFiles(send, '#nope', '/a.mp4', { sleep: noSleep, pollMs: 100, timeoutMs: 300 }))
      .rejects.toThrow(/no <input type="file"> matched #nope within 300 ms/);
  });

  it('refuses a selector that hits something other than a file input', async () => {
    const { send } = fakeCdp([{ result: { type: 'object', objectId: 'obj-2' } }]);
    await expect(attachFiles(send, 'div.picker', '/a.mp4', { sleep: noSleep })).rejects.toThrow(/matched a <div>/);
  });

  it('names the Chrome setting when Chrome refuses the file', async () => {
    const { send, calls } = fakeCdp([NODE], { refuse: 'Not allowed' });
    await expect(attachFiles(send, 'input', '/a.mp4', { sleep: noSleep })).rejects.toThrow(/Allow access to file URLs/);
    expect(calls.at(-1)?.[0]).toBe('Runtime.releaseObject');
  });
});

describe('findInputExpression', () => {
  it('is a single expression that quotes the selector safely', () => {
    const expr = findInputExpression('input[name="Filedata"]');
    expect(expr).toContain(JSON.stringify('input[name="Filedata"]'));
    expect(() => new Function(`return ${expr}`)).not.toThrow();
  });
});

describe('the live handler in background.ts', () => {
  const bg = readFileSync(new URL('../../packages/extension/src/entrypoints/background.ts', import.meta.url), 'utf8');
  const start = bg.indexOf("      if (a === 'attach_file') {");
  const handler = bg.slice(start, bg.indexOf('\n      }\n', start));
  it('exists and goes through the debugger, not inline bytes', () => {
    expect(start).toBeGreaterThan(0);
    expect(handler).toContain('ensureDebugger(tabId)');
    expect(handler).toContain('attachFiles(');
    expect(handler).toContain('chrome.debugger.sendCommand({ tabId }');
  });
  it('the extension still asks for the debugger permission', () => {
    const cfg = readFileSync(new URL('../../packages/extension/wxt.config.ts', import.meta.url), 'utf8');
    expect(cfg).toMatch(/permissions:\s*\[[^\]]*'debugger'/);
  });
});

describe('sites/studio.youtube.com/tasks/upload-video.payload.json', () => {
  const payload = JSON.parse(readFileSync(new URL('../../sites/studio.youtube.com/tasks/upload-video.payload.json', import.meta.url), 'utf8'));
  const steps = payload.chain as any[];
  const byId = Object.fromEntries(steps.map((s) => [s.stepId, s]));

  it('passes the payload schema', () => {
    expect(PayloadSchema.safeParse(payload).success).toBe(true);
  });
  it('declares the five parameters the brief asked for', () => {
    expect(payload._meta.requiredParams).toEqual(['file', 'title', 'description', 'visibility', 'playlist']);
    for (const p of ['file', 'title', 'description', 'visibility', 'playlist']) expect(JSON.stringify(steps)).toContain(`{{${p}}}`);
  });
  it('attaches the file by path before typing anything', () => {
    const order = steps.map((s) => s.stepId);
    expect(byId.s3.action).toBe('attach_file');
    expect(byId.s3.file).toBe('{{file}}');
    expect(order.indexOf('s3')).toBeLessThan(order.indexOf('s5'));
  });
  it('ends on a proof that reads back the published link', () => {
    const last = steps.at(-1);
    expect(last.action).toBe('extract_text');
    expect(last.store_as).toBe('published_url');
    expect(byId.s19.action).toBe('wait_for');
    expect(byId.s19.selector).toContain('https://youtu.be/');
    expect(payload._meta.doneWhen).toMatch(/published_url/);
  });
  it('never navigates after the file is attached (a page load kills the upload)', () => {
    const after = steps.slice(steps.findIndex((s) => s.stepId === 's3') + 1);
    expect(after.some((s) => s.action === 'navigate' || s.action === 'open_tab')).toBe(false);
  });
});
