import { setupBG } from "../functions/extcomms";
import type {PlasmoMessaging} from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import 'url:../tabs/index.html'; // Ensure the tab page is included in the build
import { initTabTracking } from "./tabHistory"; // Import tab tracking
import { addReport } from './reportHandler';

const storage = new Storage()

// Add these type definitions at the top of your file
declare global {
  interface WorkerGlobalScope {
    addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  }
}

interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
  preloadResponse: Promise<Response | undefined>;
}

// Add these type declarations at the top of the file
declare namespace chrome {
    namespace storage {
        interface StorageArea {
            get(keys: string | string[] | object | null): Promise<{ [key: string]: any }>;
            set(items: object): Promise<void>;
            remove(keys: string | string[]): Promise<void>;
            clear(): Promise<void>;
        }
        const local: StorageArea;
        const sync: StorageArea;
    }

    namespace runtime {
        const lastError: { message: string } | undefined;
        function getURL(path: string): string;
        function sendMessage(message: any): Promise<any>;
        function connect(): { postMessage: (message: any) => void };
        const onMessage: {
            addListener: (callback: (message: any, sender: any, sendResponse: (response?: any) => void) => void) => void;
        };
        const onInstalled: {
            addListener: (callback: (details: { reason: string }) => void) => void;
        };
        const onStartup: {
            addListener: (callback: () => void) => void;
        };
    }

    namespace tabs {
        interface Tab {
            id?: number;
            url?: string;
            active: boolean;
            windowId: number;
        }
        interface TabChangeInfo {
            status?: string;
            url?: string;
            pinned?: boolean;
            audible?: boolean;
            muted?: boolean;
            favIconUrl?: string;
            title?: string;
        }
        function query(queryInfo: object): Promise<Tab[]>;
        function update(tabId: number, updateProperties: object): Promise<Tab>;
        function create(createProperties: object): Promise<Tab>;
        function reload(tabId: number): Promise<void>;
        function captureVisibleTab(
            windowId?: number,
            options?: {
                format?: 'jpeg' | 'png',
                quality?: number
            },
            callback?: (dataUrl: string) => void
        ): Promise<string>;
        function sendMessage(
            tabId: number,
            message: any,
            options?: object,
            callback?: (response: any) => void
        ): Promise<any>;
        const onActivated: {
            addListener: (callback: (activeInfo: { tabId: number }) => void) => void;
        };
        const onUpdated: {
            addListener: (callback: (tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void) => void;
        };
        const onCreated: {
            addListener: (callback: (tab: Tab) => void) => void;
        };
        const onRemoved: {
            addListener: (callback: (tabId: number) => void) => void;
        };
    }
}

console.log("Yeshie background service worker started.");

// Function to log storage usage
async function logStorageUsage() {
    try {
        const localItems = await chrome.storage.local.get(null);
        const localCount = Object.keys(localItems).length;
        console.log(`chrome.storage.local item count: ${localCount}`);
        // Optionally log local keys if needed for debugging
        // console.log("Local storage keys:", Object.keys(localItems));

        const syncItems = await chrome.storage.sync.get(null);
        const syncCount = Object.keys(syncItems).length;
        console.log(`chrome.storage.sync item count: ${syncCount}`);
        if (syncCount >= 500) { // Check against the 512 limit
            console.warn("chrome.storage.sync is near or at its MAX_ITEMS limit!");
            // Log the keys to see what's filling up sync storage
            console.log("Sync storage keys:", Object.keys(syncItems));
        }
    } catch (error) {
        console.error("Error checking storage usage:", error);
    }
}

const TAB_URL = chrome.runtime.getURL("tabs/index.html");
const CONTEXT_REMOVAL_DELAY = 10000; // 10 seconds

// --- Helper Functions ---

/**
 * Opens or focuses the extension's dedicated tab page.
 * If the tab exists, it's focused and reloaded.
 * If not, it's created.
 */
async function openOrFocusExtensionTab() {
  try {
    const tabs = await chrome.tabs.query({ url: TAB_URL });

    if (tabs.length > 0) {
      // Tab exists, focus the first one found and reload it
      const tab = tabs[0];
      if (tab.id) {
        await chrome.tabs.update(tab.id, { active: true });
        // Reload the tab to ensure it has the latest extension code
        await chrome.tabs.reload(tab.id);
        console.log(`Focused and reloaded existing tab: ${tab.id}`);
      } else {
          console.error("Found tab has no ID:", tab);
      }
    } else {
      // No tab exists, create a new one
      const newTab = await chrome.tabs.create({ url: TAB_URL });
      console.log(`Created new tab: ${newTab.id}`);
    }
  } catch (error) {
      console.error("Error opening or focusing extension tab:", error);
  }
}


/**
 * Gets the ID of the currently active tab in the current window.
 * @returns The tab ID or -1 if an error occurs or no active tab is found.
 */
async function getCurrentTabId(): Promise<number> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    // console.log("All active tabs:", tabs); // Debugging: uncomment if needed
    const tabId = tabs[0]?.id ?? -1;
    // console.log("Selected tab ID:", tabId); // Debugging: uncomment if needed
    return tabId;
  } catch (error) {
    console.error("Error getting current tab ID:", error);
    return -1;
  }
}

/**
 * Logs the current tab ID and details of all open tabs.
 */
async function logCurrentTabState() {
  try {
    const tabId = await getCurrentTabId();
    console.log("Current Active Tab ID (from background):", tabId);
    const allTabs = await chrome.tabs.query({});
    console.log("All open tabs:", allTabs.map(tab => ({ id: tab.id, url: tab.url, active: tab.active, windowId: tab.windowId })));
  } catch (error) {
      console.error("Error logging current tab state:", error);
  }
}

