import { setupBG } from "../functions/extcomms";
import type {PlasmoMessaging} from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import 'url:../tabs/index.html'; // Ensure the tab page is included in the build
import { initTabTracking } from "./tabHistory"; // Import tab tracking
import { addReport } from './reportHandler';
import OpenAI from "openai";

// --- Define types for LLM messaging --- 
interface SendToLLMRequestBody {
  prompt: string;
}
interface SendToLLMResponseBody {
  result?: string;
  error?: string;
}
// --- End Types ---

// Ensure storage uses the 'local' area consistently
const storage = new Storage({ area: "local" });

// --- Variable to hold API key in memory ---
let backgroundApiKey: string | null = null;

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

    // Add definitions for chrome.notifications
    namespace notifications {
        interface NotificationOptions {
            type: 'basic' | 'image' | 'list' | 'progress';
            iconUrl?: string;
            title: string;
            message: string;
            contextMessage?: string;
            priority?: number;
            eventTime?: number;
            buttons?: { title: string; iconUrl?: string }[];
            items?: { title: string; message: string }[];
            progress?: number;
            requireInteraction?: boolean;
            silent?: boolean;
        }

        function create(
            notificationId: string | undefined,
            options: NotificationOptions,
            callback?: (notificationId: string) => void
        ): void;
        function create(
            options: NotificationOptions,
            callback?: (notificationId: string) => void
        ): void;

        // Add other notification methods if needed (e.g., update, clear, etc.)
    }

}

const DEBUG_TABS = false; // Control tab-related logging

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
  if (DEBUG_TABS) console.log("Activated Tab ID:", activeInfo.tabId);
  // logCurrentTabState().catch(error => console.error("Error during onActivated logCurrentTabState:", error)); // Temporarily commented out
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Log state when a tab finishes loading
    if (changeInfo.status === 'complete') {
        if (DEBUG_TABS) console.log("Updated Tab (completed loading):", tabId);
    }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (DEBUG_TABS) console.log("New tab created:", tab.id);
  // logCurrentTabState().catch(error => console.error("Error during onCreated logCurrentTabState:", error)); // Temporarily commented out
});

