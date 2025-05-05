import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendToBackground } from '@plasmohq/messaging';
import { storageGet, storageSet } from "../functions/storage"; // Import new storage functions
import { log } from "../functions/DiagnosticLogger"; // Assuming DiagnosticLogger is setup
import { APPLICATION_TABS_KEY, type StoredApplicationTab } from '../background/tabHistory';

interface TabInfo {
  id: number;
  title?: string;
  url?: string;
}

interface CustomNameMap { // Type for our custom names storage
    [url: string]: string;
}

// Type for custom window names
interface WindowNameMap {
    [windowId: string]: string;
}

// Define Control Tab details here (Ideally move to shared constants later)
// const CONTROL_TAB_URL = chrome.runtime.getURL("tabs/index.html"); // No longer needed here
// const CONTROL_TAB_TITLE = "Yeshie Control"; // No longer needed here

const TAB_NAMES_STORAGE_KEY = 'yeshieTabCustomNames'; // Key for chrome.storage
const WINDOW_NAMES_STORAGE_KEY = 'yeshieWindowCustomNames'; // New key for window names

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
  // State for the grouped tabs: { windowId: [tab1, tab2], ... }
  const [groupedTabs, setGroupedTabs] = useState<Record<string, StoredApplicationTab[]>>({}); 
  const [isLoading, setIsLoading] = useState(true);
  const [extensionTabId, setExtensionTabId] = useState<number | null>(null);
  const switchBackTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for custom tab names
  const [customTabNames, setCustomTabNames] = useState<CustomNameMap>({}); 
  const [tabInputValues, setTabInputValues] = useState<{[url: string]: string}>({}); 

  // State for custom window names
  const [customWindowNames, setCustomWindowNames] = useState<WindowNameMap>({});
  const [windowInputValues, setWindowInputValues] = useState<{[windowId: string]: string}>({});

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
      // Load Tab Names
      storageGet<CustomNameMap>(TAB_NAMES_STORAGE_KEY).then(loadedNames => { 
          setCustomTabNames(loadedNames || {});
          setTabInputValues(loadedNames || {}); 
          log('storage_get', { key: TAB_NAMES_STORAGE_KEY, found: !!loadedNames, count: loadedNames ? Object.keys(loadedNames).length : 0 });
          console.log("Loaded custom tab names:", loadedNames || {});
      }).catch(error => {
          console.error("Error loading custom tab names:", error);
          log('storage_error', { operation: 'loadCustomTabNames', key: TAB_NAMES_STORAGE_KEY, error: String(error) });
          setCustomTabNames({}); // Default to empty on error
      });

      // Load Window Names
      storageGet<WindowNameMap>(WINDOW_NAMES_STORAGE_KEY).then(loadedNames => { 
          setCustomWindowNames(loadedNames || {});
          setWindowInputValues(loadedNames || {}); 
          log('storage_get', { key: WINDOW_NAMES_STORAGE_KEY, found: !!loadedNames, count: loadedNames ? Object.keys(loadedNames).length : 0 });
          console.log("Loaded custom window names:", loadedNames || {});
      }).catch(error => {
          console.error("Error loading custom window names:", error);
          log('storage_error', { operation: 'loadCustomWindowNames', key: WINDOW_NAMES_STORAGE_KEY, error: String(error) });
          setCustomWindowNames({}); // Default to empty on error
      });

  }, []);

  useEffect(() => {
    const loadGroupedTabs = async () => {
      setIsLoading(true);
      try {
        // Fetch the grouped structure { windowId: [tab, tab], ... }
        const storedGroupedTabs = await storageGet<Record<string, StoredApplicationTab[]>>(APPLICATION_TABS_KEY) || {};
        
        // The list per window should already be sorted by index from the background script
        setGroupedTabs(storedGroupedTabs); 
        console.log('TabList: Loaded grouped tabs from storage:', storedGroupedTabs);
      } catch (error) {
        console.error('TabList: Error loading grouped tabs from storage:', error);
        setGroupedTabs({}); // Set to empty object on error
      } finally {
        setIsLoading(false);
      }
    };

    loadGroupedTabs(); // Load initially

    // --- Listener for storage changes ---
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return; 

      // Handle Tab List Changes
      if (changes[APPLICATION_TABS_KEY]) {
        const storedGroupedTabs = changes[APPLICATION_TABS_KEY].newValue as Record<string, StoredApplicationTab[]> | undefined || {};
        // Data should already be grouped and sorted by background script
        setGroupedTabs(storedGroupedTabs);
        console.log('TabList: Updated grouped tabs via storage listener:', storedGroupedTabs);
      }

      // Handle Tab Name Changes
      if (changes[TAB_NAMES_STORAGE_KEY]) {
          const loadedNames = (changes[TAB_NAMES_STORAGE_KEY].newValue as CustomNameMap) || {};
          setCustomTabNames(loadedNames);
          setTabInputValues(loadedNames); 
          log('storage_change', { key: TAB_NAMES_STORAGE_KEY, updated: true });
          console.log('TabList: Custom tab names updated via listener', loadedNames);
      }

      // Handle Window Name Changes
      if (changes[WINDOW_NAMES_STORAGE_KEY]) {
          const loadedNames = (changes[WINDOW_NAMES_STORAGE_KEY].newValue as WindowNameMap) || {};
          setCustomWindowNames(loadedNames);
          setWindowInputValues(loadedNames); 
          log('storage_change', { key: WINDOW_NAMES_STORAGE_KEY, updated: true });
          console.log('TabList: Custom window names updated via listener', loadedNames);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []); // Run only on mount

  // --- Debounce Helper ---
  function debounce<F extends (...args: any[]) => any>(
      func: F,
      waitFor: number
  ): (...args: Parameters<F>) => void {
      let timeoutId: NodeJS.Timeout | null = null;
      return (...args: Parameters<F>): void => {
          if (timeoutId) {
              clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
              timeoutId = null;
              func(...args);
          }, waitFor);
      };
  }

  // Debounced storage set function
  const debouncedStorageSet = useCallback(
      debounce((key: string, value: any) => {
          storageSet(key, value)
              .then(() => console.log(`Debounced storage set successful for key: ${key}`))
              .catch(err => console.error(`Debounced storage set failed for key: ${key}`, err));
      }, 500), // Debounce time of 500ms
      [] // Dependencies array is empty
  );

  // Function to save a custom TAB name
  const saveCustomTabName = (url: string | undefined, name: string) => {
      if (!url) return;
      const finalName = name.trim(); 
      
      setCustomTabNames(prevNames => {
          const updatedNames = { ...prevNames };
          if (finalName === '') {
             delete updatedNames[url];
          } else {
             updatedNames[url] = finalName;
          }
          setTabInputValues(prev => ({ ...prev, [url]: finalName })); 
          debouncedStorageSet(TAB_NAMES_STORAGE_KEY, updatedNames); 
          return updatedNames;
      });
  };

  // Function to save a custom WINDOW name
  const saveCustomWindowName = (windowId: string, name: string) => {
      const finalName = name.trim();
      setCustomWindowNames(prevNames => {
          const updatedNames = { ...prevNames };
           if (finalName === '' || finalName === `Window ${windowId}`) { // Remove if empty or default
               delete updatedNames[windowId];
               // Also reset input value if reverting to default
               if (finalName === `Window ${windowId}`) {
                   setWindowInputValues(prev => ({ ...prev, [windowId]: `Window ${windowId}` }));
               }
           } else {
               updatedNames[windowId] = finalName;
           }
           // Update input value regardless of save/delete
           if (finalName !== `Window ${windowId}`) { // Only sync input if it's not the default we just set
               setWindowInputValues(prev => ({ ...prev, [windowId]: finalName }));
           }
           debouncedStorageSet(WINDOW_NAMES_STORAGE_KEY, updatedNames);
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

  // --- Event Handlers for Editable Names ---
  
  // TAB Name Handlers
  const handleTabNameKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>, url: string | undefined) => {
      if (!url) return;
      if (event.key === 'Enter') {
          event.preventDefault(); 
          event.currentTarget.blur(); // Trigger blur to save
      } else if (event.key === 'Escape') {
          // Restore original value on Escape
          setTabInputValues(prev => ({ ...prev, [url]: customTabNames[url] || '' }));
          event.currentTarget.blur();
      }
  };

  const handleTabNameBlur = (event: React.FocusEvent<HTMLSpanElement>, url: string | undefined) => {
      saveCustomTabName(url, event.currentTarget.textContent || '');
  };

  // WINDOW Name Handlers
  const handleWindowNameKeyDown = (event: React.KeyboardEvent<HTMLHeadingElement>, windowId: string) => {
      if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
      } else if (event.key === 'Escape') {
          const defaultName = `Window ${windowId}`;
          setWindowInputValues(prev => ({ ...prev, [windowId]: customWindowNames[windowId] || defaultName }));
          event.currentTarget.blur();
      }
  };

  const handleWindowNameBlur = (event: React.FocusEvent<HTMLHeadingElement>, windowId: string) => {
      saveCustomWindowName(windowId, event.currentTarget.textContent || '');
  };

  if (isLoading) {
    return <div className="tablist-loading">Loading tabs...</div>; // Add a class for styling
  }

  const windowIds = Object.keys(groupedTabs).sort((a,b) => parseInt(a) - parseInt(b)); // Sort window IDs numerically

  return (
    <div className="tablist-container"> {/* Add a class for styling */}
      <h2>Open Tabs By Window</h2>
      {windowIds.length === 0 ? (
        <p>No application tabs found.</p>
      ) : (
        windowIds.map(windowId => {
          const tabsInWindow = groupedTabs[windowId];
          const windowDisplayName = windowInputValues[windowId] !== undefined 
                ? windowInputValues[windowId] 
                : (customWindowNames[windowId] || `Window ${windowId}`);
          
          return (
            <div key={windowId} className="window-group"> {/* Add class for styling */} 
              <h3 
                className="window-header" // Add class for styling
                contentEditable={true}
                suppressContentEditableWarning={true}
                onClick={(e) => e.stopPropagation()} 
                onKeyDown={(e) => handleWindowNameKeyDown(e, windowId)}
                onBlur={(e) => handleWindowNameBlur(e, windowId)}
                key={`${windowId}-header`}
              >
                  {windowDisplayName}
              </h3>
              {tabsInWindow && tabsInWindow.length > 0 ? (
                  <ul className="tablist-ul"> 
                    {tabsInWindow.map((tab, index) => {
                       const tabDisplayName = tabInputValues[tab.url] !== undefined 
                            ? tabInputValues[tab.url] 
                            : (customTabNames[tab.url] || tab.title || tab.url || 'Unknown Tab');
                      return (
                        <li key={tab.id} title={`ID: ${tab.id}\nIndex: ${tab.index}\nURL: ${tab.url}`} className="tab-item">
                          {/* Use index within the window group for display number */}
                          <span className="tab-number">{`${index + 1}:`}</span> 
                          <button 
                              className="tab-button visit-return" 
                              onClick={() => handleVisitReturn(tab.id)}
                              title="Visit & Return"
                              disabled={tab.id === -1} // Disable actions for placeholder control tab if needed
                          >
                              VR
                          </button>
                          <button 
                              className="tab-button visit-stay" 
                              onClick={() => handleVisitStay(tab.id)}
                              title="Visit & Stay"
                              disabled={tab.id === -1} 
                          >
                              VS
                          </button>
                          <button 
                              className="tab-button analyze" 
                              onClick={() => handleAnalyze(tab.id, tab.url)}
                              disabled={isRestrictedUrl(tab.url) || (!tab.title && !tab.url) || tab.id === -1}
                              title={isRestrictedUrl(tab.url) ? "Cannot analyze restricted page" : "Analyze Page (Copy HTML)"}
                          >
                              Analyze
                          </button>
                          <span 
                            className={`tab-name ${customTabNames[tab.url] ? 'custom-name' : ''}`}
                            contentEditable={tab.id !== -1} // Don't allow editing placeholder control tab name
                            suppressContentEditableWarning={true}
                            onClick={(e) => e.stopPropagation()} 
                            onKeyDown={(e) => handleTabNameKeyDown(e, tab.url)}
                            onBlur={(e) => handleTabNameBlur(e, tab.url)}
                            key={`${tab.id}-name`}
                          >
                            {tabDisplayName}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
              ) : (
                  <p>No tabs found in this window.</p> // Should ideally not happen if window has ID
              )}
            </div>
          )
        })
      )}
    </div>
  );
};

export default TabList; 