/**
 * Sends a message to a specific tab.
 * @param tabId The ID of the target tab.
 * @param message The message payload to send.
 */
function sendMessageToTab(tabId: number, message: any) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      console.log(`Could not send message to tab ${tabId}: ${chrome.runtime.lastError.message}`);
    } else {
      // console.log(`Message sent to tab ${tabId}, response:`, response); // Debugging
    }
  });
}


// --- Event Listeners ---

/**
 * Listener for extension installation or update events.
 * Opens the dedicated tab page on first install or update.
 */
chrome.runtime.onInstalled.addListener((details) => {
  try {
    console.log("Extension installed or updated:", details.reason);
    if (details.reason === 'install' || details.reason === 'update') {
      // Open the tab page on first install or update
      openOrFocusExtensionTab();
    }
    // Perform other setup tasks if needed
    logCurrentTabState().catch(error => console.error("Error during onInstalled logCurrentTabState:", error)); // Log initial state
  } catch (error) {
      console.error("Error in onInstalled listener:", error);
  }
});


/**
 * Listener for browser startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started, checking for extension tab...");
  openOrFocusExtensionTab();
  logCurrentTabState();
});


// Log tab state changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log("Activated Tab ID:", activeInfo.tabId);
  // logCurrentTabState().catch(error => console.error("Error during onActivated logCurrentTabState:", error)); // Temporarily commented out
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Log state when a tab finishes loading
    if (changeInfo.status === 'complete') {
        console.log("Updated Tab (completed loading):", tabId);
    }
});

chrome.tabs.onCreated.addListener((tab) => {
  console.log("New tab created:", tab.id);
  // logCurrentTabState().catch(error => console.error("Error during onCreated logCurrentTabState:", error)); // Temporarily commented out
});

// Clean up tab-specific context data shortly after a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log("Tab removed:", tabId);
  setTimeout(async () => {
    try {
      await storage.remove(`tabContext:${tabId}`);
      console.log(`Removed context for tab ${tabId}`);
      // Log state after removal attempt
      // logCurrentTabState().catch(error => console.error("Error during onRemoved logCurrentTabState:", error)); // Temporarily commented out
    } catch(error) {
        console.error(`Error removing context for tab ${tabId}:`, error);
    }
  }, CONTEXT_REMOVAL_DELAY);
});

// Log state when extension icon is clicked (if applicable)
// chrome.action.onClicked.addListener(async (tab) => {
//   console.log("Extension action clicked for tab:", tab.id);
//   logCurrentTabState();
// });

// Runtime Message Listener (for communication from content scripts/popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message, "from:", sender);
  try {
    if (message.name === "getTabId") {
      getCurrentTabId().then(tabId => {
        sendResponse({ tabId });
      }).catch(error => {
        console.error("Error processing getTabId message:", error);
        sendResponse({ tabId: -1 }); // Send error state
      });
      return true; // Indicate async response
    }

    if (message.action === "captureScreenshotToClipboard") {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        try {
          if (chrome.runtime.lastError) {
            console.error('Failed to capture screenshot:', chrome.runtime.lastError.message);
            sendResponse({ status: "error", message: chrome.runtime.lastError.message });
            return;
          }
          if (dataUrl) {
            fetch(dataUrl)
                .then(res => res.blob())
                .then(blob => {
                    navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]).then(() => {
                        console.log('Screenshot copied to clipboard');
                        sendResponse({ status: "copied" });
                    }).catch(err => {
                        console.error('Error copying screenshot blob to clipboard:', err);
                        sendResponse({ status: "error", message: err.message });
                    });
                })
                .catch(err => {
                    console.error('Error fetching blob from data URL:', err);
                    sendResponse({ status: "error", message: err.message });
                });

          } else {
            console.error('Failed to capture screenshot, no data URL returned.');
            sendResponse({ status: "error", message: "Failed to capture screenshot." });
          }
        } catch (error) {
          console.error('Unexpected error during screenshot capture/clipboard write:', error);
          sendResponse({ status: "error", message: "Unexpected error during screenshot operation." });
        }
      });
      return true; // Indicate async response
    }

    if (message.type === 'ADD_REPORT') {
      addReport(message.report)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error adding report:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }

    // Handle other messages...

    // Return true if you intend to send an asynchronous response
    // return true;
  } catch (error) {
    console.error("Error in onMessage listener:", error);
    // Optionally send an error response if appropriate for the message type
    // sendResponse({ status: "error", message: "Internal background error." });
  }
  return false; // Default to synchronous response if not handled
});


// Add offline/online listeners (if needed, already present in original code)
self.addEventListener('offline', () => {
  console.log('The browser is offline.');
  // Handle offline situation
});

self.addEventListener('online', () => {
  console.log('The browser is back online.');
  // Handle reconnection logic
});

// Fetch listener (if needed for PWA features, already present)
// self.addEventListener('fetch', (event: FetchEvent) => { ... });


// --- Initialization ---
// setupBG(); // Temporarily commented out // Setup background communication provided by extcomms
logStorageUsage(); // Log storage usage on startup
logCurrentTabState().catch(error => console.error("Error during initial logCurrentTabState:", error)); // Log initial state when script loads

// Periodic state logging (consider reducing frequency or removing if too noisy)
// setInterval(logCurrentTabState, 60000); // Temporarily commented out // e.g., every minute

// Initialize tab tracking when the background script starts
initTabTracking()
  .then(() => console.log("Tab tracking initialized"))
  .catch(error => console.error("Error initializing tab tracking:", error));

console.log("Background script fully initialized."); 