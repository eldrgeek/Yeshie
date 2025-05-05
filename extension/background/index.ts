import { setupBG } from "../functions/extcomms";
import type {PlasmoMessaging} from "@plasmohq/messaging"
import 'url:../tabs/index.html'; // Ensure the tab page is included in the build
import { initTabTracking, getLastActiveTab, focusLastActiveTab, APPLICATION_TABS_KEY, type StoredApplicationTab } from "./tabHistory";
import type { TabInfo } from "./tabHistory"; // Separate type import
import { addReport } from './reportHandler';
import OpenAI from "openai";
import { storageGet, storageSet, storageRemove, storageGetAll, logStorageUsage as logStorageUsageUtil } from "../functions/storage";
import { log } from "../functions/DiagnosticLogger"; // Assuming DiagnosticLogger is setup
// Import types from the tabs page (or a shared types file in the future)
import type { SendToLLMPayload, SendToLLMResponse, NewReportPayload } from '../tabs/index.tsx';

// --- Remove redundant types ---
// interface SendToLLMRequestBody {
//   prompt: string;
// }
// interface SendToLLMResponseBody {
//   result?: string;
//   error?: string;
// }
// --- End Types ---

const DEBUG_TABS = false; // Control tab-related logging

console.log("Yeshie background service worker started.");

// --- Variable to hold API key in memory ---
let backgroundApiKey: string | null = null;

// --- Log storage usage using the new utility ---
async function logStorageUsage() {
    try {
        await logStorageUsageUtil(); // Call the centralized function
        // Keep sync storage check for now, though ideally it would also be in the util
        // Note: sync storage usage needs separate handling if required.
        const syncItems = await chrome.storage.sync.get(null) as {[key: string]: any} | void;
        // Initialize count and update only if syncItems is a valid object
        let syncCount = 0;
        if (syncItems && typeof syncItems === 'object') {
          // Now syncItems is confirmed to be an object
          syncCount = Object.keys(syncItems).length;
        }
        console.log(`chrome.storage.sync item count: ${syncCount}`);
        if (syncCount >= 510) { // Check against the 512 limit
            log('storage_warning', { area: 'sync', message: 'MAX_ITEMS limit nearing', count: syncCount });
            console.warn("chrome.storage.sync is near or at its MAX_ITEMS limit!");
            // Log the keys to see what's filling up sync storage
            // console.log("Sync storage keys:", Object.keys(syncItems)); // Log keys if needed
        }
    } catch (error) {
        console.error("Error checking storage usage:", error);
        // Log the error using the diagnostic logger if available
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('storage_error', { operation: 'logStorageUsage', error: errorMessage });
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
    console.log(`---> Checking for existing tab with URL: ${TAB_URL}`);
    const tabs = await chrome.tabs.query({ url: TAB_URL });
    console.log(`---> Found ${tabs.length} tabs matching URL.`);

    if (tabs.length > 0) {
      // Tab exists, focus the first one found and reload it
      const tab = tabs[0];
      if (tab.id) {
        console.log(`---> Found existing tab ID: ${tab.id}. Focusing and reloading.`);
        await chrome.tabs.update(tab.id, { active: true });
        // Reload the tab to ensure it has the latest extension code
        await chrome.tabs.reload(tab.id);
        console.log(`---> Focused and reloaded existing tab: ${tab.id}`);
      } else {
          console.error("---> Found tab has no ID:", tab);
      }
    } else {
      // No tab exists, create a new one
      console.log(`---> No existing tab found. Attempting to create new tab with URL: ${TAB_URL}`);
      const newTab = await chrome.tabs.create({ url: TAB_URL });
      // Check if creation succeeded (newTab object might be populated)
      if (newTab && newTab.id) {
          console.log(`---> Successfully created new tab ID: ${newTab.id}`);
      } else {
          console.error("---> chrome.tabs.create call did not return a valid tab object.", newTab);
      }
    }
  } catch (error) {
      console.error("---> Error in openOrFocusExtensionTab:", error);
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
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    console.log("Extension installed or updated:", details.reason);

    if (details.reason === 'install') {
      // Open the tab page on first install
      console.log("Reason: install. Opening or focusing tab page.");
      openOrFocusExtensionTab();
    } else if (details.reason === 'update') {
      console.log("Reason: update. Reloading application tabs based on stored list.");
      try {
        // Read the list of application tabs maintained by tabHistory.ts
        const tabsToReload = await storageGet<StoredApplicationTab[]>(APPLICATION_TABS_KEY);
        
        if (tabsToReload && tabsToReload.length > 0) {
          console.log(`Found ${tabsToReload.length} application tabs in storage to reload.`);
          for (const tab of tabsToReload) {
            if (tab && tab.id) { // Check tab and tab.id exist
              try {
                // Verify tab still exists before reloading (optional but safer)
                await chrome.tabs.get(tab.id);
                // Attempt reload
                await chrome.tabs.reload(tab.id);
                console.log(`Reloaded application tab ID: ${tab.id} (${tab.title})`);
              } catch (reloadOrGetError: any) {
                // Log if tab doesn't exist anymore or reload failed
                if (reloadOrGetError.message?.includes("No tab with id")) {
                    console.warn(`Application tab ID ${tab.id} no longer exists.`);
                } else {
                    console.error(`Error reloading application tab ID ${tab.id}:`, reloadOrGetError.message || reloadOrGetError);
                }
              }
            } else {
              console.warn("Found invalid tab data in storage:", tab);
            }
          }
        } else {
            console.log("No application tabs found in storage to reload.");
        }

        // After reloading app tabs, ensure the main extension UI tab is open and focused.
        console.log("Ensuring extension UI tab is open/focused after update.");
        openOrFocusExtensionTab();

      } catch (storageError) {
        console.error("Error reading application tab list from storage:", storageError);
        const errorMessage = storageError instanceof Error ? storageError.message : String(storageError);
        log('storage_error', { operation: 'readAppTabsOnUpdate', error: errorMessage });
      }
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
      await storageRemove(`tabContext:${tabId}`);
      if (DEBUG_TABS) console.log(`Removed context for tab ${tabId}`);
      // Log state after removal attempt
      // logCurrentTabState().catch(error => console.error("Error during onRemoved logCurrentTabState:", error)); // Temporarily commented out
    } catch(error) {
        console.error(`Error removing context for tab ${tabId}:`, error);
        // Log error using diagnostic logger
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('storage_error', { operation: 'removeTabContext', tabId: tabId, error: errorMessage });
    }
  }, CONTEXT_REMOVAL_DELAY);
});

