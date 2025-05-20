import { storageGet, storageSet, storageRemove } from "../functions/storage";
import { logInfo, logWarn, logError } from "../functions/logger";
import { initWebSocketHandlers } from "./websocket-handlers";

// Constants
export const LAST_TAB_KEY = "yeshie_last_active_tab";
export const APPLICATION_TABS_KEY = "yeshie_application_tabs";
const EXTENSION_URL_PATTERN = chrome.runtime.getURL("");
const MIN_TAB_FOCUS_TIME = 800;

// Add constant for storing control page tabs info
const CONTROL_TABS_KEY = "yeshie_control_page_tabs";

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  timestamp: number;
}

let lastTabFocusTime = 0;
const debouncedUpdateTabs = debounce(updateStoredTabs, 1000);
// Track tabs that report an invalidated context so we can refresh them
const invalidatedTabs = new Set<number>();

// Utility: Check extension/internal URLs
const isExtensionUrl = (url: string) =>
  url.startsWith(EXTENSION_URL_PATTERN) ||
  url.startsWith("chrome://") ||
  url.startsWith("chrome-extension://") ||
  url.startsWith("about:");

// Initialize listeners
export function initTabTracking() {
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onMoved.addListener(debouncedUpdateTabs);

  chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => tab && trackTab(tab))
    .catch((error) => logError("TabHistory", "Init error", { error }));

  debouncedUpdateTabs();
}

// Tab tracking logic
async function trackTab(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.url || isExtensionUrl(tab.url)) return;
  await storageSet(LAST_TAB_KEY, {
    id: tab.id,
    url: tab.url,
    title: tab.title || "Untitled",
    timestamp: Date.now(),
  });
}

// Handlers simplified
function handleTabActivated({ tabId, windowId }: chrome.tabs.TabActiveInfo) {
  const now = Date.now();
  if (now - lastTabFocusTime < MIN_TAB_FOCUS_TIME) return;
  lastTabFocusTime = now;

  chrome.tabs
    .get(tabId)
    .then((tab) => trackTab(tab))
    .catch((error) => logError("TabHistory", "Activation error", { error }));

  if (invalidatedTabs.has(tabId)) {
    logWarn("Extension", "Reloading tab due to invalidated context", { tabId });
    chrome.tabs.reload(tabId);
    invalidatedTabs.delete(tabId);
  }

  debouncedUpdateTabs();
}

function handleTabUpdated(
  tabId: number,
  { status }: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
) {
  if (status === "complete" && tab.active)
    handleTabActivated({ tabId, windowId: tab.windowId });
}

function handleTabRemoved(
  tabId: number,
  { isWindowClosing }: chrome.tabs.TabRemoveInfo,
) {
  if (isWindowClosing) return;
  storageGet<TabInfo>(LAST_TAB_KEY)
    .then((lastTab) => {
      if (lastTab?.id === tabId) storageRemove(LAST_TAB_KEY);
    })
    .catch((error) => logError("TabHistory", "Removal error", { error }));
  debouncedUpdateTabs();
}

// Update stored application tabs concisely
async function updateStoredTabs() {
  const tabs = await chrome.tabs.query({});
  const groupedTabs = tabs.reduce<Record<string, TabInfo[]>>((groups, tab) => {
    if (!tab.id || !tab.url || isExtensionUrl(tab.url)) return groups;
    const windowKey = String(tab.windowId);
    (groups[windowKey] ||= []).push({
      id: tab.id,
      url: tab.url,
      title: tab.title || "Untitled",
      timestamp: Date.now(),
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
    await chrome.windows.update((await chrome.tabs.get(lastTab.id)).windowId, {
      focused: true,
    });
    await chrome.tabs.update(lastTab.id, { active: true });
    return true;
  } catch {
    logWarn("TabHistory", "Cannot focus last tab");
    return false;
  }
}

// Function to store information about open control page tabs
async function saveControlTabsInfo() {
  logInfo("Extension", "Saving information about open Control page tabs");
  const controlPageUrl = chrome.runtime.getURL("tabs/index.html");
  const tabs = await chrome.tabs.query({ url: controlPageUrl });

  if (tabs.length > 0) {
    // Save information about open tabs (windowId and any other relevant info)
    const tabsInfo = tabs.map((tab) => ({
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active,
    }));
    await storageSet(CONTROL_TABS_KEY, tabsInfo);
    logInfo(
      "Extension",
      `Saved info for ${tabsInfo.length} Control page tabs`,
      { tabsInfo },
    );
  }
}

// Listen for extension unload to save Control page tab info
chrome.runtime.onSuspend.addListener(() => {
  logInfo(
    "Extension",
    "Extension being suspended, saving Control page tabs info",
  );
  saveControlTabsInfo().catch((error) => {
    logError("Extension", "Error saving Control page tabs info", { error });
  });
});

// Add a listener to handle messages from extension pages that might be closing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONTROL_PAGE_UNLOADING") {
    // When a control page is about to unload, save its state
    logInfo("Extension", "Control page unloading, recording tab info", {
      tabId: sender.tab?.id,
    });
    // Immediately save control tabs info when we get an unload notification
    saveControlTabsInfo()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        logError(
          "Extension",
          "Error saving Control page tabs info during unload",
          { error },
        );
        sendResponse({ success: false, error });
      });

    // Return true to indicate we'll send an async response
    return true;
  }

  if (message.type === "CONTENT_SCRIPT_CONNECTION_ERROR") {
    const tabId = sender.tab?.id;
    logError("Extension", "Content script connection error", { tabId });
    return false;
  }

  if (message.type === "CONTEXT_INVALIDATED") {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      invalidatedTabs.add(tabId);
      logWarn("Extension", "Marked tab context invalidated", { tabId });
    }
    return false;
  }
});

// Initialize tab tracking
initTabTracking();

// Initialize WebSocket handlers
initWebSocketHandlers();

// Log initialization
logInfo("Extension", "Background script initialized");