// Clean up tab-specific context data shortly after a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (DEBUG_TABS) console.log("Tab removed:", tabId);
  setTimeout(async () => {
    try {
      await storage.remove(`tabContext:${tabId}`);
      if (DEBUG_TABS) console.log(`Removed context for tab ${tabId}`);
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

// --- Function to perform the actual LLM call ---
async function callLLMService(prompt: string): Promise<SendToLLMResponseBody> {
  console.log(`** callLLMService invoked with prompt: "${prompt.substring(0, 50)}..." **`);
  let apiKeyToUse: string | null = null;

  // 1. Prioritize in-memory key
  if (backgroundApiKey) {
    console.log("Using API key stored in background script memory.");
    apiKeyToUse = backgroundApiKey;
  } else {
    // 2. Fallback to reading from storage
    console.log("In-memory API key not found, attempting to read from storage...");
    try {
      // Ensure storage is defined correctly here if not globally available
      const localStore = new Storage({ area: "local" });
      apiKeyToUse = await localStore.get<string>('openai-api-key');
      if (apiKeyToUse) {
         console.log("Successfully read API key from storage.");
         // Optionally store it in memory now?
         // backgroundApiKey = apiKeyToUse;
      }
    } catch (storageError) {
       console.error('Error reading API key from storage:', storageError);
       return { error: 'Failed to read API key from storage.' };
    }
  }

  // 3. Check if we have a key now
  if (!apiKeyToUse) {
    console.error('OpenAI API key not set (checked memory and storage).');
    return { error: 'OpenAI API key not set. Please set it via the tab page.' };
  }

  // 4. Proceed with API call
  try {
    console.log('Attempting to call OpenAI API...');
    // Ensure OpenAI is imported or available here
    const openai = new OpenAI({ apiKey: apiKeyToUse, dangerouslyAllowBrowser: true });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const result = completion.choices[0]?.message?.content;
    console.log('OpenAI API Response received.');

    if (result) {
      return { result: result.trim() };
    } else {
      console.error('OpenAI API response did not contain content.', completion);
      return { error: 'LLM did not return a valid response.' };
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    let errorMessage = 'An unknown error occurred while contacting the LLM service.';
    if (error instanceof Error) { errorMessage = error.message; }
    // Add specific error checks as before
    if (String(errorMessage).includes('Incorrect API key')) { errorMessage = 'Invalid OpenAI API key. Please check and save your key again.'; }
    else if ((error as any)?.status === 429) { errorMessage = 'OpenAI API rate limit exceeded or quota reached. Check account.'; }
    return { error: `LLM Error: ${errorMessage}` };
  }
}

// --- Listener for messages from content scripts or UI ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (DEBUG_TABS) console.log("Message received:", message, "from:", sender);
  try {
    // --- Handle setting API key in memory ---
    if (message.name === 'setApiKeyInMemory') {
      if (message.body && typeof message.body.apiKey === 'string') {
        backgroundApiKey = message.body.apiKey;
        console.log("** Background script received and stored API key in memory. **");
        sendResponse({ success: true });
      } else {
        console.error("Invalid payload received for setApiKeyInMemory");
        sendResponse({ success: false, error: "Invalid API key payload" });
      }
      return false; // Synchronous response
    }
    // --- Handle sendToLLM ---
    else if (message.name === 'sendToLLM') {
      // Use the new refactored function
      callLLMService(message.body.prompt)
        .then(response => {
          console.log("Sending response for sendToLLM:", response);
          sendResponse(response);
        })
        .catch(error => {
           // This catch might be redundant if callLLMService handles all errors internally
           console.error("Unexpected error calling callLLMService:", error);
           sendResponse({ error: "Unexpected background error during LLM call." });
        });
      return true; // Indicate async response
    }
    // --- Existing handlers ---
    else if (message.name === "getTabId") {
      getCurrentTabId().then(tabId => {
        sendResponse({ tabId });
      }).catch(error => {
        console.error("Error processing getTabId message:", error);
        sendResponse({ tabId: -1 }); // Send error state
      });
      return true; // Indicate async response
    }
    else if (message.action === "captureScreenshotToClipboard") {
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
                    // Use ClipboardItem for modern browsers
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
          // Ensure response is sent even if nested async code fails unexpectedly
          if (typeof sendResponse === 'function') {
             try { sendResponse({ status: "error", message: "Unexpected error during screenshot operation." }); } catch(e) {console.error("Failed to send error response",e);}
          } else {
             console.error("sendResponse is not a function in screenshot error handler");
          }
        }
      });
      return true; // Indicate async response
    }
    else if (message.type === 'ADD_REPORT') {
      addReport(message.report)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error adding report:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }

    // Handle other messages or unknown messages...
    // Check if the message name looks like one handled by Plasmo
    const isPotentiallyPlasmoHandled = ['getLastTab', 'focusLastTab', 'focusTab'].includes(message?.name);
    if (!isPotentiallyPlasmoHandled) {
      if (DEBUG_TABS) console.warn("Unhandled message type received in background listener:", message);
    }
    // sendResponse({ status: "unhandled", message: "Message type not recognized." }); // Optional

  } catch (error) {
    console.error("Error in top-level onMessage listener:", error);
    if (typeof sendResponse === 'function') {
        try { sendResponse({ status: "error", message: "Internal background error." }); } catch(e) {console.error("Failed to send error response",e);}
    } else {
       console.error("sendResponse is not a function in top-level error handler");
    }
  }
  // If none of the async cases match, return false or undefined implicitly
  return false;
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

// --- Test LLM call on Install/Update/Reload ---
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`Extension installed/updated (${details.reason}). Running LLM test.`);

  // Give a slight delay to ensure storage might be ready, though callLLMService handles checks
  await new Promise(resolve => setTimeout(resolve, 1000));

  const testPrompt = "Explain the concept of a Chrome extension background script in one sentence.";
  const response = await callLLMService(testPrompt);

  let notificationTitle = "";
  let notificationMessage = "";

  if (response.result) {
    notificationTitle = "LLM Test Successful ✅";
    notificationMessage = `Prompt: "${testPrompt}"\nResult: ${response.result}`;
    console.log("LLM Test Result:", response.result);
  } else {
    notificationTitle = "LLM Test Failed ❌";
    notificationMessage = `Prompt: "${testPrompt}"\nError: ${response.error}`;
    console.error("LLM Test Error:", response.error);
  }

  // Truncate message if too long for notification
  if (notificationMessage.length > 200) {
     notificationMessage = notificationMessage.substring(0, 197) + "...";
  }
  // Use chrome.notifications API
  chrome.notifications.create({
    type: 'basic', 
    iconUrl: 'icon-128.png', // Ensure this path is correct relative to the extension root
    title: notificationTitle,
    message: notificationMessage,
    priority: 1 // Optional: set priority
  }, (notificationId) => {
     if (chrome.runtime.lastError) {
         console.error("Error showing notification:", chrome.runtime.lastError.message);
     } else {
         console.log("Test notification shown:", notificationId);
     }
  });
});


console.log("Background script fully initialized.");

// --- Deprecated function placeholder ---
// async function handleSendToLLM(body: SendToLLMRequestBody, sendResponse: (response: SendToLLMResponseBody) => void) {
//   // This function's logic is now primarily in callLLMService
//   // It was kept temporarily during refactoring but is no longer directly called by the message listener.
//   // The message listener now calls callLLMService directly.
//   console.warn("handleSendToLLM function called unexpectedly (should be refactored out)");
//   // If needed, replicate the call structure:
//   // callLLMService(body.prompt).then(sendResponse).catch(error => sendResponse({error: '...'}));
// }

// Remove the old handleSendToLLM definition entirely if it's fully replaced
// (Check the diff carefully) 