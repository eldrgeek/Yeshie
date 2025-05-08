import { setupBG } from "../functions/extcomms";
import type {PlasmoMessaging} from "@plasmohq/messaging"
import 'url:../tabs/index.html'; // Ensure the tab page is included in the build
import { initTabTracking, getLastActiveTab, focusLastActiveTab, APPLICATION_TABS_KEY, type StoredApplicationTab } from "./tabHistory";
import type { TabInfo } from "./tabHistory"; // Separate type import
import { addReport } from './reportHandler';
import OpenAI from "openai";
import { storageGet, storageSet, storageRemove, storageGetAll, logStorageUsage as logStorageUsageUtil } from "../functions/storage";
import { logInfo, logWarn, logError, logDebug } from "../functions/logger"; // Import new logger functions
import { handleError } from "../functions/errorHandler"; // Import the new error handler
// Import types from the tabs page (or a shared types file in the future)
import type { SendToLLMPayload, SendToLLMResponse, NewReportPayload } from '../tabs/index.tsx';
import type { RawStepData } from '../functions/learn'; // Adjust path if necessary
import { Stepper } from '../functions/Stepper';

// --- Remove redundant types ---
// interface SendToLLMRequestBody {
//   prompt: string;
// }
// interface SendToLLMResponseBody {
//   result?: string;
//   error?: string;
// }
// --- End Types ---

const DEBUG_TABS = process.env.NODE_ENV === 'development'; // Use NODE_ENV for debug flag

console.log("Yeshie background service worker started.");

// --- Variable to hold API key in memory ---
let backgroundApiKey: string | null = null;

// --- Constants ---
const TAB_URL = chrome.runtime.getURL("tabs/index.html"); // Re-added
const CONTEXT_REMOVAL_DELAY = 10000; // Re-added (10 seconds)
const CONTROL_TAB_ID_KEY = "yeshieControlTabId"; // Re-added
const TASK_COUNTER_KEY = "yeshieTaskCounter";
const LEARNED_TASK_PREFIX = "learnedTask:";
const RECORDING_TIMEOUT_MS = 10000; // 10 seconds timeout to wait for content scripts

// --- Recording State ---
let isRecordingActive: boolean = false;
let currentRecordingRawSteps: RawStepData[] = [];
let activeRecordingTabs: Set<number> = new Set();
let expectedResponsesFromTabs: Set<number> = new Set(); // Tabs we expect FORWARD_RECORDED_STEPS from
let taskCounter: number = 1;
let llmProcessingTimeout: NodeJS.Timeout | null = null; // Timeout handle

// --- Load Task Counter on Startup ---
storageGet<number>(TASK_COUNTER_KEY).then(count => {
    if (count) {
        taskCounter = count;
        logInfo(`Loaded initial task counter: ${taskCounter}`);
    } else {
        logInfo(`Initializing task counter to 1.`);
        // Optionally save the initial value: storageSet(TASK_COUNTER_KEY, 1);
    }
}).catch(error => handleError(error, { operation: 'loadTaskCounter' }));

// --- Helper Functions ---

/**
 * Opens or focuses the extension's dedicated tab page.
 * If the tab exists, it's focused and reloaded.
 * If not, it's created.
 * Stores the ID of the control tab in storage.
 */
