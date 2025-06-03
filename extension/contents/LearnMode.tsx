import React, { useState, useEffect, useRef } from 'react'
import { toggleRecording } from '../functions/learn'
import { storageGet, storageSet } from "../functions/storage"
import { logInfo, logError, logDebug } from "../functions/logger"
import { startRecording, stopRecording, type RecordedEvent } from "../functions/passiveRecorder"
import AnnotationDialog, { type Step } from "../components/AnnotationDialog"
import { saveLearnedStep } from "../functions/learnedSteps"
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
    bottom: '70px',
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
    top: '100px',
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
    bottom: '120px',
    left: '20px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    zIndex: 2147483647,
    maxWidth: '400px',
    maxHeight: '200px',
    overflow: 'auto'
  }
} as const

interface LearnModeProps {
  isRecording?: boolean
  recordedSteps?: RecordedEvent[]
  onClearSteps?: () => void
}

export default function LearnMode({ 
  isRecording = false, 
  recordedSteps = [], 
  onClearSteps 
}: LearnModeProps) {
  logInfo("LearnMode", "LearnMode component initializing");
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  
  // Local state for annotation dialog
  const [showAnnotationDialog, setShowAnnotationDialog] = useState(false)

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null)
      }, 3000) // Clear after 3 seconds

      return () => clearTimeout(timer)
    }
  }, [toast])

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

  // New function to handle saving a learned step
  const handleSaveLearnedStep = async (name: string, description: string, parameterizedSteps: Step[]) => {
    try {
      const hostname = window.location.hostname
      const success = await saveLearnedStep(hostname, name, description, parameterizedSteps)
      
      if (success) {
        // Close dialog and show success message
        setShowAnnotationDialog(false)
        onClearSteps?.() // Clear steps in parent component
        setToast(`✅ Saved step sequence "${name}" for ${hostname}`)
        
        logInfo("LearnMode", `Successfully saved learned step: ${name}`, { 
          hostname, 
          stepsCount: parameterizedSteps.length,
          description 
        })
      } else {
        setToast("❌ Error saving step sequence")
      }

    } catch (error) {
      logError("LearnMode", "Error saving learned step", { error, name, hostname: window.location.hostname })
      setToast("❌ Error saving step sequence")
    }
  }

  logInfo("LearnMode", "LearnMode component rendered");
  return (
    <div className="yeshie-ui">
      {/* Recording controls - show when recording or when steps are available */}
      {(isRecording || recordedSteps.length > 0) && !showAnnotationDialog && (
        <div style={styles.recordingControls}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Yeshie Recorder</h3>
          
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            {isRecording 
              ? "🔴 Recording... Press Cmd+Shift+R to stop" 
              : `📹 ${recordedSteps.length} events recorded`
            }
          </div>
          
          {recordedSteps.length > 0 && !isRecording && (
            <div style={{ marginTop: '10px' }}>
              <button
                style={{ ...styles.button, ...styles.startButton }}
                onClick={() => setShowAnnotationDialog(true)}
              >
                Annotate Steps
              </button>
              <button
                style={styles.button}
                onClick={onClearSteps}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Annotation Dialog */}
      {showAnnotationDialog && recordedSteps.length > 0 && (
        <AnnotationDialog
          steps={recordedSteps}
          onSave={handleSaveLearnedStep}
          onCancel={() => setShowAnnotationDialog(false)}
        />
      )}

      {/* Display recorded events (only show when not annotating) */}
      {recordedSteps.length > 0 && !showAnnotationDialog && (
        <div style={styles.eventsDisplay}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Recorded Events:</h4>
          <pre style={{ fontSize: '10px', margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(recordedSteps, null, 2)}
          </pre>
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