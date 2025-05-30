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
  const isOpenKey = "isOpen" + window.location.hostname
  const [isReady, setIsReady] = useState(false)
  const [tabId, setTabId] = useState<number | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [context, setContext] = useState<TabContext | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const initCalled = useRef(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showReportsPanel, setShowReportsPanel] = useState(false)
  const [reportCount, setReportCount] = useState(0)

  useEffect(() => {
    storageGet<boolean>(isOpenKey).then(value => {
      setIsOpen(value ?? false)
      logInfo('YeshieContent', 'storage_get: isOpenKey', { key: isOpenKey, found: value !== undefined, value: value ?? false })
    }).catch(error => {
      logError("YeshieContent", `Error getting initial state for ${isOpenKey}`, { error });
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('YeshieContent', 'storage_error: getIsOpenInitial', { operation: 'getIsOpenInitial', key: isOpenKey, error: errorMessage })
      setIsOpen(false)
    })
  }, [isOpenKey])

  const updateIsOpen = useCallback(async (newIsOpen: boolean) => {
    logInfo("YeshieContent", `User toggled sidebar: ${isOpen ? 'open' : 'closed'} → ${newIsOpen ? 'open' : 'closed'}`, { 
      previousState: isOpen, 
      newState: newIsOpen, 
      url: window.location.href 
    });
    setIsOpen(newIsOpen)
    try {
      await storageSet(isOpenKey, newIsOpen)
      logInfo('YeshieContent', 'storage_set: isOpenKey', { key: isOpenKey, value: newIsOpen })
    } catch (error) {
      logError("YeshieContent", `Error setting state for ${isOpenKey}`, { error });
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('YeshieContent', 'storage_error: setIsOpen', { operation: 'setIsOpen', key: isOpenKey, error: errorMessage })
    }
  }, [isOpenKey, isOpen])

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
        } else {
          logError("YeshieContent", "Invalid tab ID response", { response });
        }
      } catch (error) {
        logError("YeshieContent", "Error during init (getTabId or context handling)", { error });
        const errorMessage = error instanceof Error ? error.message : String(error)
        logError('YeshieContent', 'init_error: getTabId/context', { step: 'getTabId/context', error: errorMessage })
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

    const handleKeyPress = (event: KeyboardEvent) => {
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
    }
  }, [handleMessage, updateContext, isOpen, updateIsOpen])

  useEffect(() => {
    if (document.body && isReady) {
      document.body.classList.toggle("plasmo-google-sidebar-show", isOpen)
    }
  }, [isOpen, isReady])

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

  if (!isReady) {
    console.log("Yeshie is not ready to render yet", { isReady, bodyExists: !!document.body })
    return null
  }

  if (!document.body) {
    console.log("Body not found, not rendering Yeshie", { isReady, bodyExists: !!document.body })
    return null
  }

  console.log("✅ Yeshie is ready to render!", { isReady, isOpen, tabId, bodyExists: !!document.body })

  return (
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
        className={isOpen ? "open" : "closed"}>
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
            <YeshieEditor sessionId={sessionID || ''} />
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

      >
      <img src={iconBase64} alt="Yeshie Icon" width={16} height={16} />
      </button>
    </div>
  )
}

export default Yeshie

// Log when script loads (with delay to ensure logger is initialized)
setTimeout(() => {
  logInfo("YeshieContent", "Yeshie script loaded successfully");
}, 100);
