import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import YeshieEditor from "../components/YeshieEditor";
import TabList from "./TabList";
import { sendToBackground } from "@plasmohq/messaging";
import { Storage } from "@plasmohq/storage";

import "./style.css"; // Assuming you might want some basic styling

// Storage key for the last loaded time
const LAST_LOADED_TIME_KEY = "yeshie_tab_page_last_loaded";
const storage = new Storage({ area: "local" });

interface LastTabInfo {
  id: number;
  url: string;
  title: string;
  timestamp: number;
}

function TabsIndex() {
  const [version, setVersion] = useState("Loading...");
  const [lastTab, setLastTab] = useState<LastTabInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tabInfoReady, setTabInfoReady] = useState(false);
  const [lastLoadedTime, setLastLoadedTime] = useState<string | null>(null);

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
        setLastTab(response.lastTab);
        setErrorMessage("");
        setTabInfoReady(true);
        return response.lastTab;
      } else {
        console.log("No last tab info available:", response?.error);
        setLastTab(null);
        setErrorMessage(response?.error || "No previous tab information available");
        setTabInfoReady(true);
        return null;
      }
    } catch (error) {
      console.error("Error fetching last tab:", error);
      setLastTab(null);
      setErrorMessage("Failed to retrieve last tab information");
      setTabInfoReady(true);
      return null;
    }
  };

  // Effect: Immediately fetch tab info when component mounts
  useEffect(() => {
    // Get version from manifest
    const manifest = chrome.runtime.getManifest();
    setVersion(manifest.version);

    // Immediately fetch last tab info when page loads
    console.log("Tab page loaded, immediately fetching last tab info");
    fetchLastTab();
    
    // Then set up regular polling for updates
    const regularPollingTimer = setInterval(fetchLastTab, 5000); // Poll every 5 seconds
    
    return () => {
      clearInterval(regularPollingTimer);
    };
  }, []);

  // Return to the last active tab
  const returnToLastTab = async () => {
    if (!lastTab) {
      console.log("Can't return to tab: No tab info available");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    
    try {
      console.log(`Attempting to focus tab ID: ${lastTab.id}`);
      
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
          await chrome.tabs.update(lastTab.id, { active: true });
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
    <div className="container two-panel-layout">
      <div className="header">
        <h1>Yeshie</h1>
        <div className="version-info">
          <div className="version">Version: {version}</div>
          {lastLoadedTime && (
            <div className="last-loaded">Last opened: {lastLoadedTime}</div>
          )}
        </div>
      </div>

      {/* Last active tab information - compact layout */}
      <div className="last-tab-info compact">
        <div className="last-tab-header">
          <h2>Last Active Tab</h2>
          {lastTab && (
            <button 
              onClick={returnToLastTab} 
              disabled={loading}
              className="return-button"
            >
              {loading ? "Returning..." : `Return to Tab`}
            </button>
          )}
        </div>
        
        {lastTab ? (
          <div className="last-tab-details compact">
            <div className="tab-detail-row">
              <span className="tab-title" title={lastTab.title}>{lastTab.title}</span>
              <span className="tab-id">ID: {lastTab.id}</span>
            </div>
            <div className="tab-detail-row">
              <span className="tab-domain" title={lastTab.url}>{getDomainFromUrl(lastTab.url)}</span>
              <span className="tab-time" title={formatTimestamp(lastTab.timestamp)}>
                Last active: {new Date(lastTab.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ) : (
          <p className="no-last-tab">
            {errorMessage || "No previous tab information available"}
          </p>
        )}
      </div>
      
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