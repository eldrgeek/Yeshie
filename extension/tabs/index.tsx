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
import { Stepper } from '../functions/Stepper';
import instructions from '../ipc/instructions.json';
import { ToastContainer, toast, Slide } from 'react-toastify'; // Added react-toastify imports
import 'react-toastify/dist/ReactToastify.css'; // Added react-toastify CSS
import TestViewerDialog from "../components/TestViewerDialog"; // Import the new dialog

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
const RUN_SCRIPT_ON_RELOAD_KEY = "yeshie_run_script_on_reload"; // Key for this new preference

// Define STORAGE_KEY locally as it's not exported from TabList
const STORAGE_KEY = 'yeshieTabCustomNames';

// SVG icons
const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const RecordIcon = ({ recording }: { recording: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={recording ? 'red' : 'none'} stroke={recording ? 'red' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /></svg>
);

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
  const [legacyToastMessage, setLegacyToastMessage] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState<number>(0);
  const [customNames, setCustomNames] = useState<CustomNameMap>({});
  const [lastErrorDetails, setLastErrorDetails] = useState<string | null>(null);
  const [showLogViewer, setShowLogViewer] = useState<boolean>(false); // State for LogViewer visibility
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState<boolean>(false);
  const [hasResults, setHasResults] = useState(false);
  const [runScriptOnReload, setRunScriptOnReload] = useState<boolean>(false); // New state
  const [showTestViewerDialog, setShowTestViewerDialog] = useState<boolean>(false); // New state for dialog
  const [activeInteractiveToast, setActiveInteractiveToast] = useState<string | null>(null); // To track active interactive toast ID

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

  // --- Effect to add unload notification --- 
  useEffect(() => {
    const notifyUnload = () => {
      logInfo("Core", "TabsIndex unloading, notifying background script");
      // Using sendMessage instead of sendToBackground because this is urgent
      chrome.runtime.sendMessage({ type: "CONTROL_PAGE_UNLOADING" });
      // No need to wait for response as the page is unloading
    };

    window.addEventListener('beforeunload', notifyUnload);
    
    return () => {
      window.removeEventListener('beforeunload', notifyUnload);
    };
  }, []); // Run only once on mount

  // --- Effect to clear session logs on mount ---
  useEffect(() => {
    logInfo("Core", "TabsIndex mounted, clearing previous session logs from storage.");
    clearSessionLogs();

    // Load the runScriptOnReload preference
    const loadRunPreference = async () => {
      try {
        const savedPreference = await storageGet<boolean>(RUN_SCRIPT_ON_RELOAD_KEY);
        if (savedPreference !== undefined) {
          setRunScriptOnReload(savedPreference);
          logInfo('UI', 'Loaded runScriptOnReload preference', { value: String(savedPreference) });
        } else {
          // If not set, default to false and save it
          await storageSet(RUN_SCRIPT_ON_RELOAD_KEY, false);
          setRunScriptOnReload(false);
          logInfo('UI', 'Initialized runScriptOnReload preference to false');
        }
      } catch (error) {
        handleError(error, { operation: 'loadRunScriptOnReloadPreference' });
        // Keep default false if error
      }
    };
    loadRunPreference();
  }, []);

  // Save current page load time and retrieve last loaded time
  useEffect(() => {
    const loadAndUpdateTime = async () => {
      try {
        // Get previous last loaded time
        const previousTime = await storageGet<string>(LAST_LOADED_TIME_KEY);
        logInfo('Storage', 'Storage get', { key: LAST_LOADED_TIME_KEY, found: !!previousTime });
        if (previousTime) {
          setLastLoadedTime(previousTime);
        }

        // Set new last loaded time
        const currentTime = new Date().toLocaleString();
        await storageSet(LAST_LOADED_TIME_KEY, currentTime);
        logInfo('Storage', 'Storage set', { key: LAST_LOADED_TIME_KEY });
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'loadAndUpdateTime' });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage("Error managing load time. Click to copy details.");
      }
    };

    loadAndUpdateTime();
  }, []);

  // --- Memoized function to fetch the last active tab ---
  const fetchLastTab = useCallback(async (): Promise<TabInfo | null> => {
    try {
      logDebug("TabTracking", "TabsIndex: Fetching last tab info...");
      const response: GetLastTabResponse = await sendToBackground({ name: "getLastTab" });
      logDebug("TabTracking", "TabsIndex: Received response from background for getLastTab", { response });
      
      if (response && response.success && response.lastTab) {
        logDebug("TabTracking", "TabsIndex: Got valid last tab info", { tab: response.lastTab });
        setLastTabInfo(response.lastTab);
        setErrorMessage("");
        setTabInfoReady(true);
        return response.lastTab;
      } else {
        logWarn("TabTracking", "TabsIndex: No valid last tab info returned", { error: response?.error });
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
      setLegacyToastMessage("Error fetching tab info. Click to copy details.");
      setTabInfoReady(true);
      return null;
    }
  }, []);

  // Effect: Immediately fetch tab info when component mounts
  useEffect(() => {
    logInfo("UI", "Tab page loaded, fetching last tab info");
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
        logInfo('Storage', 'Loaded reports from storage', { count: reports.length });
        setReportCount(reports?.length || 0);
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'loadReports' });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage("Error loading reports. Click to copy details.");
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
        logInfo('Storage', 'Reports updated via storage listener', { newCount: reportLength });
        setReportCount(reportLength);
      }
      if (changes[API_KEY_STORAGE_KEY]) {
          setHasApiKey(!!changes[API_KEY_STORAGE_KEY].newValue);
          logInfo('Storage', 'API Key updated via storage listener');
      }
      if (changes[STORAGE_KEY]) { // STORAGE_KEY for custom names
          const loadedNames = (changes[STORAGE_KEY].newValue as CustomNameMap) || {};
          setCustomNames(loadedNames);
          logInfo('Storage', 'Custom names updated via storage listener');
      }
      // Check if the LAST_TAB_KEY changed
      if (changes[LAST_TAB_KEY]) {
          logInfo('TabTracking', 'Detected LAST_TAB_KEY change, fetching updated tab info...');
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
      logDebug("UI", "Tab Pane focused", { timestamp: now });
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
        logInfo('Storage', 'Storage get', { key: RELOAD_COUNT_KEY, found: storedValue !== undefined, value: storedValue });

        if (typeof storedValue === 'number' && !isNaN(storedValue)) {
          numericCount = storedValue;
        } else if (typeof storedValue === 'string') {
          const parsed = parseInt(storedValue, 10);
          if (!isNaN(parsed)) {
            numericCount = parsed;
          } else {
             logWarn('Storage', 'Stored reload count was non-numeric string, resetting', { value: storedValue });
             numericCount = 0;
          }
        } else {
             logInfo('Storage', 'No valid stored reload count found, starting from 0');
             numericCount = 0;
        }

        // Reset if the count is unreasonably high
        if (numericCount > RESET_THRESHOLD) {
            logWarn('Storage', `Reload count ${numericCount} exceeded threshold ${RESET_THRESHOLD}, resetting.`, { value: numericCount });
            numericCount = 0;
        }

        const newCount = numericCount + 1; // Perform numerical addition
        await storageSet(RELOAD_COUNT_KEY, newCount);
        logInfo('Storage', 'Storage set', { key: RELOAD_COUNT_KEY, value: newCount });
        setReloadCount(newCount);
        logInfo("UI", `Yeshie Tab Page Reload Count: ${newCount}`);
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'incrementReloadCount' });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage("Error managing reload count. Click to copy details.");
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
        logInfo('Storage', 'Storage get', { key: API_KEY_STORAGE_KEY, found: !!key });
        setHasApiKey(!!key);
      } catch (error) {
        const errorDetails = handleError(error, { operation: 'checkApiKey' });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage("Error checking API key. Click to copy details.");
        setHasApiKey(false);
      }
    };
    checkApiKey();
  }, []);

  // --- Add Listener for Background Recording Status Updates ---
  useEffect(() => {
      logDebug("Background", "TabsIndex: Setting up message listener EFFECT START");

      const handleMessage = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
          logDebug("Background", "TabsIndex: handleMessage RECEIVED:", { message, senderId: sender?.id });

          if (!isMounted.current) {
              logWarn("UI", "TabsIndex: handleMessage received but component not mounted.");
              return false;
          }

          // Handle reload message from background
          // Note: We now use direct tab.reload() in the background script as the primary method,
          // but keeping this handler as a fallback for any legacy or custom implementations
          if (message.type === "RELOAD_CONTROL_PAGE") {
              logInfo("TabsIndex", "Received RELOAD_CONTROL_PAGE message, reloading page.");
              window.location.reload();
              return true;
          }

          // Keep existing handlers
          if (message.type === "RECORDING_STARTED") {
              logInfo("Recording", "TabsIndex: Received RECORDING_STARTED update from background.");
              setIsRecording(true);
              setIsProcessingRecording(false);
              setLegacyToastMessage(message.payload?.message || "Recording started.");
              setTimeout(() => setLegacyToastMessage(null), 2000);
              sendResponse({success: true});
              return false; // Indicate sync response handled
          }
          else if (message.type === "RECORDING_STOPPED") {
              logInfo("Recording", "TabsIndex: Received RECORDING_STOPPED update from background.");
              setIsRecording(false);
              setIsProcessingRecording(false);
              setLegacyToastMessage(message.payload?.message || "Recording stopped, processing...");
              sendResponse({success: true});
              return false; // Indicate sync response handled
          }
          else if (message.type === "RECORDING_PROCESSED") {
               logInfo("Recording", "TabsIndex: Received RECORDING_PROCESSED update from background.");
               setIsProcessingRecording(false);
               if (message.payload?.success) {
                   setLegacyToastMessage(`Task "${message.payload.taskName}" saved successfully!`);
                   // TODO: Refresh task list here
               } else {
                    const errorDetails = handleError(message.payload?.error || "Unknown processing error", { operation: 'recordingProcessedError' });
                    setLastErrorDetails(errorDetails);
                    setLegacyToastMessage(`Error saving task: ${message.payload?.error || 'Unknown error'}. Click to copy details.`);
               }
               setTimeout(() => {
                 setLegacyToastMessage(null);
                 if (!message.payload?.success) setLastErrorDetails(null);
               }, 5000);
               sendResponse({success: true});
               return false; // Indicate sync response handled
          }

          // Log if message wasn't handled by this listener, but don't return true unless needed for async
          logDebug("Background", "TabsIndex: Message not handled by recording status listener", { type: message?.type });
          // Explicitly return false if this listener doesn't handle the message or need to keep channel open
          return false;
      };

      chrome.runtime.onMessage.addListener(handleMessage);
      logDebug("Background", "TabsIndex: Added listener for recording status updates.");

      return () => {
          logDebug("Background", "TabsIndex: Removing listener for recording status updates (CLEANUP)");
          chrome.runtime.onMessage.removeListener(handleMessage);
      };
  }, []); // Ensure correct closing bracket and dependency array

  // Return to the last active tab
  const returnToLastTab = async () => {
    if (!lastTabInfo) {
      logWarn("TabTracking", "Can't return to tab: No tab info available");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    
    try {
      logDebug("TabTracking", `Attempting to focus tab ID: ${lastTabInfo.id}`);
      
      const response: FocusTabResponse = await sendToBackground({
        name: "focusLastTab",
        body: { force: true } // Always force focus for manual clicks
      });
      
      logDebug("TabTracking", "Focus response", { response });
      
      if (!response || !response.success) {
        setErrorMessage(response?.error || "Failed to return to previous tab");
        logWarn("TabTracking", "Failed to return to previous tab via background", { error: response?.error });
        
        // Direct approach as fallback
        try {
          logDebug("TabTracking", "Trying direct tab focus as fallback", { tabId: lastTabInfo.id });
          await chrome.tabs.update(lastTabInfo.id, { active: true });
          logDebug("TabTracking", "Direct tab focus successful");
        } catch (directError) {
          const errorDetails = handleError(directError, { operation: 'returnToLastTab - directFocusFallback' });
          setLastErrorDetails(errorDetails);
          setErrorMessage(`${response?.error || "Failed to return to tab"} (Direct focus failed too)`);
          setLegacyToastMessage("Direct tab focus failed. Click to copy details.");
        }
      }
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'returnToLastTab' });
      setLastErrorDetails(errorDetails);
      setErrorMessage("Error returning to previous tab");
      setLegacyToastMessage("Error returning to last tab. Click to copy details.");
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
    logInfo("UI", "TabsIndex: Handling report submission", { reportData });
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
      setLegacyToastMessage('Report submitted successfully from Tabs page!');
      setTimeout(() => setLegacyToastMessage(null), 2000);
      setShowReportDialog(false); // Close dialog on submit
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleReportSubmit' });
      setLastErrorDetails(errorDetails);
      setLegacyToastMessage('Error submitting report. Click to copy details.');
      setTimeout(() => {
         setLegacyToastMessage(null);
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
      toast.warning("API Key cannot be empty.");
      setTimeout(() => setLegacyToastMessage(null), 3000);
      return;
    }
    setApiKeyLoading(true);
    setLegacyToastMessage(null);
    try {
      await storageSet(API_KEY_STORAGE_KEY, apiKeyInput.trim());
      logInfo('Storage', 'Storage set', { key: API_KEY_STORAGE_KEY });
      setHasApiKey(true);
      toast.success("OpenAI API Key saved successfully!");
      handleCloseApiKeyModal();
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleSaveApiKey' });
      setLastErrorDetails(errorDetails);
      toast.error("Failed to save API Key. Click to copy details.");
    } finally {
      setApiKeyLoading(false);
      setTimeout(() => {
         setLegacyToastMessage(null);
         setLastErrorDetails(null); // Clear details when toast fades
      }, 3000);
    }
  };

  // --- Handler for YeshieEditor submit (Sends to LLM) ---
  const handleEditorSubmit = async (text: string) => {
    logInfo("API", "TabsIndex: YeshieEditor submitting text to LLM", { textLength: text.length });
    toast.info("Sending to LLM... 🧠");
    setLegacyToastMessage("Sending to LLM... 🧠"); 

    try {
      // Use storageGet directly, remove incorrect 'storage.' prefix
      const apiKey = await storageGet<string>(API_KEY_STORAGE_KEY);
      logInfo('API', 'Storage get', { key: API_KEY_STORAGE_KEY, purpose: 'llm_call', found: !!apiKey });
      if (!apiKey) {
        const errorDetails = handleError("Cannot send to LLM: OpenAI API Key is not set", { operation: 'handleEditorSubmit' });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage("Error: OpenAI API Key not set. Click to copy details.");
        setTimeout(() => {
           setLegacyToastMessage(null);
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

      logInfo("API", "TabsIndex: Raw response from sendToLLM background handler", { response });

      if (response && response.result) {
        setLegacyToastMessage(`LLM Response: ${response.result.substring(0, 100)}${response.result.length > 100 ? '...' : ''}`);
      } else if (response && response.error) {
        setLegacyToastMessage(`Error: ${response.error}`);
        const errorDetails = handleError(response.error, { operation: 'handleEditorSubmit - LLM Error Response', backgroundResponse: response });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage(`Error: ${response.error}. Click to copy details.`);
      } else {
        const errorDetails = handleError("LLM call failed: Received an unexpected response from the background script", { operation: 'handleEditorSubmit - Unexpected Response', response });
        setLastErrorDetails(errorDetails);
        setLegacyToastMessage("Error: Unexpected LLM response. Click to copy details.");
      }

    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleEditorSubmit - sendToBackground catch' });
      setLastErrorDetails(errorDetails);
      const displayMessage = error instanceof Error ? error.message : "Failed to communicate with background script.";
      setLegacyToastMessage(`Error: ${displayMessage}. Click to copy details.`);
    }

    // Clear toast and error details after a delay
    setTimeout(() => {
      setLegacyToastMessage(null);
      setLastErrorDetails(null);
    }, 10000); 
  };

  // --- Simple synchronous handler for testing ---
  const simpleTestSubmit = (text: string) => {
    logInfo("UI", "--- Simple Test Submit Called ---", { textLength: text.length });
    toast.info(`Simple Test Submit: ${text.substring(0, 50)}...`);
    setTimeout(() => setLegacyToastMessage(null), 3000);
  };

  // --- Memoized function to show toast ---
  const showToast = useCallback((message: string, duration: number = 3000) => {
      setLegacyToastMessage(message);
      // Automatically clear non-error toasts
      // Error toasts are cleared via specific logic in handleError integration
      if (!lastErrorDetails) { 
          setTimeout(() => {
              setLegacyToastMessage(null);
          }, duration);
      }
  }, [lastErrorDetails]); // Dependency: Recreate only if lastErrorDetails changes (relevant for clearing logic)

  // --- Function to copy error details ---
  const copyErrorDetailsToClipboard = () => {
    if (lastErrorDetails) {
      navigator.clipboard.writeText(lastErrorDetails)
        .then(() => {
          setLegacyToastMessage("Error details copied to clipboard!");
          setTimeout(() => {
             setLegacyToastMessage(null);
             setLastErrorDetails(null); // Ensure it clears
          }, 2000); // Short confirmation
        })
        .catch(err => {
          const errorDetails = handleError(err, { operation: 'copyErrorDetailsToClipboard' });
          setLastErrorDetails(errorDetails);
          setLegacyToastMessage("Failed to copy details. Click to copy again?"); // Allow retry?
        });
    } else {
      logWarn("UI", "Attempted to copy error details when none were available.");
    }
  };

  // --- Function to handle Recording Button Click ---
  const handleRecordButtonClick = () => {
    if (isProcessingRecording) {
        toast.warning("Please wait, previous recording is processing...");
        setTimeout(() => setLegacyToastMessage(null), 2000);
        return;
    }

    const messageType = isRecording ? "STOP_RECORDING_FROM_UI" : "START_RECORDING_FROM_UI";
    logInfo("Recording", `Sending ${messageType} to background script.`);
    // Optimistically update UI? Maybe wait for background confirmation.
    // setIsRecording(!isRecording); // Example optimistic update

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (chrome.runtime.lastError) {
            const errorDetails = handleError(chrome.runtime.lastError, { operation: 'handleRecordButtonClick', messageType });
            setLastErrorDetails(errorDetails);
            setLegacyToastMessage(`Error ${isRecording ? 'stopping' : 'starting'} recording. Click to copy details.`);
            // Revert optimistic update if needed: setIsRecording(isRecording);
        } else if (response && response.success) {
            logInfo("Recording", `Background acknowledged ${messageType}: ${response.message}`);
            // Update state based on actual background action (handled by listener now)
            // setIsRecording(!isRecording); // Let listener handle state changes
        } else {
             const errorDetails = handleError(response?.error || "Unknown error from background", { operation: 'handleRecordButtonClick', messageType, response });
             setLastErrorDetails(errorDetails);
             setLegacyToastMessage(`Failed to ${isRecording ? 'stop' : 'start'} recording: ${response?.error || 'Unknown error'}. Click to copy details.`);
             // Revert optimistic update if needed: setIsRecording(isRecording);
        }
         // Clear error toast after delay
         if (lastErrorDetails || (response && !response.success)) {
              setTimeout(() => {
                  setLegacyToastMessage(null);
                  setLastErrorDetails(null);
              }, 5000);
         }
    });
  };

  // Listen for step execution messages from the background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'RUN_STEPPER_STEP' && msg.step) {
      logDebug("Stepper", "TabsIndex: Received RUN_STEPPER_STEP from background", { step: msg.step });
      Stepper(msg.step).then((result) => {
        logDebug("Stepper", "TabsIndex: Stepper finished step, sending response to background", { result });
        sendResponse({ result });
      });
      return true; // Indicates async response
    }
  });

  // Utility to write results.json
  async function writeResultsJson(log: any[]) {
    await chrome.runtime.sendMessage({ type: 'WRITE_RESULTS_JSON', log });
  }

  // Download results.json from chrome.storage.local
  const handleDownloadResults = async () => {
    const data = await chrome.storage.local.get('ipc_results');
    if (data && data.ipc_results) {
      const blob = new Blob([JSON.stringify(data.ipc_results, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'results.json';
      document.body.appendChild(a);
      a.click();
      logInfo("UI", "Initiated download of results.json"); // Log download action
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } else {
      toast.info('No results to download.');
    }
  };

  // On mount, run the imported instructions.json if present
  useEffect(() => {
    async function runInstructionsIfPresent() {
      // Wait for the button to appear before running the test
      const waitForButton = (
        selector: string,
        timeout = 3000,
        interval = 200
      ): Promise<void> =>
        new Promise((resolve, reject) => {
          const start = Date.now();
          const check = () => {
            if (document.querySelector(selector)) return resolve();
            if (Date.now() - start > timeout) return reject();
            setTimeout(check, interval);
          };
          check();
        });

      if (!runScriptOnReload) { // Check the toggle state
        logInfo('UI', 'runInstructionsIfPresent: Auto-run disabled by user toggle.');
        // Optionally, show a persistent message that auto-run is off if the legacyToast is removed
        // setLegacyToastMessage("Automatic script execution on load is disabled.");
        toast.warn('No instructions.json found or has no tasks.', { autoClose: 5000 });
        setHasResults(false);
        return;
      }

      if (!instructions || !instructions.tasks) {
        // setLegacyToastMessage('No instructions.json found or has no tasks.');
        toast.warn('No instructions.json found or has no tasks.', { autoClose: 5000 });
        setHasResults(false);
        return;
      }
      // setLegacyToastMessage('instructions.json found. Waiting for DOM...');
      toast.info('instructions.json found. Waiting for DOM...', { autoClose: 2000 }); // This is the one user mentioned
      try {
        await waitForButton('#log-viewer-button', 3000);
      } catch {
        // setLegacyToastMessage('log-viewer-button did not appear in time.');
        toast.error('log-viewer-button did not appear in time.', { autoClose: 5000 });
        setHasResults(false);
        return;
      }
      // setLegacyToastMessage('Running test...');
      toast.info('Running test...', { autoClose: 2000 }); // This is the one user mentioned
      let log = [];
      try { 
        logInfo("Stepper", "Starting execution of instruction file steps..."); // Log start of execution
        for (const task of instructions.tasks) {
          logDebug("Stepper", `Executing task: ${(task as any).taskName || (task as any).tab?.name || 'Unnamed Task'}`);
          for (const step of task.steps) {
            const stepForStepper = { ...step, command: step.cmd };
            logDebug("Stepper", `Executing step:`, { command: stepForStepper.command, details: stepForStepper });
            const result = await Stepper(stepForStepper); // Stepper itself has internal try-catch for each command
            logDebug("Stepper", `Step result:`, { result });
            log.push({ step, result });
          }
        }
        logInfo("Stepper", "Finished executing instruction file steps."); // Log end of execution
        await writeResultsJson(log);
        setHasResults(true);
        // setLegacyToastMessage('Test complete: results.json written.');
        toast.success('Test complete: results.json written.', { autoClose: 3000 });
      } catch (e) {
        logError("Stepper", "Error during instruction execution or writing results:", e);
        // setLegacyToastMessage(`ERROR during test: ${e.message}. Check console.`);
        toast.error(`ERROR during test: ${(e as Error).message}. Check console.`, { autoClose: 10000 });
      }
    }
    runInstructionsIfPresent();
  }, [runScriptOnReload]); // Added runScriptOnReload as a dependency

  // useEffect for handling messages from Stepper.ts (interactive toasts, etc.)
  useEffect(() => {
    const handleStepperMessages = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SHOW_INTERACTIVE_TOAST_REQUEST') {
        const { toastId, message, options } = event.data;
        logInfo('UI', 'Received SHOW_INTERACTIVE_TOAST_REQUEST', { toastId, message, options });
        setActiveInteractiveToast(toastId);

        const notifyStepper = (action: 'continue' | 'cancel') => {
          // Target the content script that sent the message.
          // Assuming Stepper.ts is in the main window of the tab where it runs.
          // If Stepper is in an iframe, event.source needs to be used carefully.
          if (event.source) { // Check if event.source is available (it should be for window.postMessage)
             (event.source as Window).postMessage({ type: 'INTERACTIVE_TOAST_RESPONSE', toastId, action }, event.origin || '*');
          } else {
            // Fallback or error if event.source is not available, though it should be for messages from same-origin iframes or main window content scripts.
            // console.warn("event.source not available for INTERACTIVE_TOAST_RESPONSE. This might indicate an issue if Stepper is in a cross-origin iframe.");
            logWarn("UI", "event.source not available for INTERACTIVE_TOAST_RESPONSE. Check cross-origin issues.");
            window.postMessage({ type: 'INTERACTIVE_TOAST_RESPONSE', toastId, action }, '*'); // Fallback to general postMessage
          }
          setActiveInteractiveToast(null); // Clear active toast
        };

        const toastContent = (
          <div>
            <div>{message || "Proceed?"}</div>
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => { toast.dismiss(toastId); notifyStepper('cancel'); }} className="toast-button-cancel">Cancel Test</button>
              <button onClick={() => { toast.dismiss(toastId); notifyStepper('continue'); }} className="toast-button-continue">Continue</button>
            </div>
          </div>
        );

        const defaultToastOptions = {
          toastId: toastId, // Important for managing the toast programmatically
          autoClose: false,
          closeOnClick: false,
          draggable: false,
          closeButton: false, // We have custom buttons
          content: toastContent,
          // Default position, can be overridden by options
          position: "top-center", // Corrected: string literal
          transition: Slide,
          onClose: () => {
            // If closed by means other than buttons (e.g., programmatically, though unlikely here without a close button)
            // We should ensure we don't leave Stepper hanging. Default to cancel if closed without explicit action.
            if (activeInteractiveToast === toastId) { // Check if this toast was still considered active
              logWarn('UI', 'Interactive toast closed without explicit action, defaulting to cancel.', { toastId });
              notifyStepper('cancel');
            }
          },
          ...(options || {}), // Spread user-provided options, allowing them to override defaults
        };

        // Use toast.custom or just toast with custom content for full control if needed
        // For now, standard toast with custom content component:
        toast(toastContent, defaultToastOptions);

      } else if (event.data && event.data.type === 'yeshie-message') {
        logInfo("UI", "Displaying general message (postMessage):", event.data.text);
        toast(event.data.text); // New way using react-toastify for simple messages
      } else if (event.data && event.data.type === 'yeshie-toast') {
        // This was our previous simple toast, let's use react-toastify for these too for consistency
        // but make them non-interactive by default.
        logInfo("UI", "Displaying simple toast (postMessage) via react-toastify:", event.data.message);
        toast(event.data.message, { // Simple non-interactive toast
            autoClose: 3000,
            position: "bottom-right", // Corrected: string literal
            transition: Slide,
            ...(event.data.options || {}) // Allow simple toasts to also have options
        });
      }
    };

    window.addEventListener('message', handleStepperMessages);
    return () => {
      window.removeEventListener('message', handleStepperMessages);
    };
  // Listen to activeInteractiveToast to handle onClose correctly
  }, [activeInteractiveToast, logInfo, setLegacyToastMessage]); 

  const handleRunScriptOnReloadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setRunScriptOnReload(newValue);
    try {
      await storageSet(RUN_SCRIPT_ON_RELOAD_KEY, newValue);
      logInfo('Storage', 'Storage set for runScriptOnReload preference', { key: RUN_SCRIPT_ON_RELOAD_KEY, value: newValue });
      if (newValue) {
        toast.info("Instructions will run automatically on next page load.");
      } else {
        toast.info("Automatic instruction execution on page load disabled.");
      }
    } catch (error) {
      handleError(error, { operation: 'setRunScriptOnReloadPreference' });
      toast.error("Error saving preference. Click to copy details.");
      // Revert UI if save failed? For now, optimistic.
    }
  };

  const handleArchiveTest = async () => {
    logInfo("UI", "Attempting to archive current test...");
    if (!instructions || !instructions.tasks || instructions.tasks.length === 0) {
      toast.error("No test loaded or tasks found in instructions.json to archive.");
      return;
    }

    const firstTask = instructions.tasks[0] as any; // Use 'as any' to bypass strict type checking for this dynamic part
    let taskName = "";

    if (firstTask && typeof firstTask.taskName === 'string') {
      taskName = firstTask.taskName; // New structure
    } else if (firstTask && firstTask.tab && typeof firstTask.tab.name === 'string') {
      taskName = firstTask.tab.name; // Current old structure (Sequential VR Button Test)
    } else {
      toast.error("Cannot archive: Test name not found in expected locations (tasks[0].taskName or tasks[0].tab.name).");
      return;
    }
    
    // Original error was due to direct access: const taskName = instructions.tasks[0].taskName;
    // The check below might seem redundant given the above, but it's a final guard.
    if (!taskName) { 
      toast.error("Cannot archive: The first task in instructions.json is missing a valid name string.");
      return;
    }

    const normalizedTaskName = taskName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    if (!normalizedTaskName) {
      toast.error("Cannot archive: Task name is invalid after normalization.");
      return;
    }

    const storageKey = `archived_test_${normalizedTaskName}`;
    try {
      await storageSet(storageKey, instructions); // Store the whole instructions object
      logInfo('Storage', `Test '${taskName}' archived successfully to storage with key: ${storageKey}` );
      toast.success(`Test "${taskName}" archived successfully!`);
    } catch (error) {
      const errorDetails = handleError(error, { operation: 'handleArchiveTest', taskName, storageKey });
      setLastErrorDetails(errorDetails);
      toast.error(`Failed to archive test "${taskName}". Click to copy details.`);
    }
  };

  return (
    <div className="tabs-container">
      <ToastContainer newestOnTop /> {/* Added ToastContainer */}
      {legacyToastMessage && (
          <div 
              className={`toast-notification ${lastErrorDetails ? 'error-toast' : ''}`}
              onClick={lastErrorDetails ? copyErrorDetailsToClipboard : undefined}
              style={lastErrorDetails ? { cursor: 'pointer' } : {}}
              title={lastErrorDetails ? "Click to copy detailed error information" : ""}
          >
              {legacyToastMessage}
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
                  className="icon-button"
                  onClick={handleDownloadResults}
                  title="Download Results"
                  style={{ padding: '5px' }}
                >
                  <DownloadIcon />
                </button>
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
              id="log-viewer-button"
              className="icon-button log-viewer-button"
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
                id="record-button"
                onClick={handleRecordButtonClick}
                className={`icon-button record-button ${isRecording ? 'recording' : ''}`}
                disabled={isProcessingRecording}
                title={isRecording ? "Stop recording user actions" : "Start recording a new test task"}
                style={{ padding: '5px' }}
            >
                <RecordIcon recording={isRecording} />
            </button>
        </div>

        {/* --- Grid Area 6: Run Script on Reload Toggle --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px' }}>
          <input
            type="checkbox"
            id="runScriptOnReloadCheckbox"
            checked={runScriptOnReload}
            onChange={handleRunScriptOnReloadChange}
            style={{ transform: 'scale(1.2)' }} // Make checkbox slightly larger
          />
          <label 
            htmlFor="runScriptOnReloadCheckbox" 
            style={{ fontSize: '0.9em', cursor: 'pointer' }}
            title="If checked, instructions.json will run automatically when this page loads/reloads"
          >
            Auto-run Script
          </label>
        </div>

      </div> {/* End Grid Header */}

      {/* --- Test Actions Panel --- */}
      <div 
        className="test-actions-panel"
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          background: '#f9f9f9'
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Test Actions:</div>
        
        {/* Auto-run Script Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            id="runScriptOnReloadCheckbox"
            checked={runScriptOnReload}
            onChange={handleRunScriptOnReloadChange}
            style={{ transform: 'scale(1.2)' }}
          />
          <label 
            htmlFor="runScriptOnReloadCheckbox" 
            style={{ fontSize: '0.9em', cursor: 'pointer' }}
            title="If checked, instructions.json will run automatically when this page loads/reloads"
          >
            Auto-run Script
          </label>
        </div>

        {/* Download Results Button - Moved Here */}
        <button
          className="icon-button"
          onClick={handleDownloadResults}
          title="Download Last Test Results (from results.json)"
          style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <DownloadIcon /> Results
        </button>

        {/* New Archive Test Button */}
        <button
          className="icon-button"
          onClick={handleArchiveTest} // This function will be created next
          title="Archive the current instructions.json to local storage"
          style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> 
          Archive Test
        </button>

        {/* New View Archived Tests Button */}
        <button
          className="icon-button"
          onClick={() => setShowTestViewerDialog(true)}
          title="View and manage archived tests"
          style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          View Tests
        </button>

      </div>

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
        showToast={toast.info} // Pass the react-toastify toast.info function
      />

      <TestViewerDialog 
        isOpen={showTestViewerDialog}
        onClose={() => setShowTestViewerDialog(false)}
      />

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<TabsIndex />);

export default TabsIndex;
