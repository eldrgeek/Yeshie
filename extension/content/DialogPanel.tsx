import React, { useState, useEffect } from 'react'

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


export default function YeshieUI() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault()
        
        if (isProcessing) return
        
        setIsProcessing(true)
        // Send message to background script to toggle recording state
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                const tabId = tabs[0].id;
                console.log(`YeshieUI: Sending toggle command to background for tab ${tabId}`);
                chrome.runtime.sendMessage({ 
                    type: "TOGGLE_RECORDING_STATE", 
                    payload: { tabId } 
                })
                .then(response => {
                    console.log("YeshieUI: Background response to TOGGLE_RECORDING_STATE:", response);
                    if (response?.success) {
                      if (response.isNowRecording) {
                          setToast(response.message || "Learn mode started.");
                      } else if (response.result) {
                          const { result } = response;
                          const actionCount = result._meta?.actionCount || 0;
                          const message = `Learned "${result.procedureName}" with ${actionCount} actions. Result copied to clipboard.`;
                          setToast(message);
                      } else {
                           setToast(response.message || "Learn session ended.");
                      }
                    } else {
                        setToast(response?.message || "Failed to toggle learn mode.");
                         console.error("YeshieUI: Error toggling learn mode via background:", response?.error);
                    }
                    setTimeout(() => setToast(null), 3000); 
                })
                .catch(err => {
                    console.error("YeshieUI: Error sending message to background:", err);
                    setToast("Error communicating with background script");
                    setTimeout(() => setToast(null), 2000);
                })
                 .finally(() => {
                    console.log("YeshieUI: Learn mode toggle message sent/processed");
                    setIsProcessing(false); 
                 });
            } else {
                console.error("YeshieUI: Could not get active tab ID.");
                setToast("Could not identify the current tab.");
                setIsProcessing(false);
            }
        });
      }
    }
    
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isProcessing])

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
