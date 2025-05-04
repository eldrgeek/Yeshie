import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import YeshieEditor from "../components/YeshieEditor";
import TabList from "./TabList";
import { sendToBackground } from "@plasmohq/messaging";
import { Storage } from "@plasmohq/storage";
import ReportsPanel from "../components/ReportsPanel";
import ReportDialog from "../components/ReportDialog";
import { getBuildInfo } from '../background/buildCounter';

import "./style.css"; // Assuming you might want some basic styling

// --- Constants ---
const PAGE_TITLE = "Yeshie Control";
const DEBUG_TABS = false; // Control tab-related logging
const LAST_LOADED_TIME_KEY = "yeshie_tab_page_last_loaded";
const API_KEY_STORAGE_KEY = 'openai-api-key'; // Add key constant
const RELOAD_COUNT_KEY = "yeshie_tab_reload_count"; // Key for reload counter

// --- Storage ---
const storage = new Storage({ area: "local" });

interface TabInfo {
  id: number;
  url: string;
  title: string;
  timestamp: number;
}

interface BuildInfo {
  manifestVersion: string;
  buildCounter: number;
  buildId: string;
  isDev: boolean;
}

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

function TabsIndex() {
  const [buildInfo] = useState(getBuildInfo());
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
  const [reloadCount, setReloadCount] = useState<number>(0); // State for reload count

  // --- State for API Key Management ---
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Save current page load time and retrieve last loaded time
  useEffect(() => {
    const loadAndUpdateTime = async () => {
      try {
        // Get previous last loaded time
        const previousTime = await storage.get(LAST_LOADED_TIME_KEY);
        if (previousTime) {
          setLastLoadedTime(previousTime);
        }

        // Set new last loaded time
        const currentTime = new Date().toLocaleString();
        await storage.set(LAST_LOADED_TIME_KEY, currentTime);
      } catch (error) {
        console.error("Error managing last loaded time:", error);
      }
    };

    loadAndUpdateTime();
  }, []);

  // Fetch the last active tab
  const fetchLastTab = async () => {
    try {
      if (DEBUG_TABS) console.log("TabsIndex: Fetching last tab info...");
      const response = await sendToBackground({ name: "getLastTab" });
      // Log the raw response from the background script
      if (DEBUG_TABS) console.log("TabsIndex: Received response from background for getLastTab:", JSON.stringify(response));
      
      if (response && response.success && response.lastTab) {
        if (DEBUG_TABS) console.log("TabsIndex: Got valid last tab info:", response.lastTab);
        setLastTabInfo(response.lastTab);
        setErrorMessage("");
        setTabInfoReady(true);
        return response.lastTab;
      } else {
        if (DEBUG_TABS) console.log("TabsIndex: No valid last tab info returned:", response?.error);
        setLastTabInfo(null);
        setErrorMessage(response?.error || "No previous tab information available");
        setTabInfoReady(true);
        return null;
      }
    } catch (error) {
      console.error("TabsIndex: Error fetching last tab:", error);
      setLastTabInfo(null);
      setErrorMessage("Failed to retrieve last tab information");
      setTabInfoReady(true);
      return null;
    }
  };

  // Effect: Immediately fetch tab info when component mounts
  useEffect(() => {
    // Immediately fetch last tab info when page loads
    console.log("Tab page loaded, immediately fetching last tab info");
    fetchLastTab();
    
    // Then set up regular polling for updates - REMOVED as likely excessive
    // const regularPollingTimer = setInterval(fetchLastTab, 5000); // Poll every 5 seconds
    
    return () => {
      // clearInterval(regularPollingTimer);
    };
  }, []);

  // Load reports when component mounts and when tabInfoReady changes
  useEffect(() => {
    const loadReports = async () => {
      try {
        const storage = new Storage();
        const reports = await storage.get<Report[]>('reports');
        console.log('Loaded reports:', reports);
        setReportCount(reports?.length || 0);
      } catch (error) {
        console.error('Error loading reports:', error);
      }
    };

    if (tabInfoReady) {
      loadReports();
    }
  }, [tabInfoReady]);

  // Add listener for report updates
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.reports) {
        const reports = changes.reports.newValue as Report[];
        console.log('Reports updated:', reports);
        setReportCount(reports?.length || 0);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Add listener for window focus
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (DEBUG_TABS) console.log("Tab Pane focused at:", now);
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
      try {
        const currentCount = await storage.get<number>(RELOAD_COUNT_KEY) || 0;
        const newCount = currentCount + 1;
        await storage.set(RELOAD_COUNT_KEY, newCount);
        setReloadCount(newCount);
        console.log(`Yeshie Tab Page Reload Count: ${newCount}`);
      } catch (error) {
        console.error("Error managing reload count:", error);
      }
    };

    incrementReloadCount();
  }, []); // Run only once on component mount

  // --- Effect to check for API Key on load ---
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const key = await storage.get<string>(API_KEY_STORAGE_KEY);
        setHasApiKey(!!key);
      } catch (error) {
        console.error("Error checking for API key:", error);
        setHasApiKey(false);
      }
    };
    checkApiKey();
  }, []);

  // Return to the last active tab
  const returnToLastTab = async () => {
    if (!lastTabInfo) {
      if (DEBUG_TABS) console.log("Can't return to tab: No tab info available");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    
    try {
      if (DEBUG_TABS) console.log(`Attempting to focus tab ID: ${lastTabInfo.id}`);
      
      const response = await sendToBackground({ 
        name: "focusLastTab",
        body: { force: true } // Always force focus for manual clicks
      });
      
      if (DEBUG_TABS) console.log("Focus response:", response);
      
      if (!response || !response.success) {
        setErrorMessage(response?.error || "Failed to return to previous tab");
        
        // Direct approach as fallback
        try {
          if (DEBUG_TABS) console.log("Trying direct tab focus as fallback");
          await chrome.tabs.update(lastTabInfo.id, { active: true });
          if (DEBUG_TABS) console.log("Direct tab focus successful");
        } catch (directError) {
          console.error("Direct tab focus failed:", directError);
          setErrorMessage(`${response?.error || "Failed to return to tab"} (Direct focus failed too)`);
        }
      }
    } catch (error) {
      console.error("Error returning to last tab:", error);
      setErrorMessage("Error returning to previous tab");
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
  const handleReportSubmit = async (report: { type: 'bug' | 'feature', title: string, description: string }) => {
    console.log("TabsIndex: Handling report submission:", report);
    try {
      // Directly send message to background
      await chrome.runtime.sendMessage({
        type: 'ADD_REPORT',
        report: {
          ...report,
          // Add any extra context if needed from the tabs page
        }
      });
      // Provide feedback (optional toast)
      setToast('Report submitted successfully from Tabs page!');
      setTimeout(() => setToast(null), 2000);
      setShowReportDialog(false); // Close dialog on submit
    } catch (error) {
      console.error('TabsIndex: Error submitting report:', error);
      setToast('Error submitting report from Tabs page');
      setTimeout(() => setToast(null), 2000);
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
      await storage.set(API_KEY_STORAGE_KEY, apiKeyInput.trim());
      setHasApiKey(true);
      setToast("OpenAI API Key saved successfully!");
      handleCloseApiKeyModal();
    } catch (error) {
      console.error("Error saving API key:", error);
      setToast("Failed to save API Key. Check console for details.");
    } finally {
      setApiKeyLoading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // --- Handler for YeshieEditor submit (Sends to LLM) ---
  const handleEditorSubmit = async (text: string) => {
    console.log("TabsIndex: YeshieEditor submitting text to LLM:", text);
    setToast("Sending to LLM... 🧠"); 

    try {
      // Check if API key is actually set before sending
      const apiKey = await storage.get<string>(API_KEY_STORAGE_KEY);
      if (!apiKey) {
        setToast("Error: OpenAI API Key is not set.");
        setTimeout(() => setToast(null), 3000);
        return;
      }

      const response = await sendToBackground({
        name: 'sendToLLM' as any, // Using type assertion
        body: { prompt: text }
      });

      console.log("TabsIndex: Raw response from sendToLLM background handler:", JSON.stringify(response, null, 2));

      if (response && response.result) {
        setToast(`LLM Response: ${response.result.substring(0, 100)}${response.result.length > 100 ? '...' : ''}`);
      } else if (response && response.error) {
        setToast(`Error: ${response.error}`);
      } else {
        setToast("Error: Received an unexpected response from the background script.");
      }

    } catch (error) {
      console.error("TabsIndex: Error during sendToBackground call:", error);
      setToast(`Error: Failed to communicate with background script. ${error.message}`);
    }

    // Clear toast after a delay
    setTimeout(() => {
      setToast(null);
    }, 10000); 
  };

  // --- Simple synchronous handler for testing ---
  const simpleTestSubmit = (text: string) => {
    console.log("--- Simple Test Submit Called ---", text);
    setToast(`Simple Test Submit: ${text.substring(0, 50)}...`);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="tabs-container">
      {toast && <div className="toast-notification">{toast}</div>}

      {/* Grid Header */}
      <div 
        className="tabs-header" 
        style={{ 
            display: 'grid',
            gridTemplateColumns: 'auto auto auto', // Use auto for all columns for compactness
            gap: '20px', // Spacing between columns
            alignItems: 'start', 
            padding: '5px 20px 10px 20px', 
            justifyContent: 'start' 
        }}
      > 
        {/* --- Grid Area 1: Title, Reload, Focused --- */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
           <h1 style={{ marginTop: '0', marginBottom: '0' }}>{PAGE_TITLE}</h1> {/* Removed default H1 margin */} 
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
        <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '15px', 
            // justifyContent: 'flex-end' // Removed this to keep content left-aligned within the area
          }}>
          {/* API Key Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>OpenAI API Key: {hasApiKey ? 'Set ✅' : 'Not Set ❌'}</span>
            <button onClick={handleOpenApiKeyModal} className="settings-button" title={hasApiKey ? "Replace API Key" : "Set API Key"}>
              🔑
            </button>
          </div>
          
          {/* Divider (Optional) */} 
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

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
console.log("TabsIndex", TabsIndex);
root.render(
  <React.StrictMode>
    ""
  </React.StrictMode>
); 

export default TabsIndex;
