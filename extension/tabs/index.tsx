import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom/client";
import YeshieEditor from "../components/YeshieEditor";
import TabList from "./TabList";
import { sendToBackground } from "@plasmohq/messaging";
import ReportsPanel from "../components/ReportsPanel";
import ReportDialog from "../components/ReportDialog";
import { getBuildInfo } from '../background/buildCounter';
import { storageGet, storageSet, storageGetAll } from "../functions/storage";
import { logInfo, logWarn, logError, logDebug, clearSessionLogs } from "../functions/logger";
import { handleError } from "../functions/errorHandler";
import { LAST_TAB_KEY } from "../background/tabHistory"; // Import the key
import "./style.css"; // Assuming you might want some basic styling
import LogViewer from "../components/LogViewer"; // Import the LogViewer component

// --- Type Definitions ---

// Map of URL strings to custom names
interface CustomNameMap {
    [url: string]: string;
}

// Information about a browser tab
interface TabInfo {
  id: number;
  url: string;
  title: string;
  timestamp: number;
}

// Information about the extension build
interface BuildInfo {
  manifestVersion: string;
  buildCounter: number;
  buildId: string;
  isDev: boolean;
}

// Structure for user reports (bugs or features)
interface Report {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed';
  buildInfo?: {
    manifestVersion: string;
    buildCounter: number;
    buildId: string;
  };
}

// Payload for creating a new report
export interface NewReportPayload {
  type: 'bug' | 'feature';
  title: string;
  description: string;
}

// Response structure for getLastTab background message
export interface GetLastTabResponse {
  success: boolean;
  lastTab?: TabInfo;
  error?: string;
}

// Response structure for focusLastTab background message
export interface FocusTabResponse {
  success: boolean;
  error?: string;
}

// Payload for sendToLLM background message
export interface SendToLLMPayload {
  prompt: string;
}

// Response structure for sendToLLM background message
export interface SendToLLMResponse {
  result?: string;
  error?: string;
}

// --- Constants ---
const PAGE_TITLE = "Yeshie Control";
const DEBUG_TABS = process.env.NODE_ENV === 'development'; // Use NODE_ENV for debug flag
const LAST_LOADED_TIME_KEY = "yeshie_tab_page_last_loaded";
const API_KEY_STORAGE_KEY = 'openai-api-key'; // Add key constant
const RELOAD_COUNT_KEY = "yeshie_tab_reload_count"; // Key for reload counter

// Define STORAGE_KEY locally as it's not exported from TabList
const STORAGE_KEY = 'yeshieTabCustomNames';

