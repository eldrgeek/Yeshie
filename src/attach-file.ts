/**
 * First-class `attach_file` — put a local file into an <input type="file">
 * by its path, through CDP `DOM.setFileInputFiles`.
 *
 * Why: the older recipes (app.yeshid.com CSV import) build a File from inline
 * text with DataTransfer in the page. That carries the bytes through the relay
 * and the page, which does not work for a 15 MB video. CDP hands Chrome the path
 * and Chrome reads the file itself, so size does not matter. Chrome fires the
 * input's `input` and `change` events, so an upload page reacts as if a person
 * had picked the file.
 *
 * Needs: the extension's `debugger` permission (manifest), and "Allow access to
 * file URLs" switched on for the extension in chrome://extensions. Without file
 * access Chrome refuses the command with "Not allowed".
 *
 * Shared with tests: the live runtime (packages/extension/src/entrypoints/
 * background.ts) passes `send` = chrome.debugger.sendCommand bound to the tab.
 *
 * Written 2026-11-12 by Claude Opus 5.5 for Mike Wolf (EM thread "Link every
 * artifact to its conversation"), for the YouTube upload recipe.
 */

export type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<any>;

export type AttachOptions = { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> };

export type AttachResult = { files: string[]; selector: string; polls: number };

/** One path, a list of paths, or a JSON list string ("[\"/a.mp4\",\"/b.mp4\"]") → absolute paths. */
export function normalizeFiles(raw: unknown): string[] {
  let list: unknown[];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { list = JSON.parse(raw); } catch { list = [raw]; }
  } else list = [raw];
  const files = list.map((f) => String(f ?? '').trim()).filter(Boolean);
  if (!files.length) throw new Error('attach_file needs `file` (a path) or `files` (a list of paths)');
  const relative = files.filter((f) => !f.startsWith('/'));
  if (relative.length) throw new Error(`attach_file needs absolute paths; got ${relative.join(', ')}`);
  return files;
}

/**
 * A page expression that returns the first element matching `selector`,
 * searching the document and every open shadow root. Only an <input type=file>
 * counts, so a selector that hits a wrapper fails loudly instead of silently.
 */
export function findInputExpression(selector: string): string {
  return `(() => {
    const sel = ${JSON.stringify(selector)};
    const seen = new Set();
    const walk = (root) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot && !seen.has(el.shadowRoot)) {
          seen.add(el.shadowRoot);
          const deep = walk(el.shadowRoot);
          if (deep) return deep;
        }
      }
      return null;
    };
    const el = walk(document);
    if (!el) return null;
    if (!(el instanceof HTMLInputElement) || el.type !== 'file') return { notFileInput: el.tagName.toLowerCase() };
    return el;
  })()`;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for the input, then set its files. Throws with the reason on any failure. */
export async function attachFiles(send: CdpSend, selector: string, rawFiles: unknown, opts: AttachOptions = {}): Promise<AttachResult> {
  const files = normalizeFiles(rawFiles);
  const timeoutMs = opts.timeoutMs ?? 10000;
  const pollMs = opts.pollMs ?? 250;
  const sleep = opts.sleep ?? defaultSleep;
  const expression = findInputExpression(selector);
  let polls = 0;
  let waited = 0;
  for (;;) {
    polls++;
    const res = await send('Runtime.evaluate', { expression, returnByValue: false });
    const obj = res?.result;
    if (res?.exceptionDetails) throw new Error(`attach_file: page error finding ${selector}: ${res.exceptionDetails.text || 'exception'}`);
    if (obj?.type === 'object' && obj.subtype === 'node' && obj.objectId) {
      try {
        await send('DOM.setFileInputFiles', { files, objectId: obj.objectId });
      } catch (e: any) {
        const msg = String(e?.message || e);
        const hint = /not allowed/i.test(msg) ? ' (switch on "Allow access to file URLs" for Yeshie in chrome://extensions)' : '';
        throw new Error(`attach_file: Chrome refused the file: ${msg}${hint}`);
      } finally {
        try { await send('Runtime.releaseObject', { objectId: obj.objectId }); } catch { /* the page may have navigated */ }
      }
      return { files, selector, polls };
    }
    if (obj?.type === 'object' && obj.subtype !== 'null' && obj.objectId) {
      // { notFileInput } came back as an object: read it by value for the message.
      const byValue = await send('Runtime.evaluate', { expression, returnByValue: true });
      const tag = byValue?.result?.value?.notFileInput || 'element';
      try { await send('Runtime.releaseObject', { objectId: obj.objectId }); } catch { /* ignore */ }
      throw new Error(`attach_file: ${selector} matched a <${tag}>, not an <input type="file">`);
    }
    if (waited >= timeoutMs) throw new Error(`attach_file: no <input type="file"> matched ${selector} within ${timeoutMs} ms`);
    await sleep(pollMs);
    waited += pollMs;
  }
}
