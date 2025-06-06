import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendToBackground } from '@plasmohq/messaging';
import { storageGet, storageSet } from "../functions/storage"; // Import new storage functions
import { logInfo, logError, logWarn } from "../functions/logger";
import { APPLICATION_TABS_KEY } from '../background/tabHistory';

import { FiExternalLink, FiRefreshCw, FiTrash2, FiSave, FiXCircle } from 'react-icons/fi';


interface StoredApplicationTab {
  id: number;
  url?: string;
  title?: string;
  index?: number;
}

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
const SAVED_PAGES_KEY = 'yeshieSavedPages';

// URLs for key extension pages
const CONTROL_PAGE_URL = chrome.runtime.getURL('tabs/index.html');
const EXT_MANAGE_URL = `chrome://extensions/?id=${chrome.runtime.id}`;

// Default labels for known extension pages
const DEFAULT_EXTENSION_TAB_NAMES: Record<string, string> = {
  [CONTROL_PAGE_URL]: 'Yeshie Control',
  [EXT_MANAGE_URL]: 'Yeshie Extension Management'
};

// Normalize extension URLs for storage keys (strip query/hash for control page)
const normalizeUrl = (url: string): string => {
  if (url.startsWith(CONTROL_PAGE_URL)) return CONTROL_PAGE_URL;
  if (url.startsWith(EXT_MANAGE_URL)) return EXT_MANAGE_URL;
  return url;
};

