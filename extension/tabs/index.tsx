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
      console.log("Fetching last tab info...");
      const response = await sendToBackground({ name: "getLastTab" });
      
      if (response && response.success && response.lastTab) {
        console.log("Got last tab info:", response.lastTab);
        setLastTabInfo(response.lastTab);
        setErrorMessage("");
        setTabInfoReady(true);
        return response.lastTab;
      } else {
        console.log("No last tab info available:", response?.error);
        setLastTabInfo(null);
        setErrorMessage(response?.error || "No previous tab information available");
        setTabInfoReady(true);
        return null;
      }
    } catch (error) {
      console.error("Error fetching last tab:", error);
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

  return (
    <div className="tabs-container">
      <div className="tabs-header">
        <div className="header-left">
          <h1>Yeshie</h1>
          <div className="last-tab-info">
            {lastTabInfo ? (
              <>
                <span className="last-tab-label">Last Active Tab:</span>
                <a
                  href={lastTabInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="last-tab-link"
                  title={lastTabInfo.url}
                >
                  {lastTabInfo.title}
                </a>
              </>
            ) : (
              <span className="last-tab-label">No recent tabs</span>
            )}
          </div>
        </div>
        <div className="header-right">
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

      {/* Last active tab information - compact layout */}
      <div className="last-tab-info compact">
        <div className="last-tab-header">
          <div className="last-tab-title">
            <h2>Last Active Tab</h2>
            {lastTabInfo && (
              <button 
                onClick={returnToLastTab} 
                disabled={loading}
                className="return-button"
              >
                {loading ? "Returning..." : `Return to Tab`}
              </button>
            )}
          </div>
        </div>
        
        {lastTabInfo ? (
          <div className="last-tab-details compact">
            <div className="tab-detail-row">
              <span className="tab-title" title={lastTabInfo.title}>{lastTabInfo.title}</span>
              <span className="tab-id">ID: {lastTabInfo.id}</span>
            </div>
            <div className="tab-detail-row">
              <span className="tab-domain" title={lastTabInfo.url}>{getDomainFromUrl(lastTabInfo.url)}</span>
              <span className="tab-time" title={formatTimestamp(lastTabInfo.timestamp)}>
                Last active: {new Date(lastTabInfo.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ) : (
          <p className="no-last-tab">
            {errorMessage || "No previous tab information available"}
          </p>
        )}
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
        isOpen={showReportsPanel}
        onClose={() => setShowReportsPanel(false)}
      />
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