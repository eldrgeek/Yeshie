import React, { useState, useEffect, useRef } from 'react';
import { storageGet, storageSet } from "../functions/storage"; // Import new storage functions
import { log } from "../functions/DiagnosticLogger"; // Assuming DiagnosticLogger is setup

interface TabInfo {
  id: number;
  title?: string;
  url?: string;
}

interface CustomNameMap { // Type for our custom names storage
    [url: string]: string;
}

const STORAGE_KEY = 'yeshieTabCustomNames'; // Key for chrome.storage

// Helper to check for restricted URLs
const isRestrictedUrl = (url: string | undefined): boolean => {
    if (!url) return true; // No URL means we can't analyze
    return url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://');
    // Add other patterns like chrome web store if needed
};

// Define message types for communication with content script
// interface StayMessage {
//   type: 'STAY_ON_TAB';
//   tabId: number;
// }

// interface RemoveOverlayMessage {
//     type: 'REMOVE_STAY_OVERLAY';
//     tabId: number;
// }

// type ContentScriptMessage = StayMessage | RemoveOverlayMessage;

const TabList: React.FC = () => {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [extensionTabId, setExtensionTabId] = useState<number | null>(null);
  const switchBackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [customNames, setCustomNames] = useState<CustomNameMap>({}); // Persistent names

  // Get the extension's tab ID when the component mounts
  useEffect(() => {
    chrome.tabs.getCurrent(tab => {
      if (tab?.id) {
        setExtensionTabId(tab.id);
      } else {
        console.error("Could not get current tab ID. Switch-back may not work.");
      }
    });
    // Cleanup timer on unmount
    return () => {
      if (switchBackTimerRef.current) {
        clearTimeout(switchBackTimerRef.current);
      }
    }
  }, []);

  // Load custom names from storage on mount
  useEffect(() => {
      storageGet<CustomNameMap>(STORAGE_KEY).then(loadedNames => { // Use storageGet
          setCustomNames(loadedNames || {});
          log('storage_get', { key: STORAGE_KEY, found: !!loadedNames, count: loadedNames ? Object.keys(loadedNames).length : 0 });
          console.log("Loaded custom names:", loadedNames || {});
      }).catch(error => {
          console.error("Error loading custom names:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          log('storage_error', { operation: 'loadCustomNames', key: STORAGE_KEY, error: errorMessage });
          setCustomNames({}); // Default to empty on error
      });
  }, []);

  // Fetch tabs
  useEffect(() => {
    chrome.tabs.query({}, (result) => {
      const tabData = result.map(tab => ({
        id: tab.id!,
        title: tab.title,
        url: tab.url,
      }));
      setTabs(tabData);
    });
  }, []);

  // Function to save a custom name (updates customNames, storage, AND inputValues)
  const saveCustomName = (url: string | undefined, name: string) => {
      if (!url) return;
      const finalName = name.trim(); // Processed name (trimmed)
      
      // Update persistent state (customNames) and storage
      setCustomNames(prevNames => {
          const updatedNames = { ...prevNames };
          if (finalName === '') {
             delete updatedNames[url];
             console.log(`Removing custom name for ${url}`);
          } else {
             updatedNames[url] = finalName;
             console.log(`Setting custom name for ${url} to ${finalName}`);
          }
          
          storageSet(STORAGE_KEY, updatedNames).then(() => { // Use storageSet
              log('storage_set', { key: STORAGE_KEY, action: finalName ? 'set' : 'remove', url: url });
          }).catch(error => {
              console.error("Error saving custom names:", error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              log('storage_error', { operation: 'saveCustomName', key: STORAGE_KEY, error: errorMessage });
              // Optional: Could add logic here to revert state if save failed
              // For simplicity, we currently don't revert the local state optimistic update
          });
          return updatedNames;
      });
  };

  // --- Action Handlers ---

  const clearSwitchBackTimer = () => {
    if (switchBackTimerRef.current) {
      clearTimeout(switchBackTimerRef.current);
      switchBackTimerRef.current = null;
    }
  };

  const navigateToTab = async (tabId: number): Promise<chrome.tabs.Tab | null> => {
    clearSwitchBackTimer();
    if (tabId === extensionTabId) return null; // Don't navigate away from self

    try {
      await chrome.tabs.update(tabId, { active: true });
      const switchedTab = await chrome.tabs.get(tabId);
      if (switchedTab?.windowId) {
        await chrome.windows.update(switchedTab.windowId, { focused: true });
      }
      console.log(`Switched to tab ${tabId}`);
      return switchedTab;
    } catch (error) {
      console.error(`Error switching to tab ${tabId}:`, error);
      return null;
    }
  };

  const navigateBack = () => {
      if (!extensionTabId) {
          console.error("Extension tab ID unknown, cannot switch back.");
          return;
      }
      console.log(`Switching back to extension tab ${extensionTabId}.`);
      chrome.tabs.update(extensionTabId, { active: true }, (extTab) => {
          if (!chrome.runtime.lastError && extTab?.windowId) {
              chrome.windows.update(extTab.windowId, { focused: true });
          }
      });
  };

  const handleVisitReturn = async (tabId: number) => {
    const switched = await navigateToTab(tabId);
    if (switched && extensionTabId) { // Only set timer if switch succeeded and we can return
        const SWITCH_BACK_DELAY = 1000; // 1 second
        switchBackTimerRef.current = setTimeout(navigateBack, SWITCH_BACK_DELAY);
    }
  };

  const handleVisitStay = async (tabId: number) => {
    await navigateToTab(tabId); // Just navigate, no return timer
  };

  const handleAnalyze = async (tabId: number, tabUrl: string | undefined) => {
    if (!tabUrl || isRestrictedUrl(tabUrl)) {
        console.warn("Analyze called on restricted or invalid URL.");
        return;
    }
    if (!extensionTabId) {
        console.error("Extension ID needed to return after analyze.");
        return;
    }

    console.log(`Analyzing tab ${tabId}...`);
    const switched = await navigateToTab(tabId);
    if (!switched) return; // Don't proceed if switch failed

    // Allow a moment for the page to potentially render/stabilize slightly
    await new Promise(resolve => setTimeout(resolve, 200)); 

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/getHtml.js'] 
      });

      if (results && results.length > 0 && results[0].result) {
          const htmlContent = results[0].result as string;
          await navigator.clipboard.writeText(htmlContent);
          console.log(`HTML content of tab ${tabId} copied to clipboard.`);
          // Optional: Show a success message/toast here
      } else {
          console.error("Failed to get HTML content from content script.", results);
          // Optional: Show an error message/toast here
      }
    } catch (err) {
      console.error(`Error injecting script or getting HTML for tab ${tabId}:`, err);
      // Optional: Show an error message/toast here
    } finally {
        // Navigate back regardless of success/failure of analysis
        navigateBack(); 
    }
  };

  const handleNameKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>, url: string | undefined) => {
      if (event.key === 'Enter') {
          event.preventDefault(); // Prevent potential line break in contentEditable
          event.currentTarget.blur(); // Trigger blur to save
      }
  };

  const handleNameBlur = (event: React.FocusEvent<HTMLSpanElement>, url: string | undefined) => {
      saveCustomName(url, event.currentTarget.textContent || '');
  };

  return (
    <div className="tab-list-container">
      <h2>Open Tabs</h2>
      <ul className="tab-list">
        {tabs.map((tab, index) => {
          const url = tab.url;
          // Determine the base title: Check for self, then Custom Name > API Title > URL > Fallback
          let baseTitle: string;
          if (tab.id === extensionTabId) {
              baseTitle = "Yeshie Commander";
          } else {
              baseTitle = customNames[url || ''] || tab.title || url || 'Unknown Tab';
          }
          const isRestricted = isRestrictedUrl(url) || (!tab.title && !url); // Check if analysis should be disabled

          return (
            <li key={tab.id} className={`tab-item`}>
              <span className="tab-number">{`${index + 1}:`}</span>
              <button 
                  className="tab-button visit-return" 
                  onClick={() => handleVisitReturn(tab.id)}
                  title="Visit & Return"
              >
                  VR
              </button>
              <button 
                  className="tab-button visit-stay" 
                  onClick={() => handleVisitStay(tab.id)}
                  title="Visit & Stay"
              >
                  VS
              </button>
              <button 
                  className="tab-button analyze" 
                  onClick={() => handleAnalyze(tab.id, url)}
                  disabled={isRestricted}
                  title={isRestricted ? "Cannot analyze restricted page" : "Analyze Page (Copy HTML)"}
              >
                  Analyze
              </button>
              <span 
                className="tab-name"
                contentEditable={true}
                suppressContentEditableWarning={true}
                onClick={(e) => e.stopPropagation()} // Prevent li click
                onKeyDown={(e) => handleNameKeyDown(e, url)}
                onBlur={(e) => handleNameBlur(e, url)}
                // Set initial content using key prop trick or dangerouslySetInnerHTML if needed
                // Using key forces re-render if baseTitle changes, simpler than dangerouslySetInnerHTML
                key={`${tab.id}-name`}
              >
                {baseTitle} 
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default TabList; 