async function openOrFocusExtensionTab() {
  let foundTabId: number | null = null;
  try {
    logDebug(`Checking for existing tab with URL: ${TAB_URL}`);
    const tabs = await chrome.tabs.query({ url: TAB_URL });
    logDebug(`Found ${tabs.length} tabs matching URL.`);

    if (tabs.length > 0) {
      // Tab exists, focus the first one found and reload it
      const tab = tabs[0];
      if (tab.id) {
        foundTabId = tab.id; // Store the ID
        logInfo(`Found existing extension tab ID: ${tab.id}. Focusing and reloading.`);
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.tabs.reload(tab.id);
        logInfo(`Focused and reloaded existing extension tab: ${tab.id}`);
      } else {
        handleError("Found extension tab has no ID", { tab });
      }
    } else {
      // No tab exists, create a new one
      logInfo(`No existing extension tab found. Creating new tab with URL: ${TAB_URL}`);
      const newTab = await chrome.tabs.create({ url: TAB_URL });
      if (newTab && newTab.id) {
        foundTabId = newTab.id; // Store the ID
        logInfo(`Successfully created new extension tab ID: ${newTab.id}`);
      } else {
        handleError("chrome.tabs.create call did not return a valid tab object", { newTab });
      }
    }

    // Save the found/created ID to storage
    if (foundTabId) {
        try {
            await storageSet(CONTROL_TAB_ID_KEY, foundTabId);
            logInfo(`Stored control tab ID ${foundTabId} to storage.`);
            console.log(`CONFIRMED storageSet for CONTROL_TAB_ID_KEY with ID: ${foundTabId}`);
        } catch (storageError) {
             handleError(storageError, { operation: 'openOrFocusExtensionTab - saveControlTabId' });
        }
    } else {
        logWarn("Could not determine control tab ID to store.");
    }

  } catch (error) {
    handleError(error, { operation: 'openOrFocusExtensionTab' });
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
    logDebug("Get current tab ID", { tabId });
    return tabId;
  } catch (error) {
    // console.error("Error getting current tab ID:", error);
    handleError(error, { operation: 'getCurrentTabId' });
    return -1;
  }
}

/**
 * Logs the current tab ID and details of all open tabs.
 */
async function logCurrentTabState() {
  try {
    const tabId = await getCurrentTabId();
    // console.log("Current Active Tab ID (from background):", tabId);
    logInfo("Current Active Tab ID (from background)", { tabId });
    const allTabs = await chrome.tabs.query({});
    // console.log("All open tabs:", allTabs.map(tab => ({ id: tab.id, url: tab.url, active: tab.active, windowId: tab.windowId })));
    logDebug("All open tabs", { tabs: allTabs.map(tab => ({ id: tab.id, url: tab.url, active: tab.active, windowId: tab.windowId })) });
  } catch (error) {
      // console.error("Error logging current tab state:", error);
      handleError(error, { operation: 'logCurrentTabState' });
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
      // console.log(`Could not send message to tab ${tabId}: ${chrome.runtime.lastError.message}`);
      logWarn(`Could not send message to tab ${tabId}`, { error: chrome.runtime.lastError.message });
    } else {
      // console.log(`Message sent to tab ${tabId}, response:`, response); // Debugging
      logDebug(`Message sent to tab ${tabId}`, { response });
    }
  });
}


// --- Event Listeners ---

