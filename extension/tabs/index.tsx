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

// Storage key for the last loaded time
const LAST_LOADED_TIME_KEY = "yeshie_tab_page_last_loaded";
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
      console.log("TabsIndex: Fetching last tab info...");
      const response = await sendToBackground({ name: "getLastTab" });
      // Log the raw response from the background script
      console.log("TabsIndex: Received response from background for getLastTab:", JSON.stringify(response));
      
      if (response && response.success && response.lastTab) {
        console.log("TabsIndex: Got valid last tab info:", response.lastTab);
        setLastTabInfo(response.lastTab);
        setErrorMessage("");
        setTabInfoReady(true);
        return response.lastTab;
      } else {
        console.log("TabsIndex: No valid last tab info returned:", response?.error);
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
    
    // Then set up regular polling for updates
    const regularPollingTimer = setInterval(fetchLastTab, 5000); // Poll every 5 seconds
    
    return () => {
      clearInterval(regularPollingTimer);
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
      console.log("Tab Pane focused at:", now);
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

  // Return to the last active tab
  const returnToLastTab = async () => {
    if (!lastTabInfo) {
      console.log("Can't return to tab: No tab info available");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    
    try {
      console.log(`Attempting to focus tab ID: ${lastTabInfo.id}`);
      
      const response = await sendToBackground({ 
        name: "focusLastTab",
        body: { force: true } // Always force focus for manual clicks
      });
      
      console.log("Focus response:", response);
      
      if (!response || !response.success) {
        setErrorMessage(response?.error || "Failed to return to previous tab");
        
        // Direct approach as fallback
        try {
          console.log("Trying direct tab focus as fallback");
          await chrome.tabs.update(lastTabInfo.id, { active: true });
          console.log("Direct tab focus successful");
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

  return (
    <div className="tabs-container">
      <div className="tabs-header">
        <div className="header-left">
          <h1>Yeshie</h1>
          <div className="last-tab-info">
            {lastTabInfo ? (
              <>
                <span className="last-tab-label">Last Active Tab:</span>
                <span
                  onClick={returnToLastTab}
                  className="last-tab-link"
                  title={`${lastTabInfo.title}\n${lastTabInfo.url}`}
                  style={{ cursor: 'pointer' }}
                >
                  {lastTabInfo.title}
                </span>
                <button 
                  onClick={returnToLastTab} 
                  disabled={loading}
                  className="return-button-inline"
                >
                  {loading ? "..." : "Return"}
                </button>
                <span className="timestamp" title={new Date(lastTabInfo.timestamp).toISOString()}>
                  (Updated: {formatTimestamp(lastTabInfo.timestamp)})
                </span>
              </>
            ) : (
              <span className="last-tab-label">{errorMessage || "No recent tabs"}</span>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="timestamps">
            {tabPaneFocusedTime && (
              <span className="timestamp" title={new Date(tabPaneFocusedTime).toISOString()}>
                Pane Focused: {formatTimestamp(tabPaneFocusedTime)}
              </span>
            )}
          </div>
          <button
            className="icon-button report-icon-button"
            onClick={() => setShowReportDialog(true)}
            title="Report Bug or Feature"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </button>
          <button
            className="reports-button"
            onClick={() => setShowReportsPanel(true)}
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
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Reports
            {reportCount > 0 && (
              <span className="report-count">{reportCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Reports Panel */}
      <ReportsPanel
        isOpen={showReportsPanel}
        onClose={() => setShowReportsPanel(false)}
      />
      
      <div className="main-content">
        <div className="left-panel">
          <div className="editor-section">
            <YeshieEditor />
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

      {toast && <div className="toast-notification">{toast}</div>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
console.log("TabsIndex", TabsIndex);
root.render(
  <React.StrictMode>
    <TabsIndex />
  </React.StrictMode>
); 