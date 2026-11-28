// Jared bridge (2026-11-28). Jared, the show-and-tell prototyper (eldrgeek/soma-jared), copies a real
// page and then drives it: a click on the copy clicks the real page, which settles and is copied again,
// so Jared learns the app's screens. Mike: "as I act on the Jared version, you do the same thing in the
// live version." Yeshie does the page side here because an extension is exempt from the page's CSP and
// keeps working when the page navigates; the bookmarklet route can do neither.
//
// Safety: only Jared's own pages can ask (jared-bridge.content.ts runs nowhere else and the sender's
// origin is checked again here). Jared never sees your tab list: "pick" opens Yeshie's own picker
// window, and only the tab you choose there is granted to that Jared tab, until either tab closes.
// "arrange" can also open an https address fresh (puppet play), and grants only that new tab.

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

// Jared tabs that were open before Yeshie was installed or reloaded have no bridge (content scripts only
// arrive on page load), so Jared said "Yeshie did not answer" (Mike, 2026-11-28). Give them one now.
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({})) {
    if (!tab.id || !isJaredOrigin(tab.url)) continue;
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/jared-bridge.js'] }).catch(() => {});
  }
});

async function inject(tabId: number) {
  const [{ result: has }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => typeof (window as any).jaredAct === 'function' });
  if (!has) await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['jared-capture.js'] });
}

// Puppet play: every frame of the tab, because an app may run inside a frame (a claude.ai artifact does).
async function injectAll(tabId: number) {
  const has = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: () => typeof (window as any).jaredActText === 'function' });
  const missing = has.filter((r) => !r.result).map((r) => r.frameId);
  if (missing.length) await chrome.scripting.executeScript({ target: { tabId, frameIds: missing }, world: 'MAIN', files: ['jared-capture.js'] }).catch(() => {});
}

// Click the control with these words, in one frame: every frame says how well it matches, the closest
// match wins, and an inner frame (where an embedded app runs) wins a tie with the page around it.
async function actText(tabId: number, text: string) {
  await injectAll(tabId);
  const finds = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: (t: string) => (window as any).jaredFindText?.(t) || null, args: [text] });
  const best = finds.filter((r) => r.result).sort((a, b) => b.result.score - a.result.score || (a.frameId === 0 ? 1 : 0) - (b.frameId === 0 ? 1 : 0) || a.result.len - b.result.len)[0];
  if (!best) return { ok: false, found: false, why: `Yeshie found no "${text}" in the real app.` };
  const [run] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [best.frameId] }, world: 'MAIN', func: (t: string) => (window as any).jaredActText(t), args: [text] });
  return { ...(run?.result || { ok: false }), frame: best.frameId };
}

// Arrange (as SOMA Guide does for SOMA Rooms, Mike 2026-11-17 and 2026-11-28): Jared's window on the left
// half of the screen, the real app in a window of its own on the right half. The app is either a tab you
// already granted with "pick", or an https address Jared asks for, which Yeshie opens fresh, so Jared
// never reaches a tab you did not give it.
async function arrange(jaredTab: number, msg: any) {
  const n = (v: any, lo: number, hi: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
  const a = msg.area || {};
  const al = n(a.al, -20000, 20000), at = n(a.at, -20000, 20000), aw = n(a.aw, 800, 20000), ah = n(a.ah, 400, 20000);
  if (al === null || at === null || aw === null || ah === null) return { ok: false, why: 'Jared did not say where the screen is.' };
  const half = Math.floor(aw / 2);
  const left = { left: al, top: at, width: half, height: ah };
  const right = { left: al + half, top: at, width: aw - half, height: ah };
  const jt = await chrome.tabs.get(jaredTab);
  let tabId: number | undefined;
  if (msg.tabId) {
    if (!granted.get(jaredTab)?.has(msg.tabId)) return { ok: false, why: 'Pick that tab in Yeshie first.' };
    tabId = msg.tabId;
  } else {
    let u: URL | null = null; try { u = new URL(String(msg.url || '')); } catch {}
    const local = u && u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname); // an app you run yourself
    if (!u || (u.protocol !== 'https:' && !local)) return { ok: false, why: 'Jared can only open an https address.' };
    const tab = await chrome.tabs.create({ url: u.href, active: true, windowId: jt.windowId });
    tabId = tab.id!;
  }
  // A tab that shares Jared's window moves out into its own window; one already alone just moves.
  const t = await chrome.tabs.get(tabId);
  let winId = t.windowId;
  // Chrome refuses bounds it thinks are off screen; the app still opens and is driven, just not placed.
  let placed = true;
  const place = async (id: number, b: any) => { await chrome.windows.update(id, { state: 'normal' }).catch(() => {}); await chrome.windows.update(id, b).catch(() => { placed = false; }); };
  if (t.windowId === jt.windowId) {
    const w = await chrome.windows.create({ tabId, type: 'normal', focused: false, ...right }).catch(() => null) || await chrome.windows.create({ tabId, type: 'normal', focused: false });
    winId = w.id!;
  }
  await place(jt.windowId, left);
  await place(winId, right);
  if (!granted.has(jaredTab)) granted.set(jaredTab, new Set());
  granted.get(jaredTab)!.add(tabId);
  await chrome.windows.update(jt.windowId, { focused: true }).catch(() => {});
  return { ok: true, tabId, placed };
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
      if (msg.text) return actText(msg.tabId, String(msg.text).slice(0, 200));
      return act(msg.tabId, String(msg.key || ''), String(msg.prefix || ''));
    case 'arrange':
      return arrange(jaredTab, msg);
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