/**
 * Listener for extension installation or update events.
 * Opens the dedicated tab page on first install or update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // *** REMOVE ENTRY LOG (was likely cleared/missed anyway) ***
  // console.log(`>>> onInstalled listener triggered. Reason: ${details.reason}`); 
  // logInfo(">>> onInstalled listener triggered.", { reason: details.reason });

  // --- REMOVE TEMPORARY DEBUG FLAG --- 
  // const forceUpdate = true; 
  // --- END TEMPORARY DEBUG --- 

  try {
    logInfo("Extension installed or updated (inside try block)", { reason: details.reason });

    if (details.reason === 'install') {
      logInfo("Reason: install. Opening or focusing tab page.");
      openOrFocusExtensionTab();
    } 
    // --- REVERT DEBUG CONDITION --- 
    // else if (details.reason === 'update' || forceUpdate) { 
    else if (details.reason === 'update') { 
    // --- END REVERT DEBUG CONDITION --- 
      // logInfo(`Reason: update (or forced: ${forceUpdate}). Reloading application tabs based on stored list.`);
      logInfo("Reason: update. Reloading application tabs based on stored list."); // Revert log message
      try {
        logInfo("Attempting to read application tabs from storage...");
        const tabsToReloadGroupedRaw = await storageGet<Record<string, StoredApplicationTab[]>>(APPLICATION_TABS_KEY);
        
        // *** REMOVE EXTRA DEBUG LOGGING ***
        // console.log("[onInstalled Update] Raw data read from storage for APPLICATION_TABS_KEY:", tabsToReloadGroupedRaw);
        // logInfo("[onInstalled Update] Raw data read from storage.", { rawData: tabsToReloadGroupedRaw }); 

        if (!tabsToReloadGroupedRaw || Object.keys(tabsToReloadGroupedRaw).length === 0) {
             // console.log("[onInstalled Update] Condition met: Data is null, undefined, or empty object.");
             logInfo("No application tabs found in storage (or data is empty/null). No tabs to reload.");
        } else {
             // console.log("[onInstalled Update] Condition NOT met: Data seems valid, proceeding to flatten.");
             // Flatten the grouped tabs into a single list for reloading
             const allTabsToReload: StoredApplicationTab[] = Object.values(tabsToReloadGroupedRaw).flat();
             logInfo(`Found ${allTabsToReload.length} total application tabs across all windows in storage to reload.`);
             
             
             // *** REMOVE EXTRA DEBUG LOGGING ***
             // console.log(`[onInstalled Update] Entering loop to reload ${allTabsToReload.length} tabs...`);

             for (const tab of allTabsToReload) {
                if (tab && tab.id) { 
                  try {
                    await chrome.tabs.get(tab.id);
                    await chrome.tabs.reload(tab.id);
                    logInfo(`Reloaded application tab ID: ${tab.id}`, { title: tab.title });
                  } catch (reloadOrGetError: any) {
                    if (reloadOrGetError.message?.includes("No tab with id")) {
                        logWarn(`Application tab ID ${tab.id} no longer exists.`);
                    } else {
                        handleError(reloadOrGetError, { operation: 'reloadAppTabOnUpdate', tabId: tab.id });
                    }
                  }
                } else {
                  logWarn("Found invalid tab data in flattened list:", { tab });
                }
              }
        }

        // After reloading app tabs, ensure the main extension UI tab is open and focused.
        logInfo("Ensuring extension UI tab is open/focused after update.");
        openOrFocusExtensionTab();

      } catch (storageError) {
        // console.error("Error reading application tab list from storage:", storageError);
        handleError(storageError, { operation: 'readAppTabsOnUpdate' });
        // const errorMessage = storageError instanceof Error ? storageError.message : String(storageError);
        // log('storage_error', { operation: 'readAppTabsOnUpdate', error: errorMessage });
      }
    }

    // Perform other setup tasks if needed
    // logCurrentTabState().catch(error => console.error("Error during onInstalled logCurrentTabState:", error)); // Log initial state
    logCurrentTabState().catch(error => handleError(error, { stage: 'onInstalled' }));
  } catch (error) {
      // console.error("Error in onInstalled listener:", error);
      handleError(error, { stage: 'onInstalledListener' });
  }
});


/**
 * Listener for browser startup
 */
chrome.runtime.onStartup.addListener(() => {
  // console.log("Browser started, checking for extension tab...");
  logInfo("Browser started, checking for extension tab...");
  openOrFocusExtensionTab();
  logCurrentTabState();
});


// Log tab state changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  // if (DEBUG_TABS) console.log("Activated Tab ID:", activeInfo.tabId);
  logDebug("Activated Tab ID", { tabId: activeInfo.tabId });
  // logCurrentTabState().catch(error => console.error("Error during onActivated logCurrentTabState:", error)); // Temporarily commented out
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Log state when a tab finishes loading
    if (changeInfo.status === 'complete') {
        // if (DEBUG_TABS) console.log("Updated Tab (completed loading):", tabId);
        logDebug("Updated Tab (completed loading)", { tabId });
    }
});

chrome.tabs.onCreated.addListener((tab) => {
  // if (DEBUG_TABS) console.log("New tab created:", tab.id);
  logDebug("New tab created", { tabId: tab.id });
  // logCurrentTabState().catch(error => console.error("Error during onCreated logCurrentTabState:", error)); // Temporarily commented out
});

