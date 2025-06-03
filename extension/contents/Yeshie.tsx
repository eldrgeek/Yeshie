import iconBase64 from "data-base64:~assets/icon.png"
import "../content/safeActionListener"

import cssTextBase from "data-text:../css/google-sidebar-base.css"
import cssText from "data-text:../css/google-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { setupCS } from "../functions/extcomms"
import { Stepper, getOrCreateInstanceId } from "../functions/Stepper"
import { sendToBackground } from "@plasmohq/messaging"
import YeshieEditor from "../components/YeshieEditor"
import "../css/google-sidebar-base.css"
import { createRoot } from "react-dom/client"
import { rememberCurrentTab, attemptTabFocusWithRetries, storedTabId } from "../functions/tabFocus"
import ReportsPanel from "../components/ReportsPanel"
import { storageGet, storageSet, storageGetAll } from "../functions/storage"
import { logInfo, logWarn, logError } from "../functions/logger"
import { 
  getSliderMode, 
  getSliderVisibility, 
  setSliderVisibility,
  type SliderMode 
} from "../functions/globalSettings"
import GlobalKeyboardListener from "./GlobalKeyboardListener"
import { startRecording, stopRecording, type RecordedEvent } from "../functions/passiveRecorder"
import { getLearnedStepsSummary } from "../functions/inspectStorage"

// Remember current tab as soon as possible
rememberCurrentTab().then(tabId => {
  if (tabId) {
    // Use setTimeout to ensure logger is initialized
    setTimeout(() => {
      logInfo("YeshieContent", `Tab ID ${tabId} will be restored after extension loads`);
    }, 100);
  }
});

// Initialize content script communications
const extcommsListener = setupCS();

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
  run_at: "document_end"
}

// Inject into the ShadowDOM
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const isMatchingURL = (pattern: string) => {
  const currentURL = new URL(window.location.href)
  const patternURL = new URL(pattern.replace('*', ''), currentURL.origin)
  const cordURL = new URL("https://docs.cord.com")
  const currentMatch = currentURL.hostname === patternURL.hostname && currentURL.pathname.startsWith(patternURL.pathname)
  const cordMatch = currentURL.hostname === cordURL.hostname && currentURL.pathname.startsWith(cordURL.pathname)
  return currentMatch || cordMatch
}

export const getShadowHostId = () => "plasmo-google-sidebar"

interface TabContext {
  url: string
  content: string
  mode: string
}

// Debounce function
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

