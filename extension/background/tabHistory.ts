import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })

// Store for last active tabs (not including our extension tabs)
const LAST_TAB_KEY = "yeshie_last_active_tab"
const EXTENSION_URL_PATTERN = chrome.runtime.getURL("")

// Set a minimum "visibility time" to consider a tab worth tracking (in ms)
// But use a shorter time for tabs that are about to be replaced
const MIN_TAB_FOCUS_TIME = 800
const MIN_TAB_FOCUS_TIME_BEFORE_NAVIGATION = 300

interface TabInfo {
  id: number
  url: string
  title: string
  timestamp: number
}

// Track the last time tab focus changed to avoid rapid flickering
let lastTabFocusTime = 0
let pendingTabUpdate: NodeJS.Timeout | null = null

// Keep track of the currently focused window
let lastFocusedWindowId: number | null = null

// Initialize tab tracking
export async function initTabTracking() {
  // Clear any existing listeners
  chrome.tabs.onActivated.removeListener(handleTabActivated)
  chrome.tabs.onUpdated.removeListener(handleTabUpdated)
  chrome.tabs.onRemoved.removeListener(handleTabRemoved)
  
  // Listen for tab activation changes
  chrome.tabs.onActivated.addListener(handleTabActivated)
  
  // Listen for tab update events to handle title changes
  chrome.tabs.onUpdated.addListener(handleTabUpdated)
  
  // Listen for tab removal events to save the last tab before it's closed
  chrome.tabs.onRemoved.addListener(handleTabRemoved)
  
  console.log("Tab history tracking initialized with all listeners")
  
  // Initial save of the current active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tabs.length > 0) {
      const currentTab = tabs[0]
      console.log("Initial active tab:", currentTab.id, currentTab.url)
      
      // Force immediate tracking of the initial tab
      if (currentTab && currentTab.id && !isExtensionUrl(currentTab.url || "")) {
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
}

// Check if a URL is from our extension or a browser internal page
function isExtensionUrl(url: string): boolean {
  return (
    url.startsWith(EXTENSION_URL_PATTERN) || 
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:")
  )
}

// Save tab info to storage
async function saveTabInfo(tabInfo: TabInfo): Promise<void> {
  try {
    console.log("Saving tab info:", tabInfo)
    await storage.set(LAST_TAB_KEY, tabInfo)
  } catch (error) {
    console.error("Error saving tab info:", error)
  }
}

// Handle tab removed events - save the tab that was active before removal
async function handleTabRemoved(tabId: number, removeInfo: { windowId: number, isWindowClosing: boolean }) {
  console.log(`Tab ${tabId} removed, isWindowClosing: ${removeInfo.isWindowClosing}`)
  
  // If this is the last tab in a window that's closing, we don't need to track
  if (removeInfo.isWindowClosing) {
    return
  }
  
  // Check if we have this tab stored
  try {
    const lastTab = await storage.get<TabInfo>(LAST_TAB_KEY)
    if (lastTab && lastTab.id === tabId) {
      console.log("Removed tab was the last active tab, clearing stored tab")
      await storage.remove(LAST_TAB_KEY)
    }
  } catch (error) {
    console.error("Error handling tab removal:", error)
  }
}

// Handle tab activation events
async function handleTabActivated(activeInfo: { tabId: number; windowId: number }) {
  try {
    // Store the window ID for focus tracking
    lastFocusedWindowId = activeInfo.windowId
    
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
    
    // Try to get immediate information about the tab
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId)
      
      // Skip tabs without a valid URL or extension/chrome URLs
      if (!tab.url || isExtensionUrl(tab.url)) {
        console.log("Skipping tab with no URL or extension URL:", tab.id, tab.url)
        return
      }
      
      // Record the tab information immediately to reduce delays
      const tabInfo: TabInfo = {
        id: tab.id,
        url: tab.url,
        title: tab.title || "Untitled",
        timestamp: Date.now()
      }
      
      // Save immediately to ensure it's available right away
      console.log("Immediately saving active tab:", tabInfo)
      await storage.set(LAST_TAB_KEY, tabInfo)
    } catch (error) {
      console.error("Error in immediate tab update:", error)
    }
    
    // Still use a shorter delay as a backup to ensure the tab is truly focused
    // and has settled with complete information (reduced from 1.5s to 500ms)
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
        if (isExtensionUrl(tab.url)) {
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
        await storage.set(LAST_TAB_KEY, tabInfo)
      } catch (error) {
        console.error("Error in delayed tab update:", error)
      } finally {
        pendingTabUpdate = null
      }
    }, 500) // Reduced from 1.5s to 500ms for better responsiveness
    
  } catch (error) {
    console.error("Error tracking tab:", error)
  }
}

// Handle tab updated events (title changes, etc.)
function handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
  // Only track if this is the active tab and it has completed loading
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
    const lastTab = await storage.get<TabInfo>(LAST_TAB_KEY)
    
    if (lastTab) {
      // Verify the tab still exists before returning it
      try {
        await chrome.tabs.get(lastTab.id)
        return lastTab
      } catch (error) {
        console.warn("Last tab no longer exists:", lastTab.id)
        // Clear the stored tab since it no longer exists
        await storage.remove(LAST_TAB_KEY)
        return null
      }
    }
    
    return null
  } catch (error) {
    console.error("Error retrieving last active tab:", error)
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