// Clean up tab-specific context data shortly after a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // if (DEBUG_TABS) console.log("Tab removed:", tabId);
  logDebug("Tab removed", { tabId });
  setTimeout(async () => {
    try {
      await storageRemove(`tabContext:${tabId}`);
      // if (DEBUG_TABS) console.log(`Removed context for tab ${tabId}`);
      logDebug(`Removed context for tab ${tabId}`);
      // Log state after removal attempt
      // logCurrentTabState().catch(error => console.error("Error during onRemoved logCurrentTabState:", error)); // Temporarily commented out
    } catch(error) {
        // console.error(`Error removing context for tab ${tabId}:`, error);
        handleError(error, { operation: 'removeTabContext', tabId });
        // Log error using diagnostic logger
        // const errorMessage = error instanceof Error ? error.message : String(error);
        // log('storage_error', { operation: 'removeTabContext', tabId: tabId, error: errorMessage });
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
       handleError(storageError, { operation: 'callLLMService - readApiKey' });
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
    handleError(error, { operation: 'callLLMService - apiCall' });
    return { error: `LLM Error: ${errorMessage}` } as SendToLLMResponse;
  }
}

// --- Helper Function to Send Messages to Content Scripts ---
async function sendMessageToContentScripts(tabIds: number[], message: any) { /* ... */ }

// --- Recording Logic Functions ---

async function startRecordingLogic() { // Restore async
    // 1. Check if already active
    if (isRecordingActive) {
        logWarn("Start recording called, but already active.");
        return;
    }
    // 2. Log start
    logInfo("Starting test recording session...");

    try { // Encompass everything after the initial check
        logDebug("startRecordingLogic: Entered function body (inside try)");

        isRecordingActive = true; // Set early
        logDebug("startRecordingLogic: isRecordingActive set to true");

        currentRecordingRawSteps = [];
        logDebug("startRecordingLogic: currentRecordingRawSteps initialized");

        activeRecordingTabs.clear();
        logDebug("startRecordingLogic: activeRecordingTabs cleared");

        expectedResponsesFromTabs.clear();
        logDebug("startRecordingLogic: expectedResponsesFromTabs cleared");

        if (llmProcessingTimeout) {
            logDebug("startRecordingLogic: Clearing previous timeout", { handle: llmProcessingTimeout });
            clearTimeout(llmProcessingTimeout);
            logDebug("startRecordingLogic: Timeout cleared");
        }
        logDebug("startRecordingLogic: State fully initialized");

        // Restore async operations
        const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        logDebug("startRecordingLogic: Queried active tabs", { count: currentTabs.length });

        if (currentTabs.length > 0 && currentTabs[0].id) {
            const initialTabId = currentTabs[0].id;
            logDebug(`startRecordingLogic: Initial active tab ID: ${initialTabId}`);
            activeRecordingTabs.add(initialTabId);
            expectedResponsesFromTabs.add(initialTabId);
            logDebug("startRecordingLogic: Added tab to sets");

            logDebug("startRecordingLogic: Attempting to send ACTIVATE_RECORDING message...", { initialTabId });
            await sendMessageToContentScripts([initialTabId], { type: "ACTIVATE_RECORDING", payload: { tabId: initialTabId } });
            logDebug("startRecordingLogic: ACTIVATE_RECORDING message sent (or attempted)");

        } else {
            logWarn("startRecordingLogic: Could not get initial active tab for recording.");
        }

        logDebug("startRecordingLogic: Attempting to add tab event listeners...");
        chrome.tabs.onActivated.addListener(handleTabActivated);
        chrome.tabs.onUpdated.addListener(handleTabUpdated);
        logDebug("startRecordingLogic: Tab event listeners added.");

        // Notify the Tab Page UI that recording has started (with retry)
        logDebug("startRecordingLogic: Attempting to send RECORDING_STARTED message to UI...");
        const sendRecordingStarted = () => {
            chrome.runtime.sendMessage({ type: "RECORDING_STARTED", payload: { message: "Recording started" } })
               .catch(e => {
                    const error = e as Error;
                    // Check for the specific error message
                    if (error.message?.includes("Receiving end does not exist")) {
                        logWarn("Failed to send RECORDING_STARTED to UI (Receiving end does not exist), retrying in 200ms...");
                        setTimeout(sendRecordingStarted, 200); // Retry after 200ms
                    } else {
                         logWarn("Failed to send RECORDING_STARTED to UI (Unknown error)", { error: error.message });
                         // Optionally handle other errors differently
                    }
               });
        };
        sendRecordingStarted(); // Initial attempt
        logDebug("startRecordingLogic: Initial RECORDING_STARTED message sent (or attempted).");

    } catch (error) {
        const operation = 'startRecordingLogic';
        logError(`Error during ${operation}`, { errorMessage: (error as Error)?.message, errorObj: error });
        handleError(error, { operation });
        if (isRecordingActive) {
             logWarn(`${operation}: Resetting state due to error.`);
             isRecordingActive = false;
             chrome.tabs.onActivated.removeListener(handleTabActivated);
             chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        } else {
            logWarn(`${operation}: Error occurred before recording state was fully activated.`);
        }
    }
}

async function stopRecordingLogic() {
    if (!isRecordingActive) {
        logWarn("Stop recording called, but not active.");
        return;
    }
    logInfo("Stopping test recording session...");
    isRecordingActive = false;

    chrome.tabs.onActivated.removeListener(handleTabActivated);
    chrome.tabs.onUpdated.removeListener(handleTabUpdated);

    const tabsToDeactivate = Array.from(activeRecordingTabs);
    expectedResponsesFromTabs = new Set(tabsToDeactivate);

    logInfo(`Expecting step data from tabs: [${tabsToDeactivate.join(', ')}]`);
    sendMessageToContentScripts(tabsToDeactivate, { type: "DEACTIVATE_RECORDING", payload: {} });

    if (llmProcessingTimeout) clearTimeout(llmProcessingTimeout);
    llmProcessingTimeout = setTimeout(() => {
        logWarn(`Recording stopped: Timeout waiting for steps from tabs [${Array.from(expectedResponsesFromTabs).join(', ')}]. Processing with received steps.`);
        llmProcessingTimeout = null;
        processAndSaveRecording();
    }, RECORDING_TIMEOUT_MS);

    // Notify the Tab Page UI that recording has stopped / is processing
     chrome.runtime.sendMessage({ type: "RECORDING_STOPPED", payload: { message: "Recording stopped, processing..." } })
       .catch(e => logWarn("Failed to send RECORDING_STOPPED to UI", { error: (e as Error).message }));
}

// --- Tab Event Handlers (Active only during recording) ---
const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
    if (!isRecordingActive) return;
    const tabId = activeInfo.tabId;
    logDebug(`handleTabActivated: Fired for tab ${tabId}`); // Log entry

    // Record the switch step
    const step: RawStepData = {
        timestamp: Date.now(),
        type: 'switchTab',
        tabId: tabId,
        url: '', // URL will be captured later
        value: tabId
    };
    currentRecordingRawSteps.push(step);
    logDebug(`handleTabActivated: Recorded switch step for tab ${tabId}`);

    // If this is a new tab for this recording session...
    if (!activeRecordingTabs.has(tabId)) {
        logInfo(`handleTabActivated: Tab ${tabId} is NEW for this recording session. Adding.`); // Log if new
        activeRecordingTabs.add(tabId);
        logDebug(`handleTabActivated: activeRecordingTabs now: [${Array.from(activeRecordingTabs).join(', ')}]`);
        // Activate listeners in its content script
        logDebug(`handleTabActivated: Attempting to send ACTIVATE_RECORDING to tab ${tabId}...`);
        sendMessageToContentScripts([tabId], { type: "ACTIVATE_RECORDING", payload: { tabId: tabId } })
           .then(() => logDebug(`handleTabActivated: Sent ACTIVATE_RECORDING to tab ${tabId} (or tried).`))
           .catch(e => logWarn(`handleTabActivated: Error sending ACTIVATE_RECORDING to tab ${tabId}`, { error: e }));
    } else {
        logDebug(`handleTabActivated: Tab ${tabId} was already in activeRecordingTabs.`); // Log if already present
    }
};