const Yeshie: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [sliderMode, setSliderMode] = useState<SliderMode>('overlay')
  const isOpenKey = "isOpen" + window.location.hostname
  const [isReady, setIsReady] = useState(false)
  const [tabId, setTabId] = useState<number | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [context, setContext] = useState<TabContext | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const [contextInvalidated, setContextInvalidated] = useState(false)
  const initCalled = useRef(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showReportsPanel, setShowReportsPanel] = useState(false)
  const [reportCount, setReportCount] = useState(0)

  // Global recording state - managed here since Yeshie is always mounted
  const [isRecording, setIsRecording] = useState(false)
  const [recordedSteps, setRecordedSteps] = useState<RecordedEvent[]>([])

  // Event handlers to prevent keyboard/input events from bubbling to parent page
  // Must be defined early to maintain hooks order consistency
  const handleSidebarKeyEvent = useCallback((event: React.KeyboardEvent) => {
    if (isOpen) {
      // Prevent keyboard events from bubbling up to the parent page
      event.stopPropagation();
      logInfo("YeshieContent", "Prevented keyboard event from bubbling to parent page", { 
        key: event.key, 
        type: event.type 
      });
    }
  }, [isOpen]);

  const handleSidebarEvent = useCallback((event: React.SyntheticEvent) => {
    if (isOpen) {
      event.stopPropagation();
    }
  }, [isOpen]);

  // Load global settings on mount, with fallback to per-hostname for visibility
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load global slider mode
        const globalSliderMode = await getSliderMode();
        setSliderMode(globalSliderMode);
        
        // Try global visibility first, fallback to per-hostname
        try {
          const globalVisibility = await getSliderVisibility();
          setIsOpen(globalVisibility);
          logInfo('YeshieContent', 'Loaded global settings', { 
            sliderMode: globalSliderMode, 
            visibility: globalVisibility 
          });
        } catch (globalError) {
          // Fallback to per-hostname visibility
          const hostVisibility = await storageGet<boolean>(isOpenKey);
          setIsOpen(hostVisibility ?? false);
          logInfo('YeshieContent', 'Fallback to hostname visibility', { 
            key: isOpenKey, 
            visibility: hostVisibility ?? false 
          });
        }
      } catch (error) {
        logError("YeshieContent", "Error loading settings", { error });
        setSliderMode('overlay');
        setIsOpen(false);
      }
    };

    loadSettings();
  }, [isOpenKey]);

  // Listen for storage changes to sync settings across tabs
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return;

      if (changes.yeshie_slider_visibility) {
        const newVisibility = changes.yeshie_slider_visibility.newValue;
        if (newVisibility !== undefined) {
          setIsOpen(newVisibility);
          logInfo('YeshieContent', 'Slider visibility updated from storage', { visibility: newVisibility });
        }
      }

      if (changes.yeshie_slider_mode) {
        const newMode = changes.yeshie_slider_mode.newValue;
        if (newMode !== undefined) {
          setSliderMode(newMode);
          logInfo('YeshieContent', 'Slider mode updated from storage', { mode: newMode });
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const updateIsOpen = useCallback(async (newIsOpen: boolean) => {
    logInfo("YeshieContent", `User toggled sidebar: ${isOpen ? 'open' : 'closed'} → ${newIsOpen ? 'open' : 'closed'}`, { 
      previousState: isOpen, 
      newState: newIsOpen, 
      url: window.location.href 
    });
    setIsOpen(newIsOpen)
    
    try {
      // Try to update global visibility first
      await setSliderVisibility(newIsOpen);
      logInfo('YeshieContent', 'Updated global slider visibility', { visibility: newIsOpen });
    } catch (globalError) {
      logWarn('YeshieContent', 'Failed to update global visibility, using hostname fallback', { error: globalError });
      // Fallback to per-hostname storage
      try {
        await storageSet(isOpenKey, newIsOpen)
        logInfo('YeshieContent', 'Updated hostname visibility fallback', { key: isOpenKey, value: newIsOpen })
      } catch (error) {
        logError("YeshieContent", `Error setting state for ${isOpenKey}`, { error });
      }
    }
  }, [isOpenKey, isOpen]);

  const updateContext = useCallback(async (newContextPart: Partial<TabContext>) => {
    if (tabId === null) {
      logWarn("YeshieContent", "updateContext called before tabId was set.")
      return
    }
    const contextKey = `tabContext:${tabId}`

    setContext(prevContext => {
      const currentContext = prevContext || { url: window.location.href, content: "", mode: "llm" }
      const updated = { ...currentContext, ...newContextPart } as TabContext

      (async () => {
        try {
          await storageSet(contextKey, updated)
          logInfo('YeshieContent', 'storage_set: contextKey', { key: contextKey, tabId: tabId })
          logInfo("YeshieContent", `Context updated and saved for tab ${tabId}`, { context: updated })
        } catch (error) {
          logError("YeshieContent", `Failed to save context for tab ${tabId}`, { error })
          const errorMessage = error instanceof Error ? error.message : String(error)
          logError('YeshieContent', 'storage_error: updateContext', { operation: 'updateContext', key: contextKey, tabId: tabId, error: errorMessage })
        }
      })()

      return updated
    })
  }, [tabId])

  const debouncedUpdateContext = useCallback(
    debounce((newContext: Partial<TabContext>) => updateContext(newContext), 1000),
    [updateContext]
  )

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data && event.data.type === "command") {
      logInfo("YeshieContent", "Received command from YeshieEditor", { commandData: event.data });
      try {
        const result = await Stepper(event.data.command)
        logInfo("YeshieContent", "Command result", { result });
        window.postMessage({ 
          type: "commandResult", 
          command: event.data.command,
          result: result,
          timestamp: new Date().toISOString()
        }, "*")
      } catch (error) {
        logError("YeshieContent", "Error processing command", { error });
        window.postMessage({ 
          type: "commandResult", 
          command: event.data.command,
          result: null,
          error: error.message,
          timestamp: new Date().toISOString()
        }, "*")
      }
    }
  }, [])

  useEffect(() => {
    if (window.top !== window.self) {
      logInfo("YeshieContent", "Yeshie is in an iframe, not rendering")
      return
    }
    
    async function init() {
      if (initCalled.current) return 
      initCalled.current = true

      logInfo("YeshieContent", "Initializing Yeshie content script", { isOpen, isReady });
      try {
        const response = await sendToBackground({ name: "getTabId" })
        logInfo("YeshieContent", "Got tab ID response", { response });
        if (response && typeof response.tabId === 'number') {
          const currentTabId = response.tabId
          setTabId(currentTabId)
          setContextInvalidated(false) // Clear any previous invalidation state
          const contextKey = `tabContext:${currentTabId}`

          const storedContext = await storageGet<TabContext>(contextKey)
          logInfo('YeshieContent', 'storage_get: contextKey', { key: contextKey, found: storedContext !== undefined })

          if (storedContext) {
            setContext(storedContext)
          } else {
            const newContext: TabContext = {
              url: window.location.href,
              content: "",
              mode: "llm"
            }
            await storageSet(contextKey, newContext)
            logInfo('YeshieContent', 'storage_set: contextKey, Initializing', { key: contextKey, reason: 'Initializing new context' })
            setContext(newContext)
          }

          // Get session ID now that we have a valid tab ID
          try {
            const instanceId = await getOrCreateInstanceId(currentTabId)
            setSessionID(instanceId)
            logInfo("YeshieContent", "Session ID set", { sessionID: instanceId });
          } catch (sessionError) {
            logError("YeshieContent", "Error getting session ID", { error: sessionError });
            const errorMessage = sessionError instanceof Error ? sessionError.message : String(sessionError)
            logError('YeshieContent', 'session_error', { operation: 'getOrCreateInstanceId', error: errorMessage })
          }
        } else {
          logError("YeshieContent", "Invalid tab ID response", { response });
          setContextInvalidated(true);
        }
      } catch (error) {
        logError("YeshieContent", "Error during init (getTabId or context handling)", { error });
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        // Check if this is a context invalidation error
        if (errorMessage.includes('Extension context invalidated') || 
            errorMessage.includes('message port closed') ||
            errorMessage.includes('receiving end does not exist')) {
          logInfo("YeshieContent", "Detected context invalidation, will auto-reload when tab becomes active");
          setContextInvalidated(true);
          setToast("🔄 Extension reloaded. Page will refresh automatically when focused.");
          setTimeout(() => setToast(null), 5000);
        } else {
          logError('YeshieContent', 'init_error: getTabId/context', { step: 'getTabId/context', error: errorMessage })
        }
      }
    }

    init()

    // Check if body already exists (since we're running at document_end, it should)
    console.log("🔧 Checking if document.body exists:", !!document.body);
    if (document.body) {
      console.log("✅ Body exists, setting isReady to true");
      setIsReady(true)
      logInfo("YeshieContent", "Body already exists, Yeshie is ready to render")
    } else {
      console.log("⚠️ Body not found, setting up MutationObserver");
      // Fallback: use MutationObserver if body doesn't exist yet
      const observer = new MutationObserver((mutations, obs) => {
        const targetElement = document.querySelector('body')
        if (targetElement) {
          console.log("✅ Body found via observer, setting isReady to true");
          setIsReady(true)
          obs.disconnect()
          logInfo("YeshieContent", "Target element found via observer, Yeshie is ready to render")
        }
      })

      observer.observe(document, {
        childList: true,
        subtree: true
      })
    }

    // Add chrome.runtime.onMessage listener for recording control messages from background
    const handleRuntimeMessage = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      logInfo("YeshieContent", "Received runtime message", { type: message.type, payload: message.payload });

      if (message.type === 'START_RECORDING') {
        logInfo("YeshieContent", "Background requested recording start");
        handleStartRecording();
        sendResponse({ success: true });
        return false; // Sync response
      }

      if (message.type === 'STOP_RECORDING') {
        logInfo("YeshieContent", "Background requested recording stop");
        if (isRecording) {
          try {
            const steps = stopRecording();
            handleStopRecording(steps);
            sendResponse({ success: true, stepsCount: steps.length });
          } catch (error) {
            logError("YeshieContent", "Error stopping recording", { error });
            sendResponse({ success: false, error: error.message });
          }
        } else {
          logInfo("YeshieContent", "Not currently recording, ignoring stop request");
          sendResponse({ success: true, message: "Not recording" });
        }
        return false; // Sync response
      }

      if (message.type === 'TOGGLE_RECORDING_VIA_SHORTCUT') {
        logInfo("YeshieContent", "Background requested recording toggle via shortcut", { currentIsRecording: isRecording });
        
        if (isRecording) {
          try {
            const steps = stopRecording();
            handleStopRecording(steps);
            sendResponse({ success: true, action: 'stopped', stepsCount: steps.length });
          } catch (error) {
            logError("YeshieContent", "Error stopping recording via shortcut", { error });
            sendResponse({ success: false, error: error.message });
          }
        } else {
          try {
            handleStartRecording();
            sendResponse({ success: true, action: 'started' });
          } catch (error) {
            logError("YeshieContent", "Error starting recording via shortcut", { error });
            sendResponse({ success: false, error: error.message });
          }
        }
        return false; // Sync response
      }

      // Return false if we don't handle the message
      return false;
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    const handleKeyPress = (event: KeyboardEvent) => {
      // Check if user is currently typing in an input field
      const target = event.target as HTMLElement;
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

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'y') {
        event.preventDefault()
        logInfo("YeshieContent", `User pressed keyboard shortcut to toggle sidebar`, { 
          shortcut: "Cmd/Ctrl+Shift+Y", 
          currentState: isOpen,
          url: window.location.href 
        });
        updateIsOpen(!isOpen)
      }
      
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'z') {
        event.preventDefault()
        logInfo("YeshieContent", `User pressed keyboard shortcut to copy and clear logs`, { 
          shortcut: "Cmd/Ctrl+Shift+Z",
          url: window.location.href 
        });
        
        // Get logs and copy to clipboard
        (async () => {
          try {
            const response = await sendToBackground({ name: "getLogsAndClear" as any });
            
            if (!response?.success) {
              setToast("❌ Failed to get logs");
              setTimeout(() => setToast(null), 3000);
              return;
            }
            
            const logs = response?.logs || [];
            
            if (logs.length === 0) {
              setToast("📋 No logs to copy");
              setTimeout(() => setToast(null), 3000);
              return;
            }
            
            // Use the pre-formatted clipboard text from background script
            if (response.clipboardText) {
              await navigator.clipboard.writeText(response.clipboardText);
            }
            
            setToast(`📋 Copied ${logs.length} logs to clipboard and cleared session`);
            setTimeout(() => setToast(null), 3000);
            
          } catch (error) {
            logError("YeshieContent", "Failed to copy logs to clipboard", { error });
            setToast("❌ Failed to copy logs");
            setTimeout(() => setToast(null), 3000);
          }
        })();
      }
      
      if (event.key === 'Escape' && isOpen) {
        // Only handle Escape if not in an input field (already checked above)
        logInfo("YeshieContent", `User pressed Escape key while sidebar open`, { 
          action: "blur_and_focus_page",
          url: window.location.href 
        });
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
          
          const pageInput = document.querySelector('input, textarea, [contenteditable="true"]') as HTMLElement
          if (pageInput && pageInput.closest('.yeshie-editor') === null) {
            pageInput.focus()
          }
        }
      }
    }

    const handleUrlChange = () => {
      updateContext({ url: window.location.href })
    }

    document.addEventListener('keydown', handleKeyPress)
    window.addEventListener("message", handleMessage)
    window.addEventListener('popstate', handleUrlChange)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener("message", handleMessage)
      window.removeEventListener('popstate', handleUrlChange)
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
    }
  }, [handleMessage, updateContext, isOpen, updateIsOpen])

  useEffect(() => {
    if (document.body && isReady) {
      // Remove existing classes
      document.body.classList.remove(
        "plasmo-google-sidebar-show", 
        "plasmo-google-sidebar-overlay", 
        "plasmo-google-sidebar-push-content"
      );
      
      if (isOpen) {
        document.body.classList.add("plasmo-google-sidebar-show");
        if (sliderMode === 'push-content') {
          document.body.classList.add("plasmo-google-sidebar-push-content");
        } else {
          document.body.classList.add("plasmo-google-sidebar-overlay");
        }
      }
    }
  }, [isOpen, isReady, sliderMode])

  useEffect(() => {
    const style = document.createElement("style")
    const styleContent: string = cssText + "\n" + cssTextBase
    style.textContent = styleContent
    document.head.appendChild(style)
    
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  useEffect(() => {
    if (isReady && storedTabId) {
      console.log("Extension is ready, attempting to restore tab focus to:", storedTabId)
      attemptTabFocusWithRetries(storedTabId)
    }
  }, [isReady])

  useEffect(() => {
    if (isReady) {
      storageGetAll().then(allData => {
        const reports = Object.entries(allData)
            .filter(([key, value]) => key.startsWith('reports'))
            .flatMap(([key, value]) => Array.isArray(value) ? value : [])
        logInfo('YeshieContent', 'storage_get_all: report_count', { purpose: 'report_count', count: reports.length })
        setReportCount(reports?.length || 0)
      }).catch(error => {
         logError("YeshieContent", "Error loading report count", { error })
         const errorMessage = error instanceof Error ? error.message : String(error)
         logError('YeshieContent', 'storage_error: getReportCount', { operation: 'getReportCount', error: errorMessage })
         setReportCount(0)
      })
    }
  }, [isReady])

  // Global recording handlers
  const handleStartRecording = useCallback(() => {
    logInfo("YeshieGlobal", "handleStartRecording called", { currentIsRecording: isRecording });
    
    // Prevent double-start
    if (isRecording) {
      logInfo("YeshieGlobal", "Already recording, ignoring start request");
      return;
    }

    try {
      // Start the actual recording service
      startRecording()
      
      // Update UI state
      setIsRecording(true)
      setRecordedSteps([])
      
      // Show toast notification instead of fixed banner
      setToast("🔴 Recording started! Click the stop button to finish.")
      
      logInfo("YeshieGlobal", "Recording service started and state updated to true")
    } catch (error) {
      logError("YeshieGlobal", "Error starting recording", { error })
      setToast("❌ Error starting recording")
      setTimeout(() => setToast(null), 3000)
      setIsRecording(false)
    }
  }, [isRecording])

  const handleStopRecording = useCallback((steps: RecordedEvent[]) => {
    logInfo("YeshieGlobal", "handleStopRecording called", { 
      currentIsRecording: isRecording, 
      stepsReceived: steps.length 
    });

    try {
      // Update UI state
      setIsRecording(false)
      setRecordedSteps(steps)
      
      // Show completion toast
      setToast(`✅ Recording stopped! Captured ${steps.length} steps.`)
      setTimeout(() => setToast(null), 3000)
      
      // Send steps to background for processing
      chrome.runtime.sendMessage({ 
        type: 'FORWARD_RECORDED_STEPS', 
        payload: { steps } 
      }, (response) => {
        if (chrome.runtime.lastError) {
          logError("YeshieGlobal", "Error forwarding recorded steps", { 
            error: chrome.runtime.lastError.message 
          });
        } else {
          logInfo("YeshieGlobal", "Recorded steps forwarded to background successfully", { 
            stepsCount: steps.length,
            response 
          });
        }
      });
      
      logInfo("YeshieGlobal", "Recording stopped successfully", { stepsCount: steps.length });
    } catch (error) {
      logError("YeshieGlobal", "Error in handleStopRecording", { error });
      setToast("❌ Error stopping recording")
      setTimeout(() => setToast(null), 3000)
    }
  }, [isRecording])

  const handleStopRecordingButton = useCallback(() => {
    logInfo("YeshieGlobal", "Stop recording button clicked");
    
    if (!isRecording) {
      logInfo("YeshieGlobal", "Not currently recording, ignoring stop request");
      return;
    }

    try {
      const steps = stopRecording();
      handleStopRecording(steps);
    } catch (error) {
      logError("YeshieGlobal", "Error stopping recording via button", { error });
      setToast("❌ Error stopping recording")
      setTimeout(() => setToast(null), 3000)
    }
  }, [isRecording, handleStopRecording])

  const handleClearRecordedSteps = useCallback(() => {
    setRecordedSteps([])
    logInfo("YeshieGlobal", "Recorded steps cleared")
  }, [])

  // Help function to show storage information
  const showStorageHelp = useCallback(async () => {
    try {
      const summary = await getLearnedStepsSummary()
      alert(summary)
    } catch (error) {
      alert("Error loading learned steps information.")
    }
  }, [])

  // Debug function for keyboard testing
  const enableKeyboardDebug = useCallback(() => {
    logInfo("YeshieDebug", "Enabling keyboard debug for 30 seconds");
    
    const debugHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        logInfo("YeshieDebug", `Keyboard event: ${e.type} ${e.key}`, {
          ctrl: e.ctrlKey,
          meta: e.metaKey, 
          shift: e.shiftKey,
          key: e.key,
          target: (e.target as HTMLElement)?.tagName,
          defaultPrevented: e.defaultPrevented,
          currentRecordingState: isRecording
        });
      }
    };
    
    document.addEventListener('keydown', debugHandler, true);
    
    setTimeout(() => {
      document.removeEventListener('keydown', debugHandler, true);
      logInfo("YeshieDebug", "Keyboard debug disabled");
    }, 30000);
  }, [isRecording])

  // Show context invalidation notice if needed
  if (contextInvalidated) {
    return (
      <>
        {/* Global keyboard listener - ALWAYS active, even during context invalidation */}
        <GlobalKeyboardListener
          onRecordingStart={handleStartRecording}
          onRecordingStop={handleStopRecording}
          isRecording={isRecording}
        />
        
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: '#ff6b35',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 10000,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          maxWidth: '300px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            🔄 Extension Context Invalidated
          </div>
          <div style={{ marginBottom: '8px', fontSize: '12px' }}>
            The extension was reloaded. This page will auto-reload when you switch tabs and come back.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'white',
              color: '#ff6b35',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Reload Now
          </button>
        </div>
      </>
    );
  }

  if (!isReady) {
    console.log("Yeshie is not ready to render yet", { isReady, bodyExists: !!document.body })
    return (
      <>
        {/* Global keyboard listener - ALWAYS active, even when not ready */}
        <GlobalKeyboardListener
          onRecordingStart={handleStartRecording}
          onRecordingStop={handleStopRecording}
          isRecording={isRecording}
        />
      </>
    );
  }

  if (!document.body) {
    console.log("Body not found, not rendering Yeshie", { isReady, bodyExists: !!document.body })
    return (
      <>
        {/* Global keyboard listener - ALWAYS active, even without body */}
        <GlobalKeyboardListener
          onRecordingStart={handleStartRecording}
          onRecordingStop={handleStopRecording}
          isRecording={isRecording}
        />
      </>
    );
  }

  console.log("✅ Yeshie is ready to render!", { isReady, isOpen, tabId, bodyExists: !!document.body })

  return (
    <>
      {/* Global keyboard listener - ALWAYS active, regardless of UI state */}
      <GlobalKeyboardListener
        onRecordingStart={handleStartRecording}
        onRecordingStop={handleStopRecording}
        isRecording={isRecording}
      />
      
      <div id={getShadowHostId()}>
        {toast && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 2147483647,
            background: '#333',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '300px',
            wordWrap: 'break-word'
          }}>
            {toast}
          </div>
        )}
        
        <div
          id="yeshie-sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            flexDirection: "column",
            border: "2px solid #e2e8f0",
            boxShadow: "0 0 10px rgba(0, 0, 0, 0.1)"
          }}
          className={`${isOpen ? "open" : "closed"} ${sliderMode === 'overlay' ? 'overlay-mode' : 'push-content-mode'}`}
          onKeyDown={handleSidebarKeyEvent}
          onMouseDown={handleSidebarEvent}
          onTouchStart={handleSidebarEvent}
        >
          <img
            src={iconBase64}
            alt="Yeshie Icon"
            className="resizing-icon"
            width={16}
            height={16}
          />
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            flex: 1,
            overflow: 'hidden',
            width: '100%'
          }}>
            <div style={{ height: '100%', width: '100%' }}>
              <YeshieEditor 
                sessionId={sessionID || ''} 
                isRecording={isRecording}
                recordedSteps={recordedSteps}
                onClearRecordedSteps={handleClearRecordedSteps}
              />
            </div>
          </div>
          <div style={{ 
            padding: '8px', 
            borderTop: '1px solid #e0e0e0',
            backgroundColor: '#f8f8f8',
            fontSize: '12px',
            color: '#666',
            width: '100%'
          }}>
            <span>Tab ID: {tabId !== null ? tabId : 'Loading...'}</span>
            <span style={{ marginLeft: '12px' }}>Session ID: {sessionID !== null ? sessionID : 'Loading...'}</span>
          </div>
        </div>
        
        <button 
          className="sidebar-toggle" 
          onClick={() => updateIsOpen(!isOpen)}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            zIndex: 2147483647,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s ease'
          }}
          title={`${isOpen ? 'Close' : 'Open'} Yeshie (Cmd+Shift+Y)`}
        >
        <img src={iconBase64} alt="Yeshie Icon" width={16} height={16} />
        </button>

        {/* Recording Button - Start/Stop */}
        <button 
          onClick={isRecording ? handleStopRecordingButton : handleStartRecording}
          style={{
            position: 'fixed',
            right: '80px',
            bottom: '20px',
            zIndex: 2147483647,
            background: isRecording ? '#f44336' : '#4CAF50',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: isRecording 
              ? '0 2px 8px rgba(244, 67, 54, 0.4)' 
              : '0 2px 5px rgba(0,0,0,0.2)',
            color: 'white',
            fontSize: '12px',
            animation: isRecording ? 'pulse-recording 2s infinite' : 'none'
          }}
          title={isRecording ? "Stop Recording" : "Start Recording"}
        >
          {isRecording ? '⏹️' : '🔴'}
        </button>

        {/* Help button for learned steps */}
        <button 
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              // Ctrl/Cmd+Click = Enable keyboard debug
              enableKeyboardDebug();
              setToast("🔍 Keyboard debug enabled for 30 seconds. Check console logs.");
              setTimeout(() => setToast(null), 3000);
            } else {
              // Normal click = Show storage help
              showStorageHelp();
            }
          }}
          style={{
            position: 'fixed',
            right: '50px',
            bottom: '20px',
            zIndex: 2147483647,
            background: '#4CAF50',
            border: 'none',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
          title="View saved learned steps | Ctrl+Click for keyboard debug"
        >
          ?
        </button>
      </div>
    </>
  )
}

export default Yeshie

// Log when script loads (with delay to ensure logger is initialized)
setTimeout(() => {
  logInfo("YeshieContent", "Yeshie script loaded successfully");
  
  // Export debug functions to window for console access
  if (typeof window !== 'undefined') {
    (window as any).yeshieDebug = {
      enableKeyboardDebug: () => {
        // Trigger the debug function (will need to be updated after mounting)
        console.log("Keyboard debug - access via Ctrl+Click on help button");
      }
    };
  }
}, 100);
