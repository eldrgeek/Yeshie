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
    logInfo("YeshieContent", `Tab ID ${tabId} will be restored after extension loads`);
  }
});

setupCS()
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
    setIsOpen(newIsOpen)
    try {
      await storageSet(isOpenKey, newIsOpen)
      logInfo('YeshieContent', 'storage_set: isOpenKey', { key: isOpenKey, value: newIsOpen })
    } catch (error) {
      logError("YeshieContent", `Error setting state for ${isOpenKey}`, { error });
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('YeshieContent', 'storage_error: setIsOpen', { operation: 'setIsOpen', key: isOpenKey, error: errorMessage })
    }
  }, [isOpenKey])

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
    if (window.top !== window.self || !document.getElementById(getShadowHostId())) {
      logInfo("YeshieContent", "Yeshie is in an iframe or shadow host not found, not rendering")
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

    const observer = new MutationObserver((mutations, obs) => {
      const targetElement = document.querySelector('body')
      if (targetElement) {
        setIsReady(true)
        obs.disconnect()
        logInfo("YeshieContent", "Target element found, Yeshie is ready to render")
      }
    })

    observer.observe(document, {
      childList: true,
      subtree: true
    })

    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'y') {
        event.preventDefault()
        updateIsOpen(!isOpen)
      }
      
      if (event.key === 'Escape' && isOpen) {
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
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener("message", handleMessage)
      window.removeEventListener('popstate', handleUrlChange)
    }
  }, [handleMessage, updateContext, isOpen, isReady, updateIsOpen])

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
    console.log("Yeshie is not ready to render yet")
    return null
  }

  if (!document.body) {
    console.log("Body not found, not rendering Yeshie")
    return null
  }

  return (
    <div id={getShadowHostId()}>
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
          width: '48px',
          height: '48px',
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

console.log("Yeshie script loaded")
