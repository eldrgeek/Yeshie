// Identity and live window/tab state for this extension instance.
//
// The relay keeps many extension instances connected at once (one per Chrome
// profile) and routes each job to exactly one of them. For that it needs to know
// who each connection is and which tabs it can see. See
// docs/design/multi-connection-relay.md.

export type InstanceIdentity = {
  instanceId: string;
  profile: { email: string | null; gaiaId: string | null; label: string | null };
};

export type InstanceState = {
  windows: { windowId: number; focused: boolean; type: string | null; incognito: boolean }[];
  tabs: { tabId: number; windowId: number; url: string; title: string; active: boolean }[];
};

// The instance id is generated once and kept in chrome.storage.local, which is
// separate for each Chrome profile, so it is stable per profile across restarts
// and reloads. The email comes from the signed-in Chrome account (needs the
// identity + identity.email permissions); an optional label can be set in
// chrome.storage.local.yeshieProfileLabel.
export async function loadInstanceIdentity(): Promise<InstanceIdentity> {
  const store = await chrome.storage.local.get(['yeshieInstanceId', 'yeshieProfileLabel']);
  let instanceId = typeof store.yeshieInstanceId === 'string' ? store.yeshieInstanceId : '';
  if (!instanceId) {
    instanceId = crypto.randomUUID();
    await chrome.storage.local.set({ yeshieInstanceId: instanceId });
  }
  let email: string | null = null;
  let gaiaId: string | null = null;
  try {
    const info = await (chrome.identity as any).getProfileUserInfo({ accountStatus: 'ANY' });
    email = info?.email || null;
    gaiaId = info?.id || null;
  } catch { /* identity permission missing or not signed in */ }
  const label = typeof store.yeshieProfileLabel === 'string' && store.yeshieProfileLabel ? store.yeshieProfileLabel : null;
  return { instanceId, profile: { email, gaiaId, label } };
}

export function snapshotFromWindows(wins: any[]): InstanceState {
  const windows = wins.map(w => ({ windowId: w.id, focused: !!w.focused, type: w.type || null, incognito: !!w.incognito }));
  const tabs = wins.flatMap(w => (w.tabs || []).map((t: any) => ({
    tabId: t.id, windowId: t.windowId, url: t.url || t.pendingUrl || '', title: t.title || '', active: !!t.active,
  })));
  return { windows, tabs };
}

export async function captureInstanceState(): Promise<InstanceState> {
  return snapshotFromWindows(await chrome.windows.getAll({ populate: true }));
}

// Call onChange (debounced) whenever this profile's windows or tabs change.
// Returns a function that triggers an immediate-ish report (used on connect).
export function watchInstanceState(onChange: () => void, debounceMs = 250): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onChange(); }, debounceMs);
  };
  chrome.tabs.onCreated.addListener(trigger);
  chrome.tabs.onRemoved.addListener(trigger);
  chrome.tabs.onActivated.addListener(trigger);
  chrome.tabs.onAttached.addListener(trigger);
  chrome.tabs.onDetached.addListener(trigger);
  chrome.tabs.onReplaced.addListener(trigger);
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.title || info.status === 'complete') trigger();
  });
  chrome.windows.onCreated.addListener(trigger);
  chrome.windows.onRemoved.addListener(trigger);
  chrome.windows.onFocusChanged.addListener(trigger);
  return trigger;
}
