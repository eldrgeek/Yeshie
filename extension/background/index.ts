import { storageGet, storageSet, storageRemove } from "../functions/storage";
import { logInfo, logWarn, logError } from "../functions/logger";
import { initWebSocketHandlers } from "./websocket-handlers";

// Constants
export const LAST_TAB_KEY = "yeshie_last_active_tab";
export const APPLICATION_TABS_KEY = "yeshie_application_tabs";
const EXTENSION_URL_PATTERN = chrome.runtime.getURL("");
const MIN_TAB_FOCUS_TIME = 800;

// URL for the main Control page
const CONTROL_PAGE_URL = chrome.runtime.getURL('tabs/index.html');

// Pattern used when querying for the control page (handles hashes or query params)
const CONTROL_PAGE_PATTERN = `${CONTROL_PAGE_URL}*`;


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

  chrome.tabs.query({ active: true, currentWindow: true })
    .then(([tab]) => tab && trackTab(tab))
    .catch(error => logError("TabHistory", "Init error", { error }));

  debouncedUpdateTabs();
}

// Tab tracking logic
async function trackTab(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.url || isExtensionUrl(tab.url)) return;
  await storageSet(LAST_TAB_KEY, {
    id: tab.id,
    url: tab.url,
    title: tab.title || "Untitled",
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
    if (!tab.id || !tab.url || isExtensionUrl(tab.url)) return groups;
    const windowKey = String(tab.windowId);
    (groups[windowKey] ||= []).push({
      id: tab.id,
      url: tab.url,
      title: tab.title || "Untitled",
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

/**
 * Ensure the Control page tab exists and optionally focus/reload it.
 * @param options Set `focus` to false to avoid stealing focus during startup.
 * @returns The tab ID of the Control page, or null if creation failed.
 */
async function openOrFocusExtensionTab(options: { focus?: boolean } = {}): Promise<number | null> {
  const { focus = true } = options;

  try {
    const tabs = await chrome.tabs.query({ url: CONTROL_PAGE_PATTERN });
    const existing = tabs[0];

    // Debugger breakpoint to inspect tab query results
    debugger;


    if (existing && existing.id) {
      const tabId = existing.id;
      if (focus) {
        await chrome.windows.update(existing.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        await chrome.tabs.reload(tabId);
      }
      return tabId;
    }

    const newTab = await chrome.tabs.create({ url: CONTROL_PAGE_URL, active: focus });
    return newTab.id ?? null;
  } catch (error) {
    logError("Extension", "Failed to open or focus Control tab", { error });
    return null;
  }
}

// Function to store information about open control page tabs
async function saveControlTabsInfo() {
  logInfo("Extension", "Saving information about open Control page tabs");
  const tabs = await chrome.tabs.query({ url: CONTROL_PAGE_PATTERN });
  
  if (tabs.length > 0) {
    // Save information about open tabs (windowId and any other relevant info)
    const tabsInfo = tabs.map(tab => ({
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active
    }));
    await storageSet(CONTROL_TABS_KEY, tabsInfo);
    logInfo("Extension", `Saved info for ${tabsInfo.length} Control page tabs`, { tabsInfo });
  }
}

// Function to restore control page tabs
async function restoreControlTabs() {
  try {
    const tabsInfo = await storageGet<Array<{windowId: number, index: number, active: boolean}>>(CONTROL_TABS_KEY);
    
    if (tabsInfo && tabsInfo.length > 0) {
      logInfo("Extension", `Restoring ${tabsInfo.length} Control page tab(s)`, { tabsInfo });
      
      const controlPageUrl = CONTROL_PAGE_URL;
      
      // Get all current windows
      const windows = await chrome.windows.getAll();
      const windowIds = new Set(windows.map(win => win.id));
      
      // Create a new tab for each saved tab info
      for (const tabInfo of tabsInfo) {
        try {
          // Check if the original window still exists
          const windowExists = tabInfo.windowId && windowIds.has(tabInfo.windowId);
          
          if (windowExists) {
            // Create in original window
            chrome.tabs.create({
              url: controlPageUrl,
              windowId: tabInfo.windowId,
              index: tabInfo.index,
              active: tabInfo.active
            });
            logInfo("Extension", "Created Control page tab in original window", { windowId: tabInfo.windowId });
          } else {
            // Create in current window if original doesn't exist
            chrome.tabs.create({
              url: controlPageUrl,
              active: tabInfo.active
            });
            logInfo("Extension", "Created Control page tab in current window (original window not found)");
          }
        } catch (tabError) {
          logError("Extension", "Error creating Control page tab", { tabError, tabInfo });
          // Try creating in current window as fallback
          chrome.tabs.create({ url: controlPageUrl });
        }
      }
      
      // Clear the stored info after restoring
      await storageRemove(CONTROL_TABS_KEY);
    } else {
      logInfo("Extension", "No Control page tabs to restore");
    }
  } catch (error) {
    logError("Extension", "Error restoring Control page tabs", { error });
  }
}

// Listen for extension unload to save Control page tab info
chrome.runtime.onSuspend.addListener(() => {
  logInfo("Extension", "Extension being suspended, saving Control page tabs info");
  saveControlTabsInfo().catch(error => {
    logError("Extension", "Error saving Control page tabs info", { error });
  });
});

// Listen for extension startup and reload Control page tabs
chrome.runtime.onStartup.addListener(async () => {
  logInfo("Extension", "Extension startup detected");
  const [original] = await chrome.tabs.query({ active: true, currentWindow: true });
  const controlId = await openOrFocusExtensionTab({ focus: false });
  if (original?.id && original.id !== controlId) {
    try {
      await chrome.tabs.update(original.id, { active: true });
    } catch (e) {
      logWarn("Extension", "Unable to restore original tab", { error: e });
    }
  }
  restoreControlTabs();
});

// Add listener for extension installation or update to reload Control page tabs
chrome.runtime.onInstalled.addListener(async (details) => {
  logInfo("Extension", "Extension installed or updated", { reason: details.reason });

  // Only restore tabs for reload/update, not for fresh install
  if (details.reason === 'update' || details.reason === 'chrome_update') {
    const [original] = await chrome.tabs.query({ active: true, currentWindow: true });
    const controlId = await openOrFocusExtensionTab({ focus: false });
    if (original?.id && original.id !== controlId) {
      try {
        await chrome.tabs.update(original.id, { active: true });
      } catch (e) {
        logWarn("Extension", "Unable to restore original tab", { error: e });
      }
    }
    restoreControlTabs();
  }
});

// Add a listener to handle messages from extension pages that might be closing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTROL_PAGE_UNLOADING') {
    // When a control page is about to unload, save its state
    logInfo("Extension", "Control page unloading, recording tab info", { tabId: sender.tab?.id });
    // Immediately save control tabs info when we get an unload notification
    saveControlTabsInfo().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      logError("Extension", "Error saving Control page tabs info during unload", { error });
      sendResponse({ success: false, error });
    });
    
    // Return true to indicate we'll send an async response
    return true;
  }
});

// Initialize tab tracking
initTabTracking();

// Initialize WebSocket handlers
initWebSocketHandlers();

// Log initialization
logInfo("Extension", "Background script initialized");