const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => { /* ... */ };

// --- Processing and Saving ---

function checkIfReadyToProcessRecording() {
    // ... (ensure this function exists as defined previously) ...
     if (isRecordingActive) return;
     if (expectedResponsesFromTabs.size === 0) {
         logInfo("All expected content script responses received.");
         if (llmProcessingTimeout) {
             clearTimeout(llmProcessingTimeout);
             llmProcessingTimeout = null;
         }
         processAndSaveRecording();
     } else { /* log waiting */ }
}

// Add the notification function
function notifyUIRecordingProcessed(success: boolean, taskName: string | null, error?: string) {
    logDebug("Notifying UI about recording processing result", { success, taskName, error });
    chrome.runtime.sendMessage({
        type: "RECORDING_PROCESSED",
        payload: {
            success: success,
            taskName: taskName,
            error: error
        }
    }).catch(e => logWarn("Failed to send RECORDING_PROCESSED status to UI", { error: (e as Error).message }));
}

async function processAndSaveRecording() {
    logInfo("Processing recorded steps...");
    if (currentRecordingRawSteps.length === 0) {
        logWarn("No steps were recorded. Aborting save.");
        notifyUIRecordingProcessed(false, null, "No steps recorded."); // Notify UI
        return;
    }

    const stepsForProcessing = [...currentRecordingRawSteps]; // Use a copy
    const originalTaskCounter = taskCounter; // Store counter before async calls
    const taskName = `Task ${originalTaskCounter}`;

    // Clear state for next recording BEFORE async LLM call
    currentRecordingRawSteps = [];
    activeRecordingTabs.clear();
    expectedResponsesFromTabs.clear(); // Ensure this is cleared

    try {
        // 1. Sort by timestamp
        stepsForProcessing.sort((a, b) => a.timestamp - b.timestamp);

        // 2. Construct LLM Prompt
        const formattedSteps = stepsForProcessing.map(step => JSON.stringify(step)).join('\n');
        const prompt = `Generate a Yeshie script in JSON format, strictly conforming to the provided llm-reply-schema.json.
The script should represent the following sequence of user actions recorded across browser tabs.
The script should be named "${taskName}".
Use the provided selectors, values, URLs, and tab IDs appropriately within the schema's structure (tasks, steps, cmd, sel, text, etc.).
Map recorded action types ('click', 'type', 'change', 'navigate', 'switchTab') to appropriate 'cmd' values in the schema (e.g., 'click', 'type', 'navto'). Handle tab switches by potentially starting new tasks for different tabs if logical, or using focus actions.

Recorded Actions (RawStepData format):
${formattedSteps}

Generate only the valid JSON output conforming to the schema.`;

        logInfo(`Sending ${stepsForProcessing.length} steps to LLM for ${taskName}...`);
        const response = await callLLMService(prompt);

        // 3. Handle LLM Response
        if (response.result) {
            // Clean the LLM response string
            let cleanedResult = response.result.trim();
            logDebug("Raw LLM Result:", { cleanedResult });
            if (cleanedResult.startsWith("```json")) {
                cleanedResult = cleanedResult.substring(7); // Remove ```json
            }
            if (cleanedResult.startsWith("```")) { // Handle cases with just ```
                 cleanedResult = cleanedResult.substring(3);
            }
            if (cleanedResult.endsWith("```")) {
                cleanedResult = cleanedResult.substring(0, cleanedResult.length - 3);
            }
            cleanedResult = cleanedResult.trim(); // Trim again after removing fences
            logDebug("Cleaned LLM Result:", { cleanedResult });

            // Basic validation: Can it be parsed?
            const parsedResult = JSON.parse(cleanedResult); // Use cleaned result
            logInfo(`LLM generated script for ${taskName}. Saving...`);

            const storageKey = `${LEARNED_TASK_PREFIX}${taskName.replace(/\s+/g, '_')}`;
            await storageSet(storageKey, {
                name: taskName,
                createdAt: new Date().toISOString(),
                script: parsedResult
            });
            logInfo(`Successfully saved ${taskName} to storage with key ${storageKey}`);

            // Increment and save task counter only on successful save
            taskCounter = originalTaskCounter + 1;
            await storageSet(TASK_COUNTER_KEY, taskCounter);
            logInfo(`Incremented task counter to ${taskCounter}`);

            notifyUIRecordingProcessed(true, taskName); // Notify success

        } else {
            throw new Error(response.error || "LLM did not return a result.");
        }
    } catch (error) {
        handleError(error, { operation: 'processAndSaveRecording', taskName: taskName });
        logError(`Failed to process or save recording for ${taskName}.`);
        notifyUIRecordingProcessed(false, taskName, (error as Error).message); // Notify failure
    }
}