function TabsIndex() {
  const [buildInfo] = useState<BuildInfo>(getBuildInfo());
  const [lastTabInfo, setLastTabInfo] = useState<TabInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tabInfoReady, setTabInfoReady] = useState(false);
  const [lastLoadedTime, setLastLoadedTime] = useState<string | null>(null);
  const [showReportsPanel, setShowReportsPanel] = useState(false);
  const [reportCount, setReportCount] = useState(0);
  const [tabPaneFocusedTime, setTabPaneFocusedTime] = useState<number | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState<number>(0);
  const [customNames, setCustomNames] = useState<CustomNameMap>({});
  const [lastErrorDetails, setLastErrorDetails] = useState<string | null>(null);
  const [showLogViewer, setShowLogViewer] = useState<boolean>(false); // State for LogViewer visibility
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState<boolean>(false);

  // --- State for API Key Management ---
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Ref to prevent setting state on unmounted component
  const isMounted = useRef(true); // Ensure this is defined

  // Set isMounted to false when component unmounts
  useEffect(() => {
    isMounted.current = true;
    return () => {
        isMounted.current = false;
    };
  }, []);

  // --- Effect to set Document Title --- 
  useEffect(() => {
    document.title = PAGE_TITLE; 
  }, []); // Run only once on mount

  // --- Effect to clear session logs on mount ---
  useEffect(() => {
    logInfo("TabsIndex mounted, clearing previous session logs from storage.");
    clearSessionLogs();
  }, []);

  // Save current page load time and retrieve last loaded time
  useEffect(() => {
    const loadAndUpdateTime = async () => {
      try {
        // Get previous last loaded time
        const previousTime = await storageGet<string>(LAST_LOADED_TIME_KEY);
        logInfo('Storage get', { key: LAST_LOADED_TIME_KEY, found: !!previousTime });
        if (previousTime) {
          setLastLoadedTime(previousTime);
        }

        // Set new last loaded time
        const currentTime = new Date().toLocaleString();
        await storageSet(LAST_LOADED_TIME_KEY, currentTime);
        logInfo('Storage set', { key: LAST_LOADED_TIME_KEY });
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'loadAndUpdateTime' });
        setLastErrorDetails(errorDetails);
        setToast("Error managing load time. Click to copy details.");
      }
    };

    loadAndUpdateTime();
  }, []);

  // --- Memoized function to fetch the last active tab ---
  const fetchLastTab = useCallback(async (): Promise<TabInfo | null> => {
    try {
      logDebug("TabsIndex: Fetching last tab info...");
      const response: GetLastTabResponse = await sendToBackground({ name: "getLastTab" });
      logDebug("TabsIndex: Received response from background for getLastTab", { response });
      
      if (response && response.success && response.lastTab) {
        logDebug("TabsIndex: Got valid last tab info", { tab: response.lastTab });
        setLastTabInfo(response.lastTab);
        setErrorMessage("");
        setTabInfoReady(true);
        return response.lastTab;
      } else {
        logWarn("TabsIndex: No valid last tab info returned", { error: response?.error });
        setLastTabInfo(null);
        setErrorMessage(response?.error || "No previous tab information available");
        setTabInfoReady(true);
        return null;
      }
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'fetchLastTab' });
      setLastErrorDetails(errorDetails);
      setLastTabInfo(null);
      setErrorMessage("Failed to retrieve last tab information");
      setToast("Error fetching tab info. Click to copy details.");
      setTabInfoReady(true);
      return null;
    }
  }, []);

  // Effect: Immediately fetch tab info when component mounts
  useEffect(() => {
    logInfo("Tab page loaded, fetching last tab info");
    fetchLastTab();
    
    return () => {
    };
  }, [fetchLastTab]);

  // Load reports when component mounts and when tabInfoReady changes
  useEffect(() => {
    const loadReports = async () => {
      try {
        // Get reports from storage - Assuming reports are stored under a single key 'reports'
        const reports = await storageGet<Report[]>('reports') || [];
        logInfo('Loaded reports from storage', { count: reports.length });
        setReportCount(reports?.length || 0);
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'loadReports' });
        setLastErrorDetails(errorDetails);
        setToast("Error loading reports. Click to copy details.");
      }
    };

    if (tabInfoReady) {
      loadReports();
    }
  }, [tabInfoReady]);

  // Add listener for storage changes
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return;

      if (changes.reports) {
        const reports = changes.reports.newValue as Report[] | undefined;
        const reportLength = reports?.length || 0;
        logInfo('Reports updated via storage listener', { newCount: reportLength });
        setReportCount(reportLength);
      }
      if (changes[API_KEY_STORAGE_KEY]) {
          setHasApiKey(!!changes[API_KEY_STORAGE_KEY].newValue);
          logInfo('API Key updated via storage listener');
      }
      if (changes[STORAGE_KEY]) { // STORAGE_KEY for custom names
          const loadedNames = (changes[STORAGE_KEY].newValue as CustomNameMap) || {};
          setCustomNames(loadedNames);
          logInfo('Custom names updated via storage listener');
      }
      // Check if the LAST_TAB_KEY changed
      if (changes[LAST_TAB_KEY]) {
          logInfo('Detected LAST_TAB_KEY change, fetching updated tab info...');
          fetchLastTab(); // Call the memoized function
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [setCustomNames, fetchLastTab]);

  // Add listener for window focus
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      logDebug("Tab Pane focused", { timestamp: now });
      setTabPaneFocusedTime(now);
      // Optionally store this focus time
      // storage.set('tabPaneLastFocusTime', now);
    };

    window.addEventListener('focus', handleFocus);
    // Set initial focus time on mount
    handleFocus(); 

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // --- Effect to increment and display reload count ---
  useEffect(() => {
    const incrementReloadCount = async () => {
      let numericCount = 0; // Initialize as number
      const RESET_THRESHOLD = 10000; // Define a threshold for resetting
      try {
        const storedValue = await storageGet<number | string>(RELOAD_COUNT_KEY);
        logInfo('Storage get', { key: RELOAD_COUNT_KEY, found: storedValue !== undefined, value: storedValue });

        if (typeof storedValue === 'number' && !isNaN(storedValue)) {
          numericCount = storedValue;
        } else if (typeof storedValue === 'string') {
          const parsed = parseInt(storedValue, 10);
          if (!isNaN(parsed)) {
            numericCount = parsed;
          } else {
             logWarn('Stored reload count was non-numeric string, resetting', { value: storedValue });
             numericCount = 0;
          }
        } else {
             logInfo('No valid stored reload count found, starting from 0');
             numericCount = 0;
        }

        // Reset if the count is unreasonably high
        if (numericCount > RESET_THRESHOLD) {
            logWarn(`Reload count ${numericCount} exceeded threshold ${RESET_THRESHOLD}, resetting.`, { value: numericCount });
            numericCount = 0;
        }

        const newCount = numericCount + 1; // Perform numerical addition
        await storageSet(RELOAD_COUNT_KEY, newCount);
        logInfo('Storage set', { key: RELOAD_COUNT_KEY, value: newCount });
        setReloadCount(newCount);
        logInfo(`Yeshie Tab Page Reload Count: ${newCount}`);
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'incrementReloadCount' });
        setLastErrorDetails(errorDetails);
        setToast("Error managing reload count. Click to copy details.");
        setReloadCount(0); // Reset on error
      }
    };

    incrementReloadCount();
  }, []); // Run only once on component mount

  // --- Effect to check for API Key on load ---
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const key = await storageGet<string>(API_KEY_STORAGE_KEY);
        logInfo('Storage get', { key: API_KEY_STORAGE_KEY, found: !!key });
        setHasApiKey(!!key);
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'checkApiKey' });
        setLastErrorDetails(errorDetails);
        setToast("Error checking API key. Click to copy details.");
        setHasApiKey(false);
      }
    };
    checkApiKey();
  }, []);

  // --- Add Listener for Background Recording Status Updates ---
  useEffect(() => {
      logDebug("TabsIndex: Setting up message listener EFFECT START"); // Added log

      const handleMessage = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
          logDebug("TabsIndex: handleMessage RECEIVED:", { message, senderId: sender?.id }); // Log ALL messages, check sender?.id

          if (!isMounted.current) { // Check the ref value
              logWarn("TabsIndex: handleMessage received but component not mounted.");
              return false;
          }

          // Keep existing handlers
          if (message.type === "RECORDING_STARTED") {
              logInfo("TabsIndex: Received RECORDING_STARTED update from background.");
              setIsRecording(true);
              setIsProcessingRecording(false);
              setToast(message.payload?.message || "Recording started.");
              setTimeout(() => setToast(null), 2000);
              sendResponse({success: true});
              return false; // Indicate sync response handled
          }
          else if (message.type === "RECORDING_STOPPED") {
              logInfo("TabsIndex: Received RECORDING_STOPPED update from background.");
              setIsRecording(false);
              setIsProcessingRecording(true);
              setToast(message.payload?.message || "Recording stopped, processing...");
              sendResponse({success: true});
              return false; // Indicate sync response handled
          }
          else if (message.type === "RECORDING_PROCESSED") {
               logInfo("TabsIndex: Received RECORDING_PROCESSED update from background.");
               setIsProcessingRecording(false);
               if (message.payload?.success) {
                   setToast(`Task "${message.payload.taskName}" saved successfully!`);
                   // TODO: Refresh task list here
               } else {
                    const errorDetails = handleError(message.payload?.error || "Unknown processing error", { operation: 'recordingProcessedError' });
                    setLastErrorDetails(errorDetails);
                    setToast(`Error saving task: ${message.payload?.error || 'Unknown error'}. Click to copy details.`);
               }
               setTimeout(() => {
                 setToast(null);
                 if (!message.payload?.success) setLastErrorDetails(null);
               }, 5000);
               sendResponse({success: true});
               return false; // Indicate sync response handled
          }

          // Log if message wasn't handled by this listener, but don't return true unless needed for async
          logDebug("TabsIndex: Message not handled by recording status listener", { type: message?.type });
          // Explicitly return false if this listener doesn't handle the message or need to keep channel open
          return false;
      };

      chrome.runtime.onMessage.addListener(handleMessage);
      logDebug("TabsIndex: Added listener for recording status updates.");

      return () => {
          logDebug("TabsIndex: Removing listener for recording status updates (CLEANUP)");
          chrome.runtime.onMessage.removeListener(handleMessage);
      };
  }, []); // Ensure correct closing bracket and dependency array

  // Return to the last active tab
  const returnToLastTab = async () => {
    if (!lastTabInfo) {
      logWarn("Can't return to tab: No tab info available");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    
    try {
      logDebug(`Attempting to focus tab ID: ${lastTabInfo.id}`);
      
      const response: FocusTabResponse = await sendToBackground({
        name: "focusLastTab",
        body: { force: true } // Always force focus for manual clicks
      });
      
      logDebug("Focus response", { response });
      
      if (!response || !response.success) {
        setErrorMessage(response?.error || "Failed to return to previous tab");
        logWarn("Failed to return to previous tab via background", { error: response?.error });
        
        // Direct approach as fallback
        try {
          logDebug("Trying direct tab focus as fallback", { tabId: lastTabInfo.id });
          await chrome.tabs.update(lastTabInfo.id, { active: true });
          logDebug("Direct tab focus successful");
        } catch (directError) {
          const errorDetails = handleError(directError, { operation: 'returnToLastTab - directFocusFallback' });
          setLastErrorDetails(errorDetails);
          setErrorMessage(`${response?.error || "Failed to return to tab"} (Direct focus failed too)`);
          setToast("Direct tab focus failed. Click to copy details.");
        }
      }
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'returnToLastTab' });
      setLastErrorDetails(errorDetails);
      setErrorMessage("Error returning to previous tab");
      setToast("Error returning to last tab. Click to copy details.");
    } finally {
      setLoading(false);
    }
  };

  // Format timestamp to readable date/time
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Get domain from URL
  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return url;
    }
  };

  // Add handleReportSubmit logic (can be simplified)
  const handleReportSubmit = async (reportData: NewReportPayload) => {
    logInfo("TabsIndex: Handling report submission", { reportData });
    try {
      // Directly send message to background
      await chrome.runtime.sendMessage({
        type: 'ADD_REPORT',
        report: {
          ...reportData,
          // Add any extra context if needed from the tabs page
        }
      });
      // Provide feedback (optional toast)
      setToast('Report submitted successfully from Tabs page!');
      setTimeout(() => setToast(null), 2000);
      setShowReportDialog(false); // Close dialog on submit
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleReportSubmit' });
      setLastErrorDetails(errorDetails);
      setToast('Error submitting report. Click to copy details.');
      setTimeout(() => {
         setToast(null);
         setLastErrorDetails(null); // Clear details when toast fades
      }, 3000);
      // Consider leaving dialog open on error?
    }
  };

  // --- Functions for API Key Management ---
  const handleOpenApiKeyModal = () => {
    setApiKeyInput(""); 
    setIsApiKeyModalOpen(true);
  };

  const handleCloseApiKeyModal = () => {
    setIsApiKeyModalOpen(false);
    setApiKeyInput(""); 
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setToast("API Key cannot be empty.");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setApiKeyLoading(true);
    setToast(null);
    try {
      await storageSet(API_KEY_STORAGE_KEY, apiKeyInput.trim());
      logInfo('Storage set', { key: API_KEY_STORAGE_KEY });
      setHasApiKey(true);
      setToast("OpenAI API Key saved successfully!");
      handleCloseApiKeyModal();
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleSaveApiKey' });
      setLastErrorDetails(errorDetails);
      setToast("Failed to save API Key. Click to copy details.");
    } finally {
      setApiKeyLoading(false);
      setTimeout(() => {
         setToast(null);
         setLastErrorDetails(null); // Clear details when toast fades
      }, 3000);
    }
  };

  // --- Handler for YeshieEditor submit (Sends to LLM) ---
  const handleEditorSubmit = async (text: string) => {
    logInfo("TabsIndex: YeshieEditor submitting text to LLM", { textLength: text.length });
    setToast("Sending to LLM... 🧠"); 

    try {
      // Use storageGet directly, remove incorrect 'storage.' prefix
      const apiKey = await storageGet<string>(API_KEY_STORAGE_KEY);
      logInfo('Storage get', { key: API_KEY_STORAGE_KEY, purpose: 'llm_call', found: !!apiKey });
      if (!apiKey) {
        const errorDetails = handleError("Cannot send to LLM: OpenAI API Key is not set", { operation: 'handleEditorSubmit' });
        setLastErrorDetails(errorDetails);
        setToast("Error: OpenAI API Key not set. Click to copy details.");
        setTimeout(() => {
           setToast(null);
           setLastErrorDetails(null);
        }, 3000);
        return;
      }

      // Use the new payload and response types
      const payload: SendToLLMPayload = { prompt: text };
      const response: SendToLLMResponse = await sendToBackground({
        name: 'sendToLLM' as any, // Keep type assertion for name if needed by plasmo
        body: payload
      });

      logInfo("TabsIndex: Raw response from sendToLLM background handler", { response });

      if (response && response.result) {
        setToast(`LLM Response: ${response.result.substring(0, 100)}${response.result.length > 100 ? '...' : ''}`);
      } else if (response && response.error) {
        setToast(`Error: ${response.error}`);
        const errorDetails = handleError(response.error, { operation: 'handleEditorSubmit - LLM Error Response', backgroundResponse: response });
        setLastErrorDetails(errorDetails);
        setToast(`Error: ${response.error}. Click to copy details.`);
      } else {
        const errorDetails = handleError("LLM call failed: Received an unexpected response from the background script", { operation: 'handleEditorSubmit - Unexpected Response', response });
        setLastErrorDetails(errorDetails);
        setToast("Error: Unexpected LLM response. Click to copy details.");
      }

    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleEditorSubmit - sendToBackground catch' });
      setLastErrorDetails(errorDetails);
      const displayMessage = error instanceof Error ? error.message : "Failed to communicate with background script.";
      setToast(`Error: ${displayMessage}. Click to copy details.`);
    }

    // Clear toast and error details after a delay
    setTimeout(() => {
      setToast(null);
      setLastErrorDetails(null);
    }, 10000); 
  };

  // --- Simple synchronous handler for testing ---
  const simpleTestSubmit = (text: string) => {
    logInfo("--- Simple Test Submit Called ---", { textLength: text.length });
    setToast(`Simple Test Submit: ${text.substring(0, 50)}...`);
    setTimeout(() => setToast(null), 3000);
  };

  // --- Memoized function to show toast ---
  const showToast = useCallback((message: string, duration: number = 3000) => {
      setToast(message);
      // Automatically clear non-error toasts
      // Error toasts are cleared via specific logic in handleError integration
      if (!lastErrorDetails) { 
          setTimeout(() => {
              setToast(null);
          }, duration);
      }
  }, [lastErrorDetails]); // Dependency: Recreate only if lastErrorDetails changes (relevant for clearing logic)

  // --- Function to copy error details ---
  const copyErrorDetailsToClipboard = () => {
    if (lastErrorDetails) {
      navigator.clipboard.writeText(lastErrorDetails)
        .then(() => {
          setToast("Error details copied to clipboard!");
          setTimeout(() => {
             setToast(null);
             setLastErrorDetails(null); // Ensure it clears
          }, 2000); // Short confirmation
        })
        .catch(err => {
          const errorDetails = handleError(err, { operation: 'copyErrorDetailsToClipboard' });
          setLastErrorDetails(errorDetails);
          setToast("Failed to copy details. Click to copy again?"); // Allow retry?
        });
    } else {
      logWarn("Attempted to copy error details when none were available.");
    }
  };

  // --- Function to handle Recording Button Click ---
  const handleRecordButtonClick = () => {
    if (isProcessingRecording) {
        setToast("Please wait, previous recording is processing...");
        setTimeout(() => setToast(null), 2000);
        return;
    }

    const messageType = isRecording ? "STOP_RECORDING_FROM_UI" : "START_RECORDING_FROM_UI";
    logInfo(`Sending ${messageType} to background script.`);
    // Optimistically update UI? Maybe wait for background confirmation.
    // setIsRecording(!isRecording); // Example optimistic update

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (chrome.runtime.lastError) {
            const errorDetails = handleError(chrome.runtime.lastError, { operation: 'handleRecordButtonClick', messageType });
            setLastErrorDetails(errorDetails);
            setToast(`Error ${isRecording ? 'stopping' : 'starting'} recording. Click to copy details.`);
            // Revert optimistic update if needed: setIsRecording(isRecording);
        } else if (response && response.success) {
            logInfo(`Background acknowledged ${messageType}: ${response.message}`);
            // Update state based on actual background action (handled by listener now)
            // setIsRecording(!isRecording); // Let listener handle state changes
        } else {
             const errorDetails = handleError(response?.error || "Unknown error from background", { operation: 'handleRecordButtonClick', messageType, response });
             setLastErrorDetails(errorDetails);
             setToast(`Failed to ${isRecording ? 'stop' : 'start'} recording: ${response?.error || 'Unknown error'}. Click to copy details.`);
             // Revert optimistic update if needed: setIsRecording(isRecording);
        }
         // Clear error toast after delay
         if (lastErrorDetails || (response && !response.success)) {
              setTimeout(() => {
                  setToast(null);
                  setLastErrorDetails(null);
              }, 5000);
         }
    });
  };

  return (
    <div className="tabs-container">
      {toast && (
          <div 
              className={`toast-notification ${lastErrorDetails ? 'error-toast' : ''}`}
              onClick={lastErrorDetails ? copyErrorDetailsToClipboard : undefined}
              style={lastErrorDetails ? { cursor: 'pointer' } : {}}
              title={lastErrorDetails ? "Click to copy detailed error information" : ""}
          >
              {toast}
          </div>
      )}

      {/* Grid Header */}
      <div
        className="tabs-header"
        style={{
            display: 'grid',
            // Adjust columns to make space - should be 5 auto columns
            gridTemplateColumns: 'auto auto auto auto auto', // Updated to 5 columns
            gap: '15px', // Slightly reduced gap
            alignItems: 'center', // Align items vertically center
            padding: '5px 20px 10px 20px',
            justifyContent: 'start'
        }}
      >
        {/* --- Grid Area 1: Title, Reload, Focused --- */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
             <h1 style={{ marginTop: '0', marginBottom: '0' }}>{PAGE_TITLE}</h1>
             <span style={{ fontSize: '0.8em', color: '#888', marginTop: '2px' }}>
                 Reload #{reloadCount}
             </span>
             {tabPaneFocusedTime && (
                 <span style={{ fontSize: '0.8em', color: '#888', marginTop: '2px' }} title={new Date(tabPaneFocusedTime).toISOString()}>
                     Focused: {formatTimestamp(tabPaneFocusedTime)}
                 </span>
             )}
         </div>


        {/* --- Grid Area 2: Last Tab Info --- */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'start' }}>
             {lastTabInfo ? (
               <>
                 {/* Link with limited width */}
                 <span
                   onClick={returnToLastTab}
                   className="last-tab-link"
                   title={`${lastTabInfo.title}\n${lastTabInfo.url}`}
                   style={{
                      cursor: 'pointer',
                      display: 'inline-block',
                      maxWidth: '250px', // Limit width
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: '500' // Slightly bolder
                   }}
                 >
                   {lastTabInfo.title}
                 </span>
                 {/* Updated Timestamp Below Link */}
                 <span
                    className="timestamp"
                    title={new Date(lastTabInfo.timestamp).toISOString()}
                    style={{ fontSize: '0.8em', color: '#888', marginTop: '2px' }}
                  >
                   Updated: {formatTimestamp(lastTabInfo.timestamp)}
                 </span>
               </>
             ) : (
               <span style={{ fontSize: '0.9em', color: '#aaa' }}>{errorMessage || "No recent tabs"}</span>
             )}
         </div>

        {/* --- Grid Area 3: API Key & Actions (Combined) --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* API Key Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <span>OpenAI API Key: {hasApiKey ? 'Set ✅' : 'Not Set ❌'}</span>
                 <button onClick={handleOpenApiKeyModal} className="settings-button" title={hasApiKey ? "Replace API Key" : "Set API Key"}>
                     🔑
                 </button>
             </div>
             {/* Divider */}
             <div style={{ borderLeft: '1px solid #ccc', height: '20px' }}></div>
             {/* Action Buttons Section */}
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="icon-button report-icon-button"
                  onClick={() => setShowReportDialog(true)}
                  title="Report Bug or Feature"
                  style={{ padding: '5px' }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                </button>
                <button
                  className="reports-button"
                  onClick={() => setShowReportsPanel(true)}
                  style={{ padding: '5px 10px' }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginRight: '4px' }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                 Reports
                 {reportCount > 0 && (
                   <span className="report-count" style={{ marginLeft: '4px' }}>{reportCount}</span>
                 )}
               </button>
             </div>
         </div>


        {/* --- Grid Area 4: Log Viewer Button (Ensuring this is present) --- */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="icon-button log-viewer-button" // Use a similar style or create a new one
              onClick={() => setShowLogViewer(true)}
              title="View Session Logs"
              style={{ padding: '5px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M0 2.5A1.5 1.5 0 0 1 1.5 1h11A1.5 1.5 0 0 1 14 2.5v10.528c0 .3-.05.654-.238.972h.738a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 1 1 0v9a1.5 1.5 0 0 1-1.5 1.5H1.497A1.5 1.5 0 0 1 0 13.5zM1.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5z"/>
                <path d="M2 5.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1h-8a.5.5 0 0 1-.5-.5m0 3a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1h-8a.5.5 0 0 1-.5-.5m0 3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5"/>
              </svg>
            </button>
        </div>

        {/* --- Grid Area 5: Recording Control (Ensuring this is present) --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
                onClick={handleRecordButtonClick}
                className={`record-button ${isRecording ? 'recording' : ''}`}
                disabled={isProcessingRecording}
                title={isRecording ? "Stop recording user actions" : "Start recording a new test task"}
            >
                {isProcessingRecording ? 'Processing...' : (isRecording ? 'Stop Recording' : 'Start Recording')}
            </button>
             {/* Placeholder for checkbox */}
             {/* <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9em', cursor: 'pointer' }}>
                 <input type="checkbox" style={{ marginRight: '5px' }} /> Run last task on reload
             </label> */}
        </div>

      </div> {/* End Grid Header */}

      <ReportsPanel
        isOpen={showReportsPanel}
        onClose={() => setShowReportsPanel(false)}
      />
      
      <div className="main-content">
        <div className="left-panel">
          <div className="editor-section">
            <YeshieEditor onSubmit={handleEditorSubmit} />
          </div>
        </div>
        <div className="right-panel">
          <TabList />
        </div>
      </div>

      <ReportDialog
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        onSubmit={handleReportSubmit}
      />
 
      {isApiKeyModalOpen && (
        <div className="modal-backdrop"> 
          <div className="modal-content"> 
            <h3>{hasApiKey ? "Update OpenAI API Key" : "Set OpenAI API Key"}</h3>
            <p>Enter your OpenAI API key. It will be stored locally in your browser's storage.</p>
            <div className="input-group">
              <label htmlFor="apiKeyInput">API Key:</label>
              <input
                  id="apiKeyInput"
                  type="password" 
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  disabled={apiKeyLoading}
              />
            </div>
            <div className="modal-actions">
                <button onClick={handleCloseApiKeyModal} disabled={apiKeyLoading}>Cancel</button>
                <button onClick={handleSaveApiKey} disabled={apiKeyLoading}>
                    {apiKeyLoading ? 'Saving...' : 'Save Key'}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Render Log Viewer Modal */}
      <LogViewer 
        isOpen={showLogViewer}
        onClose={() => setShowLogViewer(false)}
        showToast={showToast} // Pass the toast function
      />

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
   ""
  </React.StrictMode>
); 

export default TabsIndex;
