import { storageGet, storageSet, storageRemove } from "../functions/storage"
import { log } from "../functions/DiagnosticLogger"
// import debounce from 'lodash/debounce'; // Remove lodash import

// Store for last active tabs (not including our extension tabs)
export const LAST_TAB_KEY = "yeshie_last_active_tab"
// Store for list of all relevant application tabs
export const APPLICATION_TABS_KEY = "yeshie_application_tabs"
const CONTROL_TAB_ID_KEY = "yeshieControlTabId"; // Storage key for the control tab ID

const EXTENSION_URL_PATTERN = chrome.runtime.getURL("")
const CONTROL_TAB_URL = chrome.runtime.getURL("tabs/index.html") // Define Control Tab URL here
const CONTROL_TAB_TITLE = "Yeshie Control"; // Define Control Tab Title

// Set a minimum "visibility time" to consider a tab worth tracking (in ms)
// But use a shorter time for tabs that are about to be replaced
const MIN_TAB_FOCUS_TIME = 800
const MIN_TAB_FOCUS_TIME_BEFORE_NAVIGATION = 300

// Export the interface
export interface TabInfo {
  id: number
  url: string
  title: string
  timestamp: number
}


// --- Add simplified type for storing application tabs ---
export interface StoredApplicationTab {
  id: number;
  url: string;
  title: string;
  index: number;
}

// Track the last time tab focus changed to avoid rapid flickering
let lastTabFocusTime = 0
let pendingTabUpdate: NodeJS.Timeout | null = null

// Keep track of the currently focused window
let lastFocusedWindowId: number | null = null

// Initialize tab tracking
export async function initTabTracking() {
  console.log("--- initTabTracking() called ---"); // Add entry log
  // Clear any existing listeners
  chrome.tabs.onActivated.removeListener(handleTabActivated)
  chrome.tabs.onUpdated.removeListener(handleTabUpdated)
  chrome.tabs.onRemoved.removeListener(handleTabRemoved)
  chrome.tabs.onMoved.removeListener(handleTabMoved); // Remove onMoved listener
  
  // Listen for tab activation changes
  chrome.tabs.onActivated.addListener(handleTabActivated)
  
  // Listen for tab update events to handle title changes
  chrome.tabs.onUpdated.addListener(handleTabUpdated)
  
  // Listen for tab removal events
  chrome.tabs.onRemoved.addListener(handleTabRemoved)

  // Listen for tab moved events
  chrome.tabs.onMoved.addListener(handleTabMoved); // Add onMoved listener
  
  console.log("Tab history tracking initialized with all listeners")
  
  // Initial save of the current active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tabs.length > 0) {
      const currentTab = tabs[0]
      console.log("Initial active tab:", currentTab.id, currentTab.url)
      
      // Force immediate tracking of the initial tab
      if (currentTab && currentTab.id && !isExtensionUrl(currentTab.url || "", EXTENSION_URL_PATTERN)) {
        saveTabInfo({
          id: currentTab.id,
          url: currentTab.url || "",
          title: currentTab.title || "Untitled",
          timestamp: Date.now()
        })
      }
    }
  } catch (error) {
    console.error("Error getting initial active tab:", error)
  }
  
  // Initial population of the application tabs list
  console.log("Performing immediate initial update of stored application tabs...");
  await updateStoredApplicationTabs(); 

  // Also schedule a slightly delayed update to catch slow-loading tabs after install/update
  setTimeout(() => {
    console.log("Performing delayed initial update of stored application tabs...");
    updateStoredApplicationTabs();
  }, 2000); // 2-second delay
}

// Check if a URL is from our extension or a browser internal page
function isExtensionUrl(url: string, currentOrigin: string): boolean {
  return (
    url.startsWith(currentOrigin) || // Filter out this extension's own pages
    url.startsWith("chrome://") ||   // Keep filtering standard chrome:// pages (except extensions)
    // Keep filtering *other* chrome-extension pages unless explicitly allowed above
    (url.startsWith("chrome-extension://") && !url.startsWith(currentOrigin) && url !== "chrome-extension://chphlpgkkbolifaimnlloiipkdnihall/onetab.html") || // Use oneTabUrl variable here
    url.startsWith("about:")
  )
}