// Helper to check for restricted URLs
// const isRestrictedUrl = (url: string | undefined): boolean => {
//     if (!url) return true; // No URL means we can't analyze
//     return url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://');
//     // Add other patterns like chrome web store if needed
// };

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

  // --- Cross Profile State ---
  const [profileName, setProfileName] = useState<string>("unknown");

  const [otherProfiles, setOtherProfiles] = useState<Record<string, Record<string, StoredApplicationTab[]>>>({});
  const [collapsedProfiles, setCollapsedProfiles] = useState<Record<string, boolean>>({});
  const [collapsedWindows, setCollapsedWindows] = useState<Record<string, boolean>>({});

  // Apply profile data to local state
  const applyProfileData = useCallback(
    (
      profilesMap: Record<string, Record<string, StoredApplicationTab[]>>,
      current: string
    ) => {
      setGroupedTabs(profilesMap[current] || {});
      const others = { ...profilesMap };
      delete others[current];
      setOtherProfiles(others);
    },
    []
  );


  // Get the extension's tab ID when the component mounts
  useEffect(() => {
    chrome.tabs.getCurrent(async tab => {
      if (tab?.id) {
        setExtensionTabId(tab.id);
      } else {
        logWarn("TabList", "chrome.tabs.getCurrent failed, falling back to background message");
        try {
          const response = await sendToBackground<{ tabId: number }>({ name: "getTabId" });
          if (response?.tabId && response.tabId > 0) {
            setExtensionTabId(response.tabId);
            return;
          }
          logError("TabList", "Background getTabId returned invalid id", { response });
        } catch (err) {
          logError("TabList", "Error fetching tab ID from background", { error: err });
        }
      }
    });
    // Cleanup timer on unmount
    return () => {
      if (switchBackTimerRef.current) {
        clearTimeout(switchBackTimerRef.current);
      }
    }
  }, []);

  // Fetch profile info and listen for cross-profile updates
  useEffect(() => {
    const fetchData = async () => {
      let currentProfileName = profileName;
      
      try {
        const nameRes = await sendToBackground<{}, { profile: string }>({ name: "getProfileName" })
        if (nameRes?.profile) {
          setProfileName(nameRes.profile)
          currentProfileName = nameRes.profile;
        }
      } catch (err) {
        logError("TabList", "Failed to get profile name", { error: err })
      }

      try {
        const profRes = await sendToBackground<{}, { profiles: Record<string, Record<string, StoredApplicationTab[]>> }>({ name: "getProfiles" })
        if (profRes?.profiles) applyProfileData(profRes.profiles, currentProfileName)
      } catch (err) {
        logError("TabList", "Failed to get profiles", { error: err })
      }
    }

    const handleMsg = (msg: any) => {
      if (msg.type === "PROFILE_TABS_UPDATE" && msg.profiles) {
        applyProfileData(msg.profiles as Record<string, Record<string, StoredApplicationTab[]>>, profileName)
      }
    }

    fetchData()
    chrome.runtime.onMessage.addListener(handleMsg)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMsg)
    }
  }, [profileName, applyProfileData])

  // Load custom names from storage on mount
  useEffect(() => {
      // Load Tab Names
      storageGet<CustomNameMap>(TAB_NAMES_STORAGE_KEY).then(loadedNames => {
          const normalized: CustomNameMap = { ...DEFAULT_EXTENSION_TAB_NAMES };
          if (loadedNames) {
              for (const [u, n] of Object.entries(loadedNames)) {
                  normalized[normalizeUrl(u)] = n;
              }
          }
          setCustomTabNames(normalized);
          setTabInputValues(normalized);
          logInfo('TabList', 'storage_get: TAB_NAMES_STORAGE_KEY', { key: TAB_NAMES_STORAGE_KEY, found: !!loadedNames, count: Object.keys(normalized).length });
          logInfo("TabList", "Loaded custom tab names", { loadedNames: normalized });
      }).catch(error => {
          logError("TabList", "Error loading custom tab names", { error });
          logError('TabList', 'storage_error: loadCustomTabNames', { operation: 'loadCustomTabNames', key: TAB_NAMES_STORAGE_KEY, error: String(error) });
          setCustomTabNames({}); // Default to empty on error
      });

      // Load Window Names
      storageGet<WindowNameMap>(WINDOW_NAMES_STORAGE_KEY).then(loadedNames => { 
          setCustomWindowNames(loadedNames || {});
          setWindowInputValues(loadedNames || {}); 
          logInfo('TabList', 'storage_get: WINDOW_NAMES_STORAGE_KEY', { key: WINDOW_NAMES_STORAGE_KEY, found: !!loadedNames, count: loadedNames ? Object.keys(loadedNames).length : 0 });
          logInfo("TabList", "Loaded custom window names", { loadedNames });
      }).catch(error => {
          logError("TabList", "Error loading custom window names", { error });
          logError('TabList', 'storage_error: loadCustomWindowNames', { operation: 'loadCustomWindowNames', key: WINDOW_NAMES_STORAGE_KEY, error: String(error) });
      setCustomWindowNames({}); // Default to empty on error
      });

  }, []);

  // Load profile info and listen for cross profile updates
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const profResp = await sendToBackground<{ profile: string }>({ name: "getProfileName" });
        if (profResp?.profile) {
          setProfileName(profResp.profile);
        }
        const profilesResp = await sendToBackground<{ profiles: Record<string, Record<string, StoredApplicationTab[]>> }>({ name: "getProfiles" });
        if (profilesResp?.profiles) {
          const others = { ...profilesResp.profiles };
          delete others[profResp?.profile || profileName];
          setOtherProfiles(others);
        }
      } catch (err) {
        logError("TabList", "Failed fetching profiles", { error: err });
      }
    };

    fetchProfiles();

    const handleMessage = (msg: any) => {
      if (msg && msg.type === "PROFILE_TABS_UPDATE" && msg.profiles) {
        const others = { ...msg.profiles };
        delete others[profileName];
        setOtherProfiles(others);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [profileName]);

  useEffect(() => {
    const loadGroupedTabs = async () => {
      setIsLoading(true);
      try {
        // Fetch the grouped structure { windowId: [tab, tab], ... }
        const storedGroupedTabs = await storageGet<Record<string, StoredApplicationTab[]>>(APPLICATION_TABS_KEY) || {};
        
        // The list per window should already be sorted by index from the background script
        setGroupedTabs(storedGroupedTabs); 
        logInfo('TabList', 'Loaded grouped tabs from storage', { storedGroupedTabs });
      } catch (error) {
        logError('TabList', 'Error loading grouped tabs from storage', { error });
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
        logInfo('TabList', 'Updated grouped tabs via storage listener', { storedGroupedTabs });
      }

      // Handle Tab Name Changes
      if (changes[TAB_NAMES_STORAGE_KEY]) {
          const loadedNames = (changes[TAB_NAMES_STORAGE_KEY].newValue as CustomNameMap) || {};
          const normalized: CustomNameMap = { ...DEFAULT_EXTENSION_TAB_NAMES };
          for (const [u, n] of Object.entries(loadedNames)) {
            normalized[normalizeUrl(u)] = n;
          }
          setCustomTabNames(normalized);
          setTabInputValues(normalized);
          logInfo('TabList', 'storage_change: TAB_NAMES_STORAGE_KEY', { key: TAB_NAMES_STORAGE_KEY, updated: true });
          logInfo('TabList', 'Custom tab names updated via listener', { loadedNames: normalized });
      }

      // Handle Window Name Changes
      if (changes[WINDOW_NAMES_STORAGE_KEY]) {
          const loadedNames = (changes[WINDOW_NAMES_STORAGE_KEY].newValue as WindowNameMap) || {};
          setCustomWindowNames(loadedNames);
          setWindowInputValues(loadedNames); 
          logInfo('TabList', 'storage_change: WINDOW_NAMES_STORAGE_KEY', { key: WINDOW_NAMES_STORAGE_KEY, updated: true });
          logInfo('TabList', 'Custom window names updated via listener', { loadedNames });
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
              .then(() => logInfo("TabList", `Debounced storage set successful for key: ${key}`))
              .catch(err => logError("TabList", `Debounced storage set failed for key: ${key}`, { error: err }));
      }, 500), // Debounce time of 500ms
      [] // Dependencies array is empty
  );

  // Function to save a custom TAB name
  const saveCustomTabName = (url: string | undefined, name: string) => {
      if (!url) return;
      const finalName = name.trim();
      const key = normalizeUrl(url);

      setCustomTabNames(prevNames => {
          const updatedNames = { ...prevNames };
          if (finalName === '') {
             delete updatedNames[key];
          } else {
             updatedNames[key] = finalName;
          }
          setTabInputValues(prev => ({ ...prev, [key]: finalName }));
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
      logInfo('TabList', `Switched to tab ${tabId}`);
      return switchedTab;
    } catch (error) {
      logError('TabList', `Error switching to tab ${tabId}:`, { error });
      return null;
    }
  };

  const navigateBack = () => {
      if (!extensionTabId) {
          logError('TabList', "Extension tab ID unknown, cannot switch back.");
          return;
      }
      logInfo('TabList', `Switching back to extension tab ${extensionTabId}.`);
      chrome.tabs.update(extensionTabId, { active: true }, (extTab) => {
          if (!chrome.runtime.lastError && extTab?.windowId) {
              chrome.windows.update(extTab.windowId, { focused: true });
          }
      });
  };

  const handleVisitReturn = async (tabId: number) => {
    logInfo('TabList', 'User clicked "Visit & Return" button', { 
      tabId, 
      action: 'visit_return_tab'
    });
    const switched = await navigateToTab(tabId);
    if (switched && extensionTabId) { // Only set timer if switch succeeded and we can return
        const SWITCH_BACK_DELAY = 1000; // 1 second
        switchBackTimerRef.current = setTimeout(navigateBack, SWITCH_BACK_DELAY);
    }
  };

  const handleVisitStay = async (tabId: number) => {
    logInfo('TabList', 'User clicked "Visit & Stay" button', { 
      tabId, 
      action: 'visit_stay_tab'
    });
    await navigateToTab(tabId); // Just navigate, no return timer
  };

  const handleCloseTab = async (windowId: string, tabId: number) => {
    logInfo('TabList', 'User clicked "Close Tab" button', { 
      windowId, 
      tabId, 
      action: 'close_tab'
    });
    try {
      await chrome.tabs.remove(tabId);
      setGroupedTabs(prev => {
        const updated = { ...prev };
        updated[windowId] = (prev[windowId] || []).filter(t => t.id !== tabId);
        return updated;
      });

      const stored = (await storageGet<Record<string, StoredApplicationTab[]>>(APPLICATION_TABS_KEY)) || {};
      if (stored[windowId]) {
        stored[windowId] = stored[windowId].filter(t => t.id !== tabId);
        await storageSet(APPLICATION_TABS_KEY, stored);
      }
      logInfo('TabList', `Closed tab ${tabId}`);
    } catch (error) {
      logError('TabList', `Failed to close tab ${tabId}`, { error });
    }
  };


  const handleSaveAndCloseTab = async (windowId: string, tab: StoredApplicationTab) => {
    logInfo('TabList', 'User clicked "Save and Close Tab" button', { 
      windowId, 
      tabId: tab.id, 
      action: 'save_and_close_tab'
    });
    try {
      const saved = (await storageGet<StoredApplicationTab[]>(SAVED_PAGES_KEY)) || [];
      saved.push(tab);
      await storageSet(SAVED_PAGES_KEY, saved);
      await chrome.tabs.remove(tab.id);

      setGroupedTabs(prev => {
        const updated = { ...prev };
        updated[windowId] = (prev[windowId] || []).filter(t => t.id !== tab.id);
        return updated;
      });

      const stored = (await storageGet<Record<string, StoredApplicationTab[]>>(APPLICATION_TABS_KEY)) || {};
      if (stored[windowId]) {
        stored[windowId] = stored[windowId].filter(t => t.id !== tab.id);
        await storageSet(APPLICATION_TABS_KEY, stored);
      }

      logInfo('TabList', `Saved and closed tab ${tab.id}`);

    } catch (error) {
      logError('TabList', `Failed to save and close tab ${tab.id}`, { error });
    }
  };

  const handleCloseWindow = async (windowId: string) => {
    logInfo('TabList', 'User clicked "Close Window" button', { 
      windowId, 
      action: 'close_window'
    });
    try {
      await chrome.windows.remove(Number(windowId));
      logInfo('TabList', `Closed window ${windowId}`);
    } catch (error) {
      logError('TabList', `Failed to close window ${windowId}`, { error });
    }
  };

  const handleSaveWindow = async (windowId: string) => {
    logInfo('TabList', 'User clicked "Save Window" button', { 
      windowId, 
      action: 'save_window'
    });
    try {
      const tabs = groupedTabs[windowId] || [];
      const saved = (await storageGet<StoredApplicationTab[]>(SAVED_PAGES_KEY)) || [];
      saved.push(...tabs);
      await storageSet(SAVED_PAGES_KEY, saved);
      logInfo('TabList', `Saved window ${windowId}`);
      await chrome.windows.remove(Number(windowId));
    } catch (error) {
      logError('TabList', `Failed to save window ${windowId}`, { error });
    }
  };

  // --- Collapse Helpers ---

  const toggleProfile = (prof: string) => {
    logInfo('TabList', 'User clicked to toggle profile', { 
      profileName: prof, 
      action: 'toggle_profile_collapse'
    });
    setCollapsedProfiles(prev => ({ ...prev, [prof]: !prev[prof] }));
  };

  const toggleWindow = (prof: string, windowId: string) => {
    logInfo('TabList', 'User clicked to toggle window', { 
      profileName: prof, 
      windowId, 
      action: 'toggle_window_collapse'
    });
    const key = `${prof}-${windowId}`;
    setCollapsedWindows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- Event Handlers for Editable Names ---
  
  // TAB Name Handlers
  const handleTabNameKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>, url: string | undefined) => {
      if (!url) return;
      const key = normalizeUrl(url);
      if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur(); // Trigger blur to save
      } else if (event.key === 'Escape') {
          // Restore original value on Escape
          setTabInputValues(prev => ({ ...prev, [key]: customTabNames[key] || '' }));
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
          const windowKey = `${profileName}-${windowId}`;
          const collapsed = collapsedWindows[windowKey];
          const windowDisplayName = windowInputValues[windowId] !== undefined
                ? windowInputValues[windowId]
                : (customWindowNames[windowId] || `Window ${windowId}`);
          
          return (
            <div key={windowId} className="window-group"> {/* Add class for styling */} 
              <h3
                id={`window-header-${windowId}`}
                className="window-header"
                contentEditable={true}
                suppressContentEditableWarning={true}
                onClick={() => toggleWindow(profileName, windowId)}
                onKeyDown={(e) => handleWindowNameKeyDown(e, windowId)}
                onBlur={(e) => handleWindowNameBlur(e, windowId)}
                key={`${windowId}-header`}
              >
                  {windowDisplayName} <span className="collapse-indicator">{collapsed ? '+' : '-'}</span>
                  <span className="window-actions">
                    <button className="tab-button" data-tooltip="Save window" aria-label="Save window" onClick={() => handleSaveWindow(windowId)}>
                      <FiSave />
                    </button>
                    <button className="tab-button" data-tooltip="Close window" aria-label="Close window" onClick={() => handleCloseWindow(windowId)}>
                      <FiXCircle />
                    </button>
                  </span>
              </h3>
              {!collapsed && tabsInWindow && tabsInWindow.length > 0 ? (
                  <ul className="tablist-ul">
                    {tabsInWindow.map((tab, index) => {
                       const urlKey = tab.url ? normalizeUrl(tab.url) : '';
                       const tabDisplayName = tabInputValues[urlKey] !== undefined
                            ? tabInputValues[urlKey]
                            : (customTabNames[urlKey] || DEFAULT_EXTENSION_TAB_NAMES[urlKey] || tab.title || tab.url || 'Unknown Tab');
                      const shortUrl = tab.url && tab.url.length > 100
                        ? `${tab.url.slice(0, 100)}...`
                        : tab.url
                      return (
                        <li key={tab.id} data-tooltip={`ID: ${tab.id}\nIndex: ${tab.index}\nURL: ${shortUrl}`} className="tab-item">
                          {/* Use index within the window group for display number */}
                          <span className="tab-number">{`${index + 1}:`}</span> 
                          <button
                              id={`visit-return-${index}`}
                              className="tab-button visit-return"
                              onClick={() => handleVisitReturn(tab.id)}
                              data-tooltip="Visit & Return"
                              aria-label="Visit & Return"
                              disabled={tab.id === -1}
                          >
                              <FiRefreshCw />

                          </button>
                          <button
                              id={`visit-stay-${index}`}
                              className="tab-button visit-stay"
                              onClick={() => handleVisitStay(tab.id)}
                              data-tooltip="Visit & Stay"
                              aria-label="Visit & Stay"
                              disabled={tab.id === -1}
                          >
                              <FiExternalLink />

                          </button>
                          <button
                              id={`close-${tab.id}`}
                              className="tab-button"
                              onClick={() => handleCloseTab(windowId, tab.id)}
                              data-tooltip="Close Tab"
                              aria-label="Close Tab"
                              disabled={tab.id === -1}
                          >
                              <FiTrash2 />
                          </button>
                          <button
                              id={`save-close-${tab.id}`}
                              className="tab-button"
                              onClick={() => handleSaveAndCloseTab(windowId, tab)}
                              data-tooltip="Save and Close Tab"
                              aria-label="Save and Close Tab"
                              disabled={tab.id === -1}
                          >
                              <FiSave />
                          </button>
                          <span
                            id={`tab-name-${tab.id}`}
                            className={`tab-name ${customTabNames[urlKey] ? 'custom-name' : ''}`}
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
              ) : !collapsed ? (
                  <p>No tabs found in this window.</p>
              ) : null}
            </div>
          )
        })
        )}
        {Object.entries(otherProfiles).map(([prof, windows]) => {
          const collapsedP = collapsedProfiles[prof];
          return (
            <div key={prof} className="profile-group">
              <h2 className="profile-header" onClick={() => toggleProfile(prof)}>
                {prof} <span className="collapse-indicator">{collapsedP ? '+' : '-'}</span>
              </h2>
              {!collapsedP && Object.keys(windows).map(wid => {
                const wTabs = windows[wid];
                const wKey = `${prof}-${wid}`;
                const winCollapsed = collapsedWindows[wKey];
                return (
                  <div key={wKey} className="window-group">
                    <h3 className="window-header" onClick={() => toggleWindow(prof, wid)}>
                      Window {wid} <span className="collapse-indicator">{winCollapsed ? '+' : '-'}</span>
                    </h3>
                    {!winCollapsed && (
                      <ul className="tablist-ul">
                        {wTabs.map((t, i) => (
                          <li key={t.id} className="tab-item">
                            <span className="tab-number">{`${i + 1}:`}</span>
                            <span className="tab-name">{t.title || t.url || 'Unknown Tab'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
};

export default TabList; 