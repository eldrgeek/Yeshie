import { storageGet, storageSet, storageRemove } from "../functions/storage";
import { logInfo, logWarn, logError, clearSessionLogs, getSessionLogs } from "../functions/logger";
import { initWebSocketHandlers } from "./websocket-handlers";
import { 
  initializeSpeechGlobalState,
  getSpeechGlobalState,
  setSpeechGlobalState,
  registerSpeechEditor,
  unregisterSpeechEditor,
  setSpeechEditorFocus,
  handleSpeechRecognitionEnd,
  getActiveSpeechEditors,
  getFocusedSpeechEditor
} from "../functions/speechGlobalState";
import { initProfileConnector } from "./profileConnector";

// Constants
export const LAST_TAB_KEY = "yeshie_last_active_tab";
export const APPLICATION_TABS_KEY = "yeshie_application_tabs";
const EXTENSION_URL_PATTERN = chrome.runtime.getURL("*");
const EXTENSION_BASE_URL = chrome.runtime.getURL("");
const EXTENSION_TITLE = chrome.runtime.getManifest().name;
const MIN_TAB_FOCUS_TIME = 800;

// URL for the main Control page
const CONTROL_PAGE_URL = chrome.runtime.getURL('tabs/index.html');

// Pattern used when querying for the control page (handles hashes or query params)
const CONTROL_PAGE_PATTERN = `${CONTROL_PAGE_URL}*`;


// Add constant for storing control page tabs info
const CONTROL_TABS_KEY = "yeshie_control_page_tabs";

export interface TabInfo {
  id: number;
  url?: string;
  title: string;
  timestamp: number;
}

let lastTabFocusTime = 0;
const debouncedUpdateTabs = debounce(updateStoredTabs, 1000);

// Utility: Check URLs that should be ignored
// Only ignore internal about: pages. We want to track extension pages as well.
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

// Process recorded steps into an archived task
async function processRecordedSteps(steps: Array<any>): Promise<string> {
  const taskName = `Recording ${new Date().toISOString()}`
  const storageKey = `archived_test_${taskName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`

  const instructions = {
    tasks: [
      {
        taskName,
        steps: steps.map((step: any, idx: number) => {
          const cmd: any = { id: `step-${idx + 1}`, cmd: step.type }
          if (step.selector) cmd.sel = step.selector
          if (step.value !== undefined) cmd.value = step.value
          if (step.url) cmd.url = step.url
          return cmd
        })
      }
    ]
  }

  await storageSet(storageKey, instructions)
  return taskName
}

// Notify the Control page tab of a status update
async function notifyControlPage(type: string, payload: any) {
  const tabs = await chrome.tabs.query({ url: CONTROL_PAGE_PATTERN })
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type, payload }).catch(() => {})
    }
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
chrome.runtime.onStartup.addListener(() => {
  logInfo("Background", "Extension startup");
  if (typeof window !== 'undefined') {
    (window as any).isExtensionStartup = true;
  }
  restoreControlTabs();
  initProfileConnector();
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

  if (message.type === 'FORWARD_RECORDED_STEPS') {
    const { steps } = message.payload || {}

    processRecordedSteps(Array.isArray(steps) ? steps : [])
      .then(taskName => {
        notifyControlPage('RECORDING_PROCESSED', { success: true, taskName })
        sendResponse({ success: true })
      })
      .catch(error => {
        const errMsg = error instanceof Error ? error.message : String(error)
        notifyControlPage('RECORDING_PROCESSED', { success: false, error: errMsg })
        sendResponse({ success: false, error: errMsg })
      })

    return true
  }
});

// Initialize tab tracking
initTabTracking();

// Initialize WebSocket handlers
initWebSocketHandlers();

// Initialize global speech state
initializeSpeechGlobalState();

// Expose speech state functions globally for testing and debugging
(globalThis as any).getSpeechGlobalState = getSpeechGlobalState;
(globalThis as any).setSpeechGlobalState = setSpeechGlobalState;
(globalThis as any).registerSpeechEditor = registerSpeechEditor;
(globalThis as any).unregisterSpeechEditor = unregisterSpeechEditor;
(globalThis as any).setSpeechEditorFocus = setSpeechEditorFocus;
(globalThis as any).handleSpeechRecognitionEnd = handleSpeechRecognitionEnd;
(globalThis as any).getActiveSpeechEditors = getActiveSpeechEditors;
(globalThis as any).getFocusedSpeechEditor = getFocusedSpeechEditor;

// Expose debug log functions globally for testing and debugging
(globalThis as any).clearLogs = clearSessionLogs;

// Enhanced function that gets logs, prints them, copies to clipboard, and clears them
(globalThis as any).getLogsAndClear = async function() {
  try {
    const logs = await getSessionLogs();
    
    if (logs.length === 0) {
      console.log("📋 No logs found.");
      return;
    }
    
    console.log(`📋 Found ${logs.length} log entries:`);
    console.log("=".repeat(50));
    
    // Format logs nicely
    const formattedLogs = logs.map((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const levelIcon = {
        'info': 'ℹ️',
        'warn': '⚠️',
        'error': '❌',
        'debug': '🐛'
      }[log.level] || '📝';
      
      let formatted = `${index + 1}. [${time}] ${levelIcon} ${log.feature}: ${log.message}`;
      if (log.context) {
        formatted += `\n   Context: ${JSON.stringify(log.context, null, 2).replace(/\n/g, '\n   ')}`;
      }
      return formatted;
    }).join('\n\n');
    
    console.log(formattedLogs);
    console.log("=".repeat(50));
    
    // Copy to clipboard - create a clean text format
    const clipboardText = logs.map((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      let text = `${index + 1}. [${time}] ${log.level.toUpperCase()} ${log.feature}: ${log.message}`;
      if (log.context) {
        text += `\n   Context: ${JSON.stringify(log.context)}`;
      }
      return text;
    }).join('\n\n');
    
    // Try to copy to clipboard, but handle gracefully if not available
    let clipboardSuccess = false;
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clipboardText);
        console.log("📋 Logs copied to clipboard!");
        clipboardSuccess = true;
      } else {
        console.log("⚠️ Clipboard API not available in background context. Use the bridge function from page console instead.");
        console.log("💡 Clipboard text available in return value:");
        console.log(clipboardText);
      }
    } catch (clipboardError) {
      console.log("⚠️ Clipboard copy failed:", clipboardError);
      console.log("💡 Clipboard text available in return value:");
      console.log(clipboardText);
    }
    
    // Clear the logs
    await clearSessionLogs();
    console.log("🗑️ Logs cleared from storage.");
    
    return {
      logs,
      clipboardText,
      clipboardSuccess
    };
  } catch (error) {
    console.error("❌ Error in getLogsAndClear:", error);
    return [];
  }
};

// Keep the simple getLogs for backward compatibility
(globalThis as any).getLogs = getSessionLogs;

// Log initialization
logInfo("Extension", "Background script initialized");
