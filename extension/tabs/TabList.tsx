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
  const [appTabs, setAppTabs] = useState<StoredApplicationTab[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [extensionTabId, setExtensionTabId] = useState<number | null>(null);
  const switchBackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [customNames, setCustomNames] = useState<CustomNameMap>({}); // Persistent names
  const [inputValues, setInputValues] = useState<{[url: string]: string}>({}); // Track input values separately for controlled editing

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
          setInputValues(loadedNames || {}); // Initialize input values with stored names
          log('storage_get', { key: STORAGE_KEY, found: !!loadedNames, count: loadedNames ? Object.keys(loadedNames).length : 0 });
          console.log("Loaded custom names:", loadedNames || {});
      }).catch(error => {
          console.error("Error loading custom names:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          log('storage_error', { operation: 'loadCustomNames', key: STORAGE_KEY, error: errorMessage });
          setCustomNames({}); // Default to empty on error
      });
  }, []);

  useEffect(() => {
    const loadTabs = async () => {
      setIsLoading(true);
      try {
        const storedTabs = await storageGet<StoredApplicationTab[]>(APPLICATION_TABS_KEY) || [];
        setAppTabs(storedTabs);
        console.log('TabList: Loaded tabs from storage:', storedTabs);
      } catch (error) {
        console.error('TabList: Error loading tabs from storage:', error);
        // Handle error display if needed
      } finally {
        setIsLoading(false);
      }
    };

    loadTabs(); // Load initially

    // --- Listener for storage changes ---
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[APPLICATION_TABS_KEY]) {
        const newTabs = changes[APPLICATION_TABS_KEY].newValue as StoredApplicationTab[] | undefined || [];
        setAppTabs(newTabs);
        console.log('TabList: Updated tabs via storage listener:', newTabs);
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
          
          setInputValues(prev => ({ ...prev, [url]: finalName })); // Keep input values in sync
          debouncedStorageSet(STORAGE_KEY, updatedNames); // Use debounced set
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
      } else if (event.key === 'Escape') {
          // Restore original value on Escape
          setInputValues(prev => ({ ...prev, [url]: customNames[url] || '' }));
          event.currentTarget.blur();
      }
  };

  const handleNameBlur = (event: React.FocusEvent<HTMLSpanElement>, url: string | undefined) => {
      saveCustomName(url, event.currentTarget.textContent || '');
  };

  if (isLoading) {
    return <div className="tablist-loading">Loading tabs...</div>; // Add a class for styling
  }

  return (
    <div className="tablist-container"> {/* Add a class for styling */}
      <h2>Open Tabs</h2>
      {appTabs.length === 0 ? (
        <p>No application tabs found.</p>
      ) : (
        <ul className="tablist-ul"> {/* Add a class for styling */}
          {appTabs.map((tab, index) => (
            <li key={tab.id} title={`ID: ${tab.id}\nURL: ${tab.url}`} className="tab-item"> 
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
                  onClick={() => handleAnalyze(tab.id, tab.url)}
                  disabled={isRestrictedUrl(tab.url) || (!tab.title && !tab.url)}
                  title={isRestrictedUrl(tab.url) ? "Cannot analyze restricted page" : "Analyze Page (Copy HTML)"}
              >
                  Analyze
              </button>
              <span 
                className={`tab-name ${customNames[tab.url] ? 'custom-name' : ''}`}
                contentEditable={true}
                suppressContentEditableWarning={true}
                onClick={(e) => e.stopPropagation()} // Prevent li click
                onKeyDown={(e) => handleNameKeyDown(e, tab.url)}
                onBlur={(e) => handleNameBlur(e, tab.url)}
                key={`${tab.id}-name`}
              >
                {inputValues[tab.url] !== undefined ? inputValues[tab.url] : (customNames[tab.url] || tab.title || tab.url || 'Unknown Tab')} 
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TabList; 