// Log state when extension icon is clicked (if applicable)
// chrome.action.onClicked.addListener(async (tab) => {
//   console.log("Extension action clicked for tab:", tab.id);
//   logCurrentTabState();
// });

// --- Function to perform the actual LLM call ---
async function callLLMService(prompt: string): Promise<SendToLLMResponse> {
  console.log(`** callLLMService invoked with prompt: "${prompt.substring(0, 50)}..." **`);
  let apiKeyToUse: string | null = null;

  // 1. Prioritize in-memory key
  if (backgroundApiKey) {
    console.log("Using API key stored in background script memory.");
    apiKeyToUse = backgroundApiKey;
  } else {
    // 2. Fallback to reading from storage using the new utility
    console.log("In-memory API key not found, attempting to read from storage...");
    try {
      apiKeyToUse = await storageGet<string>('openai-api-key'); // Use storageGet
      if (apiKeyToUse) {
         console.log("Successfully read API key from storage.");
         // Optionally store it in memory now
         // backgroundApiKey = apiKeyToUse;
      } else {
         console.log("API key not found in storage.");
      }
    } catch (storageError) {
       console.error('Error reading API key from storage:', storageError);
       // Log error using diagnostic logger
       const errorMessage = storageError instanceof Error ? storageError.message : String(storageError);
       log('storage_error', { operation: 'getApiKey', error: errorMessage });
       return { error: 'Failed to read API key from storage.' } as SendToLLMResponse;
    }
  }

  // 3. Check if we have a key now
  if (!apiKeyToUse) {
    console.error('OpenAI API key not set (checked memory and storage).');
    return { error: 'OpenAI API key not set. Please set it via the tab page.' } as SendToLLMResponse;
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
      return { result: result.trim() } as SendToLLMResponse;
    } else {
      console.error('OpenAI API response did not contain content.', completion);
      return { error: 'LLM did not return a valid response.' } as SendToLLMResponse;
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    let errorMessage = 'An unknown error occurred while contacting the LLM service.';
    if (error instanceof Error) { errorMessage = error.message; }
    // Add specific error checks as before
    if (String(errorMessage).includes('Incorrect API key')) { errorMessage = 'Invalid OpenAI API key. Please check and save your key again.'; }
    else if ((error as any)?.status === 429) { errorMessage = 'OpenAI API rate limit exceeded or quota reached. Check account.'; }
    return { error: `LLM Error: ${errorMessage}` } as SendToLLMResponse;
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
      // Ensure message.body conforms to SendToLLMPayload
      const payload = message.body as SendToLLMPayload;
      if (!payload || typeof payload.prompt !== 'string') {
         console.error("Invalid payload received for sendToLLM");
         sendResponse({ error: "Invalid prompt payload" } as SendToLLMResponse);
         return true; // Indicate response sent
      }

      callLLMService(payload.prompt)
        .then(response => {
          console.log("Sending response for sendToLLM:", response);
          sendResponse(response); // Response should already match SendToLLMResponse
        })
        .catch(error => {
           console.error("Unexpected error calling callLLMService:", error);
           sendResponse({ error: "Unexpected background error during LLM call." } as SendToLLMResponse);
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
      // Ensure message.report conforms to NewReportPayload
      const reportPayload = message.report as NewReportPayload;
      if (!reportPayload || !reportPayload.type || !reportPayload.title || !reportPayload.description) {
        console.error("Invalid payload received for ADD_REPORT");
        sendResponse({ success: false, error: "Invalid report payload" });
        return true; // Indicate response sent
      }

      addReport(reportPayload) // Pass the validated payload
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error adding report:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }
    else if (message.action === "saveDiagnosticLog") { // Adjusted message action name
        try {
          // Store the diagnostic data in persistent storage
          if (message.body.diagnosticData) { // Adjusted to use message.body
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const key = `diagnosticLog_${timestamp}`;

            // Use storageSet to save the diagnostic data
            storageSet(key, { // Use storageSet
              timestamp,
              data: message.body.diagnosticData, // Adjusted to use message.body
              userAgent: navigator.userAgent,
              url: message.body.url || "unknown" // Adjusted to use message.body
            }).then(() => {
               console.log(`Diagnostic log saved with key: ${key}`);
               sendResponse({
                 success: true,
                 message: "Diagnostic log saved",
                 key
               });
            }).catch(error => {
                console.error("Error saving diagnostic log:", error);
                // Log error using diagnostic logger
                const errorMessage = error instanceof Error ? error.message : String(error);
                log('storage_error', { operation: 'saveDiagnosticLog', error: errorMessage });
                sendResponse({
                  success: false,
                  message: `Error saving diagnostic log: ${errorMessage}`
                });
            });

          } else {
            sendResponse({
              success: false,
              message: "No diagnostic data provided"
            });
          }
        } catch (error) {
          console.error("Error saving diagnostic log:", error);
          // Log error using diagnostic logger
          const errorMessage = error instanceof Error ? error.message : String(error);
          log('storage_error', { operation: 'saveDiagnosticLog', error: errorMessage });
          sendResponse({
            success: false,
            message: `Error saving diagnostic log: ${errorMessage}`
          });
        }
        return true; // Indicate async response
      }
      else if (message.action === "getDiagnosticLogs") { // Adjusted message action name
        storageGetAll().then(items => { // Use storageGetAll
           // Filter for only diagnostic logs
           const logs = Object.entries(items)
             .filter(([key]) => key.startsWith('diagnosticLog_'))
             .map(([key, value]) => ({ key, ...value }));

           sendResponse({
             success: true,
             logs
           });
        }).catch(error => {
            console.error("Error retrieving diagnostic logs:", error);
            // Log error using diagnostic logger
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('storage_error', { operation: 'getDiagnosticLogs', error: errorMessage });
            sendResponse({
              success: false,
              message: `Error retrieving diagnostic logs: ${errorMessage}`
            });
        });
        return true; // Indicate async response
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
logStorageUsage(); // Log storage usage on startup using the updated function
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
  // ----> Run test ONLY on install <----
  if (details.reason !== 'install') { 
    console.log(`LLM Test skipped (reason: ${details.reason})`);
    return;
  }
  
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