// Yeshie's tab picker for Jared (src/jared-bridge.ts). Lists your web tabs here, inside Yeshie, so
// Jared's site never sees them; the one you click is the one Jared may copy and drive.
const jaredTab = Number(new URLSearchParams(location.search).get('jared'));
let answered = false;
const answer = (tabId: number | null) => {
  answered = true;
  chrome.runtime.sendMessage({ type: 'jared_picked', jaredTab, tabId }, () => window.close());
};
window.addEventListener('beforeunload', () => { if (!answered) chrome.runtime.sendMessage({ type: 'jared_picked', jaredTab, tabId: null }); });
document.getElementById('cancel')!.onclick = () => answer(null);

(async () => {
  const list = document.getElementById('tabs')!;
  const tabs = (await chrome.tabs.query({})).filter((t) => t.id && t.id !== jaredTab && /^https?:/.test(t.url || ''));
  if (!tabs.length) list.innerHTML = '<p>No web tabs are open. Open the page you want in a tab, then try again.</p>';
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'tab';
    const icon = document.createElement('img'); icon.src = t.favIconUrl || ''; icon.alt = '';
    const col = document.createElement('div'); col.className = 'col';
    const title = document.createElement('div'); title.className = 't'; title.textContent = t.title || t.url || '';
    const url = document.createElement('div'); url.className = 'u'; url.textContent = t.url || '';
    col.append(title, url); b.append(icon, col);
    b.onclick = () => answer(t.id!);
    const li = document.createElement('li'); li.append(b); list.append(li);
  }
})();
