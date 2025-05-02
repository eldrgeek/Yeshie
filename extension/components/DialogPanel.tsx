import React, { useState, useEffect } from 'react'
import { toggleLearnMode } from '../functions/learn'
import { Storage } from "@plasmohq/storage"
// import type { PlasmoCSConfig } from "plasmo" // Removed config
 
// Removed Plasmo config as this is now a standard component
// export const config: PlasmoCSConfig = {
//   matches: ["<all_urls>"],
//   all_frames: true
// }

// Debug logging for module load
console.log("DialogPanel.tsx component module loaded at", new Date().toISOString());

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

export default function DialogPanel() { // Renamed component export for clarity
  console.log("DialogPanel component initializing");
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  
  // Function to toggle the Yeshie sidebar by simulating the keyboard shortcut
  const toggleYeshieSidebar = async () => {
    try {
      console.log("DialogPanel: Ensuring Yeshie sidebar is open...");
      
      // Get current state from storage
      const storage = new Storage({ area: "local" })
      const isOpenKey = "isOpen" + window.location.hostname
      const currentIsOpen = await storage.get(isOpenKey) || false
      
      console.log(`DialogPanel: Current sidebar state is: ${currentIsOpen ? 'open' : 'closed'}`);
      
      if (!currentIsOpen) {
        // Directly update the storage value to open the sidebar
        await storage.set(isOpenKey, true)
        console.log("DialogPanel: Opened Yeshie sidebar via storage update")
        
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
        console.log("DialogPanel: Dispatching simulated Ctrl+Shift+Y event");
        document.dispatchEvent(yEvent);
        
        // Verify the storage update
        const updatedIsOpen = await storage.get(isOpenKey);
        console.log(`DialogPanel: Verified sidebar state after update: ${updatedIsOpen ? 'open' : 'still closed'}`);
      } else {
        console.log("DialogPanel: Sidebar already open, no action needed");
      }
    } catch (error) {
      console.error("DialogPanel: Error toggling Yeshie sidebar:", error)
    }
  }

  useEffect(() => {
    console.log("DialogPanel: Setting up key event listener");
    
    const handleKey = (e: KeyboardEvent) => {
      // Check for Ctrl+Shift+L (or Cmd+Shift+L on Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        console.log("DialogPanel: Ctrl+Shift+L detected");
        e.preventDefault()
        
        // Don't process if already processing
        if (isProcessing) {
          console.log("DialogPanel: Already processing, ignoring keypress");
          return;
        }
        
        console.log("DialogPanel: Starting learn mode sequence");
        setIsProcessing(true)
        
        // First ensure the Yeshie sidebar is open
        toggleYeshieSidebar()
          .then(() => {
            console.log("DialogPanel: Sidebar toggle complete, calling toggleLearnMode()");
            // Then toggle learn mode
            return toggleLearnMode();
          })
          .then((response) => {
            console.log("DialogPanel: Learn mode toggle result:", response);
            if (response.success) {
              if (response.action === 'stop' && response.result) {
                const { result } = response;
                const actionCount = result._meta?.actionCount || 0;
                const message = `Learned "${result.procedureName}" with ${actionCount} actions. Result copied to clipboard.`;
                setToast(message);
              } else {
                setToast(response.message);
              }
            } else {
              setToast("Learn session ended.");
            }
            // Auto dismiss the toast after 2 seconds
            setTimeout(() => setToast(null), 2000);
          })
          .catch(err => {
            console.error("DialogPanel: Error in learn mode process:", err);
            setToast("Error in learn mode process");
            setTimeout(() => setToast(null), 2000);
          })
          .finally(() => {
            console.log("DialogPanel: Learn mode sequence completed");
            setIsProcessing(false);
          });
      }
    }
    
    console.log("DialogPanel: Adding keydown listener for Ctrl+Shift+L");
    window.addEventListener("keydown", handleKey)
    
    return () => {
      console.log("DialogPanel: Removing keydown listener");
      window.removeEventListener("keydown", handleKey)
    }
  }, [isProcessing])

  console.log("DialogPanel component rendered");
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