// --- Message Listener --- (Ensure this replaces the old listener entirely)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logDebug("Background: Message received", { message, sender: { id: sender.id, url: sender.url, origin: sender.origin, tabId: sender.tab?.id } });
    let isAsync = false; // Flag to indicate if sendResponse will be called asynchronously

    try {
        // --- Recording Control Messages ---
        if (message.type === 'START_RECORDING_FROM_UI') {
            startRecordingLogic();
            sendResponse({ success: true, message: "Recording started command received" });
        }
        else if (message.type === 'STOP_RECORDING_FROM_UI') {
            stopRecordingLogic();
            sendResponse({ success: true, message: "Recording stopped command received" });
        }
        else if (message.type === 'TOGGLE_RECORDING_FROM_SHORTCUT') {
            if (isRecordingActive) {
                stopRecordingLogic();
                sendResponse({ success: true, message: "Recording stopped via shortcut command received" });
            } else {
                startRecordingLogic();
                sendResponse({ success: true, message: "Recording started via shortcut command received" });
            }
        }
        // --- Step Collection Message ---
        else if (message.type === 'FORWARD_RECORDED_STEPS') {
            if (!sender.tab || !sender.tab.id) {
                logWarn("Received FORWARD_RECORDED_STEPS without sender tab ID.", { sender });
                sendResponse({ success: false, error: "Missing sender tab ID" });
            } else {
                const tabId = sender.tab.id;
                const steps = message.payload?.steps as RawStepData[];
                if (!Array.isArray(steps)) {
                    logWarn(`Received invalid steps data from tab ${tabId}`, { payload: message.payload });
                    sendResponse({ success: false, error: "Invalid steps data" });
                } else {
                    logInfo(`Received ${steps.length} steps from content script in tab ${tabId}`);
                    currentRecordingRawSteps.push(...steps);
                    if (expectedResponsesFromTabs.has(tabId)) {
                        expectedResponsesFromTabs.delete(tabId);
                        logDebug(`Tab ${tabId} has responded. Remaining expected: [${Array.from(expectedResponsesFromTabs).join(', ')}]`);
                        checkIfReadyToProcessRecording();
                    } else {
                        logWarn(`Received steps from unexpected tab ${tabId} or tab already responded.`);
                    }
                    sendResponse({ success: true });
                }
            }
        }

        // --- Existing Handlers ---
        else if (message.name === 'setApiKeyInMemory') {
            if (message.body && typeof message.body.apiKey === 'string') {
                backgroundApiKey = message.body.apiKey;
                logInfo("** Background script received and stored API key in memory. **");
                sendResponse({ success: true });
            } else {
                logError("Invalid payload received for setApiKeyInMemory");
                sendResponse({ success: false, error: "Invalid API key payload" });
            }
        }
        else if (message.name === 'sendToLLM') {
            const payload = message.body as SendToLLMPayload;
            if (!payload || typeof payload.prompt !== 'string') {
                logError("Invalid payload received for sendToLLM");
                sendResponse({ error: "Invalid prompt payload" } as SendToLLMResponse);
                return false; // Send response sync
            }
            isAsync = true; // Mark as async
            callLLMService(payload.prompt)
                .then(response => {
                    logInfo("Sending response for sendToLLM");
                    sendResponse(response);
                })
                .catch(error => {
                    handleError(error, { operation: 'callLLMService - promiseCatch' });
                    sendResponse({ error: "Unexpected background error during LLM call." } as SendToLLMResponse);
                });
        }
        else if (message.name === "getTabId") {
             if (sender.tab?.id) {
                 logDebug("Responding to getTabId request", { tabId: sender.tab.id });
                 sendResponse({ tabId: sender.tab.id });
             } else {
                 isAsync = true; // Mark as async
                 getCurrentTabId().then(tabId => {
                     logDebug("Responding to getTabId request (fallback)", { tabId });
                     sendResponse({ tabId });
                 }).catch(error => {
                     handleError(error, { messageName: 'getTabId - fallback' });
                     sendResponse({ tabId: -1 });
                 });
             }
         }
        // ... Add other existing handlers for captureScreenshot, ADD_REPORT, saveDiagnosticLog, getDiagnosticLogs here ...
        // Example:
        // else if (message.action === "captureScreenshotToClipboard") { isAsync = true; /* ... logic ... */ }
        // else if (message.type === 'ADD_REPORT') { isAsync = true; /* ... logic ... */ }
        // else if (message.action === "saveDiagnosticLog") { isAsync = true; /* ... logic ... */ }
        // else if (message.action === "getDiagnosticLogs") { isAsync = true; /* ... logic ... */ }

        // --- Unhandled --- // Moved Plasmo check before the warning
        else {
            const isPotentiallyPlasmoHandled = ['getLastTab', 'focusLastTab', 'focusTab'].includes(message?.name);
            if (!isPotentiallyPlasmoHandled && message.type !== 'ACTIVATE_RECORDING' && message.type !== 'DEACTIVATE_RECORDING') {
                logWarn("Unhandled message type received in background listener:", { message });
            }
            // If it's not one of ours and not Plasmo's, we don't send a response
        }

        if (message.type === 'WRITE_RESULTS_JSON') {
            // Try to write to extension/ipc/results.json
            try {
                // File System Access API is not available in service workers, so fallback to chrome.storage.local
                chrome.storage.local.set({ 'ipc_results': message.log }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('Could not write results.json:', chrome.runtime.lastError);
                        sendResponse({ success: false });
                    } else {
                        sendResponse({ success: true });
                    }
                });
            } catch (e) {
                console.warn('Could not write results.json:', e);
                sendResponse({ success: false });
            }
            return true;
        }

    } catch (error) {
        handleError(error, { stage: 'topLevelOnMessageListener', messageReceived: message });
        // Try to send an error response if possible and not already handled asynchronously
        if (!isAsync && typeof sendResponse === 'function') {
            try {
                sendResponse({ success: false, status: "error", message: "Internal background error processing message." });
            } catch (e) {
                handleError(e, { stage: 'sendErrorResponseCatch' });
            }
        } else if (isAsync) {
           logError("Error occurred during async message processing", { error });
        }
    }

    // Return true if sendResponse will be called asynchronously, false otherwise.
    return isAsync;
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
logStorageUsage(); // Call the re-added/verified wrapper function
logCurrentTabState().catch(error => handleError(error, { stage: 'initialLogCurrentTabState' }));

