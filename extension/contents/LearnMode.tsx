import React, { useState, useEffect, useRef } from 'react'
import { toggleRecording } from '../functions/learn'
import { storageGet, storageSet } from "../functions/storage"
import { logInfo, logError, logDebug } from "../functions/logger"
// import type { PlasmoCSConfig } from "plasmo" // Removed config
 
// Removed Plasmo config as this is now a standard component
// export const config: PlasmoCSConfig = {
//   matches: ["<all_urls>"],
//   all_frames: true
// }

// Debug logging for module load
logInfo("LearnMode", "LearnMode.tsx component module loaded", { timestamp: new Date().toISOString() });

const styles = {
  toast: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    padding: '12px 20px',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    zIndex: 2147483647,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '300px'
  }
} as const

export default function LearnMode() { // Renamed component export for clarity
  logInfo("LearnMode", "LearnMode component initializing");
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  
  // Function to toggle the Yeshie sidebar by simulating the keyboard shortcut
  const toggleYeshieSidebar = async () => {
    try {
      logInfo("LearnMode", "Ensuring Yeshie sidebar is open...");
      
      // Get current state from storage
      const isOpenKey = "isOpen" + window.location.hostname
      const currentIsOpen = await storageGet<boolean>(isOpenKey) || false
      
      logInfo("LearnMode", `Current sidebar state is: ${currentIsOpen ? 'open' : 'closed'}`);
      
      if (!currentIsOpen) {
        // Directly update the storage value to open the sidebar
        await storageSet(isOpenKey, true)
        logInfo("LearnMode", "Opened Yeshie sidebar via storage update")
        
        // Also dispatch an event to trigger any listeners
        // This simulates pressing Ctrl+Shift+Y
        const yEvent = new KeyboardEvent('keydown', {
          key: 'y',
          code: 'KeyY',
          shiftKey: true,
          ctrlKey: true,
          metaKey: navigator.platform.includes('Mac'),
          bubbles: true
        });
        logInfo("LearnMode", "Dispatching simulated Ctrl+Shift+Y event");
        document.dispatchEvent(yEvent);
        
        // Verify the storage update
        const updatedIsOpen = await storageGet(isOpenKey);
        logInfo("LearnMode", `Verified sidebar state after update: ${updatedIsOpen ? 'open' : 'still closed'}`);
      } else {
        logInfo("LearnMode", "Sidebar already open, no action needed");
      }
    } catch (error) {
      logError("LearnMode", "Error toggling Yeshie sidebar", { error });
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError("LearnMode", "Error in toggleYeshieSidebar", { operation: 'toggleYeshieSidebar', error: errorMessage });
    }
  }

  // Effect for handling keyboard shortcuts
  useEffect(() => {
    logDebug("LearnMode", "Setting up key event listener for Ctrl+Shift+L", undefined);

    const handleKey = (e: KeyboardEvent) => {
      logDebug("LearnMode", "Key pressed", { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey }); // Log any keydown
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        logInfo("LearnMode", "Ctrl+Shift+L DETECTED. Sending toggle message to background.", undefined); // More prominent log
        e.preventDefault();
        e.stopPropagation();

        // Send message to background to toggle recording state
        chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING_FROM_SHORTCUT" }, (response) => {
            if (chrome.runtime.lastError) {
                logError("LearnMode:", "Error sending toggle shortcut message", { error: chrome.runtime.lastError.message });
            } else {
                logInfo("LearnMode","Toggle shortcut message sent successfully.", { response }); // Log success
            }
        });
      } else {
          // Log if the key combination didn't match
          // logDebug("LearnMode: Keypress did not match shortcut"); // Can be noisy
      }
    };

    window.addEventListener("keydown", handleKey, true);

    return () => {
      logDebug("LearnMode", "Removing keydown listener", undefined);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, []);

  logInfo("LearnMode", "LearnMode component rendered");
  return (
    <div className="yeshie-ui">
      {toast && (
        <div style={styles.toast}>
          {toast}
        </div>
      )}
    </div>
  )
} 