// Save tab info to storage
async function saveTabInfo(tabInfo: TabInfo): Promise<void> {
  try {
    console.log("Saving tab info:", tabInfo)
    await storageSet(LAST_TAB_KEY, tabInfo)
    log('storage_set', { key: LAST_TAB_KEY, tabId: tabInfo.id, url: tabInfo.url })
  } catch (error) {
    console.error("Error saving tab info:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('storage_error', { operation: 'saveTabInfo', error: errorMessage })
  }
}

// Handle tab removed events - save the tab that was active before removal
async function handleTabRemoved(tabId: number, removeInfo: { windowId: number, isWindowClosing: boolean }) {
  console.log(`Tab ${tabId} removed, isWindowClosing: ${removeInfo.isWindowClosing}`)
  
  // Update the application tab list
  console.log(`[Trigger] Calling debouncedUpdateStoredApplicationTabs from handleTabRemoved for tab ${tabId}`); // Log Trigger
  debouncedUpdateStoredApplicationTabs();
  
  // If this is the last tab in a window that's closing, we don't need to track
  if (removeInfo.isWindowClosing) {
    return
  }
  
  // Check if we have this tab stored
  try {
    const lastTab = await storageGet<TabInfo>(LAST_TAB_KEY)
    if (lastTab && lastTab.id === tabId) {
      console.log("Removed tab was the last active tab, clearing stored tab")
      await storageRemove(LAST_TAB_KEY)
      log('storage_remove', { key: LAST_TAB_KEY, reason: 'Tab removed' })
    }
  } catch (error) {
    console.error("Error handling tab removal:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('storage_error', { operation: 'handleTabRemoved_check', error: errorMessage })
  }
}

// Handle tab activation events
async function handleTabActivated(activeInfo: { tabId: number; windowId: number }) {
  try {
    // Store the window ID for focus tracking
    lastFocusedWindowId = activeInfo.windowId
    
    // Update application tabs list (debounced)
    console.log(`[Trigger] Calling debouncedUpdateStoredApplicationTabs from handleTabActivated for tab ${activeInfo.tabId}`); // Log Trigger
    debouncedUpdateStoredApplicationTabs();
    
    // If two tab activations happen quickly, cancel the pending update
    if (pendingTabUpdate) {
      clearTimeout(pendingTabUpdate)
      pendingTabUpdate = null
    }
    
    // Get the timestamp for this activation
    const activationTime = Date.now()
    
    // Only update if this tab was focused for more than MIN_TAB_FOCUS_TIME
    if (activationTime - lastTabFocusTime < MIN_TAB_FOCUS_TIME) {
      console.log(`Tab ${activeInfo.tabId} focus too brief, not tracking`)
      // Save the time in case this is the beginning of a new focus
      lastTabFocusTime = activationTime
      return
    }
    
    lastTabFocusTime = activationTime
    
    // Use a short delay to ensure the tab is truly focused
    // and has settled with complete information.
    pendingTabUpdate = setTimeout(async () => {
      try {
        // Check if this is still the active window
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
        const focusedWindows = windows.filter(w => w.focused)
        const isWindowFocused = focusedWindows.some(w => w.id === activeInfo.windowId)
        
        if (!isWindowFocused) {
          console.log(`Window ${activeInfo.windowId} no longer has focus, not tracking tab ${activeInfo.tabId}`)
          return
        }
        
        const tab = await chrome.tabs.get(activeInfo.tabId)
        
        // Skip tabs without a valid URL
        if (!tab.url) {
          console.log("Skipping tab with no URL:", tab.id)
          return
        }
        
        // Skip extension tabs and chrome:// URLs
        if (isExtensionUrl(tab.url, EXTENSION_URL_PATTERN)) {
          console.log("Skipping browser/extension tab:", tab.id, tab.url)
          return
        }
        
        // Verify the tab is still active before saving it
        const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true })
        if (currentTabs.length === 0 || currentTabs[0].id !== tab.id) {
          console.log("Tab no longer active, not saving:", tab.id)
          return
        }
        
        const tabInfo: TabInfo = {
          id: tab.id,
          url: tab.url,
          title: tab.title || "Untitled",
          timestamp: Date.now()
        }
        
        console.log("Updating last active tab with finalized info:", tabInfo)
        await saveTabInfo(tabInfo)
      } catch (error) {
        console.error("Error in delayed tab update:", error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        log('tab_history_error', { context: 'delayed_update', error: errorMessage })
      } finally {
        pendingTabUpdate = null
      }
    }, 500) // Reduced from 1.5s to 500ms for better responsiveness
    
  } catch (error) {
    console.error("Error tracking tab:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('tab_history_error', { context: 'handleTabActivated_main', error: errorMessage })
  }
}

// Handle tab updated events (title changes, etc.)
function handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
  // Update application tabs list if URL or status changes (debounced)
  /* --- REMOVED Direct Call --- 
  if (changeInfo.status || changeInfo.url) {
      console.log(`[Trigger] Calling debouncedUpdateStoredApplicationTabs from handleTabUpdated (status/url change) for tab ${tabId}`); // Log Trigger
      debouncedUpdateStoredApplicationTabs();
  }
  --- END REMOVED Direct Call --- */
  
  // Only track focus history for the active tab completing load
  if (!tab.active || changeInfo.status !== 'complete') {
    return
  }
  
  // Skip extension tabs
  if (tab.url?.startsWith(EXTENSION_URL_PATTERN)) {
    return
  }
  
  // Handle successful navigation in current tab - this helps ensure
  // we have the latest title and URL
  if (changeInfo.status === 'complete') {
    // Use the activation handler with a small delay to update
    handleTabActivated({ tabId, windowId: tab.windowId })
  }
}

// Get the last active tab
export async function getLastActiveTab(): Promise<TabInfo | null> {
  try {
    const lastTab = await storageGet<TabInfo>(LAST_TAB_KEY)
    log('storage_get', { key: LAST_TAB_KEY, found: !!lastTab })
    
    if (lastTab) {
      // Verify the tab still exists before returning it
      try {
        await chrome.tabs.get(lastTab.id)
        return lastTab
      } catch (error) {
        console.warn("Last tab no longer exists:", lastTab.id)
        // Clear the stored tab since it no longer exists
        await storageRemove(LAST_TAB_KEY)
        log('storage_remove', { key: LAST_TAB_KEY, reason: 'Tab no longer exists' })
        return null
      }
    }
    
    return null
  } catch (error) {
    console.error("Error retrieving last active tab:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('storage_error', { operation: 'getLastActiveTab', error: errorMessage })
    return null
  }
}

// Focus the last active tab
export async function focusLastActiveTab(): Promise<boolean> {
  try {
    const lastTab = await getLastActiveTab()
    
    if (!lastTab) {
      console.warn("No last active tab found")
      return false
    }
    
    console.log("Attempting to focus last active tab:", lastTab)
    
    try {
      // Check if the tab still exists
      const tab = await chrome.tabs.get(lastTab.id)
      console.log("Tab to focus exists:", tab)
      
      // Focus the window containing the tab
      if (tab.windowId) {
        console.log("Focusing window:", tab.windowId)
        await chrome.windows.update(tab.windowId, { focused: true })
      }
      
      // Wait a moment before focusing the tab
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Focus the tab itself with more detailed logging
      console.log("About to focus tab:", lastTab.id)
      const updatedTab = await chrome.tabs.update(lastTab.id, { active: true })
      console.log("Tab focus response:", updatedTab)
      
      console.log("Successfully focused last active tab:", lastTab.id)
      return true
    } catch (tabError) {
      console.error("Error focusing last active tab (may have been closed):", tabError)
      return false
    }
  } catch (error) {
    console.error("Error in focusLastActiveTab:", error)
    return false
  }
}

// --- Basic Debounce Implementation ---
function debounce<F extends (...args: any[]) => any>(
  func: F, 
  waitFor: number
): (...args: Parameters<F>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<F>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null; // Clear the timeout ID before calling the function
      func(...args);
    }, waitFor);
  };
}