// Periodic state logging (consider reducing frequency or removing if too noisy)
// setInterval(logCurrentTabState, 60000); // Temporarily commented out // e.g., every minute

// Initialize tab tracking when the background script starts
initTabTracking()
  .then(() => console.log("Tab tracking initialized"))
  .catch(error => handleError(error, { operation: 'initTabTracking' }));

console.log("Background script fully initialized and message listener updated.");

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
         handleError(chrome.runtime.lastError, { operation: 'showLLMTestNotification' });
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

// --- Log storage usage using the new utility ---
// Re-add this wrapper function if it was removed, or adjust initialization call
async function logStorageUsage() {
    try {
        await logStorageUsageUtil(); // Call the centralized function
        // Keep sync storage check for now
        const syncItems = await chrome.storage.sync.get(null) as {[key: string]: any} | void;
        let syncCount = 0;
        if (syncItems && typeof syncItems === 'object') {
          syncCount = Object.keys(syncItems).length;
        }
        logInfo(`chrome.storage.sync item count: ${syncCount}`);
        if (syncCount >= 510) {
            logWarn("chrome.storage.sync is near or at its MAX_ITEMS limit!", { area: 'sync', count: syncCount });
        }
    } catch (error) {
        handleError(error, { operation: 'logStorageUsage' });
    }
}

async function runInstructionFileSequence() {
  try {
    const url = chrome.runtime.getURL('ipc/instructions.json');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load instructions.json');
    const instructions = await response.json();
    if (!instructions.tasks) throw new Error('No tasks in instructions.json');

    // Find the control tab (tabs/index.html)
    const controlTabUrl = chrome.runtime.getURL('tabs/index.html');
    const tabs = await chrome.tabs.query({ url: controlTabUrl });
    if (!tabs.length) throw new Error('Control tab not found');
    const controlTabId = tabs[0].id;
    if (!controlTabId) throw new Error('Control tab has no id');

    for (const task of instructions.tasks) {
      for (const step of task.steps) {
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(controlTabId, { type: 'RUN_STEPPER_STEP', step }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      }
    }
  } catch (e) {
    console.error('Error running instruction file sequence:', e);
  }
}

// Run on extension startup
// runInstructionFileSequence(); // Commenting this out

// ... rest of initialization ... 