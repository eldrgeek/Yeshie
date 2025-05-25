import { storageGet, storageSet, storageRemove } from "../functions/storage";
import { logInfo, logWarn, logError } from "../functions/logger";

// Constants
export const LAST_TAB_KEY = "yeshie_last_active_tab";
export const APPLICATION_TABS_KEY = "yeshie_application_tabs";
const EXTENSION_URL_PATTERN = chrome.runtime.getURL("*");
const EXTENSION_BASE_URL = chrome.runtime.getURL("");
const EXTENSION_TITLE = chrome.runtime.getManifest().name;
const MIN_TAB_FOCUS_TIME = 800;

export interface TabInfo {
  id: number;
  url?: string;
  title: string;
  timestamp: number;
}

let lastTabFocusTime = 0;
const debouncedUpdateTabs = debounce(updateStoredTabs, 1000);

// Utility: Check URLs that should be ignored
// Only ignore internal about: pages so extension pages are also tracked
const isIgnoredUrl = (url?: string) =>
  Boolean(url && url.startsWith("about:"));

// Initialize listeners
export function initTabTracking() {
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onMoved.addListener(debouncedUpdateTabs);

  chrome.tabs.query({ active: true, currentWindow: true })
    .then(([tab]) => tab && trackTab(tab))
    .catch(error => logError("TabHistory", "Init error", { error }));

  debouncedUpdateTabs();
}

// Tab tracking logic
async function trackTab(tab: chrome.tabs.Tab) {
  const url = tab.url ?? tab.pendingUrl;
  if (!tab.id || isIgnoredUrl(url)) return;
  await storageSet(LAST_TAB_KEY, {
    id: tab.id,
    url,
    title: url && url.startsWith(EXTENSION_BASE_URL)
      ? EXTENSION_TITLE
      : tab.title || "Untitled",
    timestamp: Date.now()
  });
}

// Handlers simplified
function handleTabActivated({ tabId, windowId }: chrome.tabs.TabActiveInfo) {
  const now = Date.now();
  if (now - lastTabFocusTime < MIN_TAB_FOCUS_TIME) return;
  lastTabFocusTime = now;

  chrome.tabs.get(tabId)
    .then(tab => trackTab(tab))
    .catch(error => logError("TabHistory", "Activation error", { error }));

  debouncedUpdateTabs();
}

function handleTabUpdated(tabId: number, { status }: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
  if (status === 'complete' && tab.active) handleTabActivated({ tabId, windowId: tab.windowId });
}

function handleTabRemoved(tabId: number, { isWindowClosing }: chrome.tabs.TabRemoveInfo) {
  if (isWindowClosing) return;
  storageGet<TabInfo>(LAST_TAB_KEY).then(lastTab => {
    if (lastTab?.id === tabId) storageRemove(LAST_TAB_KEY);
  }).catch(error => logError("TabHistory", "Removal error", { error }));
  debouncedUpdateTabs();
}

// Update stored application tabs concisely
async function updateStoredTabs() {
  const tabs = await chrome.tabs.query({});
  const groupedTabs = tabs.reduce<Record<string, TabInfo[]>>((groups, tab) => {
    const url = tab.url ?? tab.pendingUrl;
    if (!tab.id || isIgnoredUrl(url)) return groups;
    const windowKey = String(tab.windowId);
    (groups[windowKey] ||= []).push({
      id: tab.id,
      url,
      title: url && url.startsWith(EXTENSION_BASE_URL)
        ? EXTENSION_TITLE
        : tab.title || "Untitled",
      timestamp: Date.now()
    });
    return groups;
  }, {});

  await storageSet(APPLICATION_TABS_KEY, groupedTabs);
}

// Debounce helper (simplified)
function debounce<F extends (...args: any[]) => void>(fn: F, wait: number): F {
  let timer: NodeJS.Timeout | null = null;
  return ((...args: Parameters<F>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as F;
}

// Public function: Retrieve last active tab
export async function getLastActiveTab(): Promise<TabInfo | null> {
  const lastTab = await storageGet<TabInfo>(LAST_TAB_KEY);
  if (lastTab) {
    try {
      await chrome.tabs.get(lastTab.id);
      return lastTab;
    } catch {
      await storageRemove(LAST_TAB_KEY);
    }
  }
  return null;
}

// Public function: Focus last active tab
export async function focusLastActiveTab(): Promise<boolean> {
  const lastTab = await getLastActiveTab();
  if (!lastTab) return false;

  try {
    await chrome.windows.update((await chrome.tabs.get(lastTab.id)).windowId, { focused: true });
    await chrome.tabs.update(lastTab.id, { active: true });
    return true;
  } catch {
    logWarn("TabHistory", "Cannot focus last tab");
    return false;
  }
}

// Utility to fetch titles of this extension's pages
export async function getExtensionPageTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({ url: EXTENSION_URL_PATTERN });
  return tabs
    .filter(tab => tab.id)
    .map(tab => ({
      id: tab.id!,
      url: tab.url ?? '',
      title: tab.title || EXTENSION_TITLE,
      timestamp: Date.now()
    }));
}
