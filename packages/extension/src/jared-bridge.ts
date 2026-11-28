// Jared bridge (2026-11-28). Jared, the show-and-tell prototyper (eldrgeek/soma-jared), copies a real
// page and then drives it: a click on the copy clicks the real page, which settles and is copied again,
// so Jared learns the app's screens. Mike: "as I act on the Jared version, you do the same thing in the
// live version." Yeshie does the page side here because an extension is exempt from the page's CSP and
// keeps working when the page navigates; the bookmarklet route can do neither.
//
// Safety: only Jared's own pages can ask (jared-bridge.content.ts runs nowhere else and the sender's
// origin is checked again here). Jared never sees your tab list: "pick" opens Yeshie's own picker
// window, and only the tab you choose there is granted to that Jared tab, until either tab closes.

export const JARED_ORIGINS = [/^https:\/\/soma-jared\.netlify\.app$/, /^https:\/\/[a-z0-9-]+--soma-jared\.netlify\.app$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
export const isJaredOrigin = (url?: string) => { try { return !!url && JARED_ORIGINS.some((re) => re.test(new URL(url).origin)); } catch { return false; } };

const granted = new Map<number, Set<number>>();          // Jared tab -> tabs it may drive
const picking = new Map<number, (r: any) => void>();     // Jared tab -> waiting "pick" answer

chrome.tabs.onRemoved.addListener((id) => {
  granted.delete(id);
  for (const set of granted.values()) set.delete(id);
  picking.get(id)?.({ ok: false, why: 'Jared was closed.' });
  picking.delete(id);
});

async function inject(tabId: number) {
  const [{ result: has }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => typeof (window as any).jaredAct === 'function' });
  if (!has) await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['jared-capture.js'] });
}

async function capture(tabId: number, prefix = '') {
  await inject(tabId);
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (p: string) => (window as any).jaredCapture({ prefix: p }), args: [prefix] });
  return result;
}

function loaded(tabId: number, ms = 15000) {
  return new Promise<void>((done) => {
    const stop = setTimeout(finish, ms);
    function listen(id: number, info: chrome.tabs.TabChangeInfo) { if (id === tabId && info.status === 'complete') finish(); }
    function finish() { clearTimeout(stop); chrome.tabs.onUpdated.removeListener(listen); done(); }
    chrome.tabs.onUpdated.addListener(listen);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') setTimeout(finish, 600); }).catch(finish);
  });
}

async function act(tabId: number, key: string, prefix: string) {
  await inject(tabId);
  const before = (await chrome.tabs.get(tabId)).url;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (k: string, p: string) => (window as any).jaredAct(k, p), args: [key, prefix] });
    if (result) return result;
  } catch { /* the click loaded a new page, which ended the script: copy the new page below */ }
  await loaded(tabId);
  await new Promise((r) => setTimeout(r, 500));
  const after = (await chrome.tabs.get(tabId)).url;
  return { ok: true, moved: after !== before, capture: await capture(tabId, prefix) };
}

// From Jared's page (through jared-bridge.content.ts).
export async function handleJared(msg: any, sender: chrome.runtime.MessageSender) {
  const jaredTab = sender.tab?.id;
  if (!jaredTab || !isJaredOrigin(sender.url)) return { ok: false, why: 'Only Jared can use the Jared bridge.' };
  const may = (tabId: number) => granted.get(jaredTab)?.has(tabId);
  switch (msg.type) {
    case 'hello':
      return { ok: true, version: chrome.runtime.getManifest().version };
    case 'pick': {
      picking.get(jaredTab)?.({ ok: false, why: 'Replaced by a newer request.' });
      const answer = new Promise((done) => picking.set(jaredTab, done));
      await chrome.windows.create({ url: chrome.runtime.getURL(`/jared-pick.html?jared=${jaredTab}`), type: 'popup', width: 460, height: 600, focused: true });
      return answer;
    }
    case 'capture':
      if (!may(msg.tabId)) return { ok: false, why: 'Pick that tab in Yeshie first.' };
      return { ok: true, capture: await capture(msg.tabId, msg.prefix || '') };
    case 'act':
      if (!may(msg.tabId)) return { ok: false, why: 'Pick that tab in Yeshie first.' };
      return act(msg.tabId, String(msg.key || ''), String(msg.prefix || ''));
    default:
      return { ok: false, why: `Unknown Jared request ${msg.type}` };
  }
}

// From Yeshie's own picker page: the person chose a tab (or closed the picker).
export async function handlePicked(msg: any) {
  const jaredTab = Number(msg.jaredTab);
  const done = picking.get(jaredTab);
  if (!done) return { ok: false };
  picking.delete(jaredTab);
  if (!msg.tabId) { done({ ok: false, why: 'No tab was picked.' }); return { ok: true }; }
  try {
    const cap = await capture(msg.tabId);
    if (!granted.has(jaredTab)) granted.set(jaredTab, new Set());
    granted.get(jaredTab)!.add(msg.tabId);
    done({ ok: true, tabId: msg.tabId, capture: cap });
    chrome.tabs.update(jaredTab, { active: true }).catch(() => {});
  } catch (e: any) {
    done({ ok: false, why: `Yeshie could not read that tab: ${e?.message || e}` });
  }
  return { ok: true };
}
