import React, { useState, useEffect, useRef } from 'react'
import { toggleRecording } from '../functions/learn'
import { storageGet, storageSet } from "../functions/storage"
import { logInfo, logError, logDebug } from "../functions/logger"
import { startRecording, stopRecording, type RecordedEvent } from "../functions/passiveRecorder"
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
  },
  recordingIndicator: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#f44336',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    zIndex: 2147483647,
    fontSize: '14px',
    fontWeight: 'bold'
  },
  recordingControls: {
    position: 'fixed',
    top: '60px',
    right: '20px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    zIndex: 2147483647,
    minWidth: '200px'
  },
  button: {
    padding: '8px 16px',
    margin: '4px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  startButton: {
    backgroundColor: '#4CAF50',
    color: 'white'
  },
  stopButton: {
    backgroundColor: '#f44336',
    color: 'white'
  },
  eventsDisplay: {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    zIndex: 2147483647,
    maxWidth: '400px',
    maxHeight: '300px',
    overflow: 'auto'
  }
} as const

export default function LearnMode() { // Renamed component export for clarity
  logInfo("LearnMode", "LearnMode component initializing");
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  
  // New state for passive recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordedSteps, setRecordedSteps] = useState<RecordedEvent[]>([])

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

  // New function to start recording
  const handleStartRecording = () => {
    try {
      startRecording()
      setIsRecording(true)
      setRecordedSteps([])
      setToast("📹 Recording started! Interact with the page, then click Stop.")
      logInfo("LearnMode", "Passive recording started")
    } catch (error) {
      logError("LearnMode", "Error starting recording", { error })
      setToast("Error starting recording")
    }
  }

  // New function to stop recording
  const handleStopRecording = () => {
    try {
      const steps = stopRecording()
      setRecordedSteps(steps)
      setIsRecording(false)
      setToast(`📹 Recording stopped! Captured ${steps.length} events.`)
      logInfo("LearnMode", "Passive recording stopped", { eventsCount: steps.length })
    } catch (error) {
      logError("LearnMode", "Error stopping recording", { error })
      setToast("Error stopping recording")
    }
  }

  // Effect for handling keyboard shortcuts
  useEffect(() => {
    logDebug("LearnMode", "Setting up key event listener for Ctrl+Shift+L", undefined);

    const handleKey = (e: KeyboardEvent) => {
      // Check if user is currently typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]')
      );

      // Skip keyboard shortcuts if user is typing
      if (isTyping) {
        return;
      }

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
      }
      // New shortcut for passive recording (Ctrl+Shift+R)
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        logInfo("LearnMode", "Ctrl+Shift+R DETECTED. Toggling passive recording.", undefined);
        e.preventDefault();
        e.stopPropagation();

        if (isRecording) {
          handleStopRecording();
        } else {
          handleStartRecording();
        }
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
  }, [isRecording]); // Added isRecording to dependency array

  logInfo("LearnMode", "LearnMode component rendered");
  return (
    <div className="yeshie-ui">
      {/* Recording indicator */}
      {isRecording && (
        <div style={styles.recordingIndicator}>
          🔴 Recording... Interact with the page, then click Stop.
        </div>
      )}

      {/* Recording controls - show when not recording or when recording */}
      {(isRecording || recordedSteps.length > 0) && (
        <div style={styles.recordingControls}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Yeshie Recorder</h3>
          
          {!isRecording ? (
            <button
              style={{ ...styles.button, ...styles.startButton }}
              onClick={handleStartRecording}
            >
              Start Recording
            </button>
          ) : (
            <button
              style={{ ...styles.button, ...styles.stopButton }}
              onClick={handleStopRecording}
            >
              Stop Recording
            </button>
          )}
          
          {recordedSteps.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <p style={{ margin: '5px 0', fontSize: '12px' }}>
                Recorded {recordedSteps.length} events
              </p>
              <button
                style={styles.button}
                onClick={() => setRecordedSteps([])}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Display recorded events */}
      {recordedSteps.length > 0 && (
        <div style={styles.eventsDisplay}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Recorded Events:</h4>
          <pre style={{ fontSize: '10px', margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(recordedSteps, null, 2)}
          </pre>
          {/* TODO: Add annotation UI here */}
          <div style={{ marginTop: '10px', padding: '5px', backgroundColor: '#f0f0f0', fontSize: '12px' }}>
            TODO: Add annotation UI here
          </div>
        </div>
      )}

      {/* Existing toast */}
      {toast && (
        <div style={styles.toast}>
          {toast}
        </div>
      )}
    </div>
  )
} 