// --- Function to get, filter, and store application tabs --- 
async function updateStoredApplicationTabs() {
  console.log('Updating stored application tabs...');
  try {
    const controlTabId = await storageGet<number>(CONTROL_TAB_ID_KEY);
    console.log(`CONFIRMED storageGet for CONTROL_TAB_ID_KEY, value read: ${controlTabId}`);
    if (!controlTabId) {
        console.warn("Control Tab ID not found in storage, cannot reliably identify control tab title.");
    }

    const allTabs = await chrome.tabs.query({});

    // Group tabs by windowId
    const groupedTabs: Record<string, chrome.tabs.Tab[]> = {};
    for (const tab of allTabs) {
        if (!tab.id) continue; // Skip tabs without ID

        // Assign correct title if it's the control tab, otherwise use original or fallback
        const isControlTab = controlTabId ? (tab.id === controlTabId) : (tab.url === CONTROL_TAB_URL);
        tab.title = isControlTab ? CONTROL_TAB_TITLE : (tab.title || "Untitled"); // Mutate tab object directly for simplicity here

        const windowIdStr = String(tab.windowId);
        if (!groupedTabs[windowIdStr]) {
            groupedTabs[windowIdStr] = [];
        }
        groupedTabs[windowIdStr].push(tab);
    }

    // Sort tabs within each window group by index and map to final structure
    const finalGroupedStoredTabs: Record<string, StoredApplicationTab[]> = {};
    let totalTabCount = 0;
    for (const windowIdStr in groupedTabs) {
        finalGroupedStoredTabs[windowIdStr] = groupedTabs[windowIdStr]
            .sort((a, b) => a.index - b.index) // Sort by index
            .map(tab => { // Map to StoredApplicationTab
                 console.log(`[Tab Update Map] ID: ${tab.id}, Win: ${windowIdStr}, Index: ${tab.index}, URL: ${tab.url}, Title: ${tab.title}`);
                 totalTabCount++;
                 return {
                    id: tab.id as number,
                    url: tab.url || "", 
                    title: tab.title || "Untitled", // Should be pre-assigned above
                    index: tab.index,
                 }
            });
    }

    await storageSet(APPLICATION_TABS_KEY, finalGroupedStoredTabs); // Save the grouped object
    log('storage_set', { key: APPLICATION_TABS_KEY, count: totalTabCount, windows: Object.keys(finalGroupedStoredTabs).length });
    console.log(`Stored ${totalTabCount} application tabs across ${Object.keys(finalGroupedStoredTabs).length} windows.`);

  } catch (error) {
      console.error("Error updating stored application tabs:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('storage_error', { operation: 'updateStoredApplicationTabs', error: errorMessage });
  }
}

// Debounce the update function to avoid excessive writes during rapid events
const debouncedUpdateStoredApplicationTabs = debounce(updateStoredApplicationTabs, 1000); 

// --- Add handler for tab moved --- 
function handleTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo) {
    console.log(`Tab ${tabId} moved within window ${moveInfo.windowId} from index ${moveInfo.fromIndex} to ${moveInfo.toIndex}`);
    // Trigger an update of the stored tabs list to reflect the new index order
    console.log(`[Trigger] Calling debouncedUpdateStoredApplicationTabs from handleTabMoved for tab ${tabId}`);
    debouncedUpdateStoredApplicationTabs();
} 