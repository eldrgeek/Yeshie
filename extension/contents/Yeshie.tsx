import iconBase64 from "data-base64:~assets/icon.png"
import cssTextBase from "data-text:~/contents/google-sidebar-base.css"
import cssText from "data-text:~/contents/google-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import React, { useEffect, useState, useCallback, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import { setupCS } from "../functions/extcomms"
import { Stepper, getOrCreateInstanceId } from "../functions/Stepper"
import { sendToBackground } from "@plasmohq/messaging"
import YeshieEditor from "../components/YeshieEditor"
import "./google-sidebar-base.css"
import DialogPanel from "./DialogPanel"
import { createRoot } from "react-dom/client"
import { rememberCurrentTab, attemptTabFocusWithRetries, storedTabId } from "../functions/tabFocus"

// Create a global variable to track if DialogPanel has been mounted
let dialogPanelMounted = false

// Remember current tab as soon as possible
rememberCurrentTab().then(tabId => {
  if (tabId) {
    console.log(`Tab ID ${tabId} will be restored after extension loads`);
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

const storage = new Storage({ area: "local" })

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
  const [isOpen, setIsOpen] = useStorage({
    key: "isOpen" + window.location.hostname,
    instance: new Storage({ area: "local" }),
  }, false)
  const [isReady, setIsReady] = useState(false)
  const [tabId, setTabId] = useState<number | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [context, setContext] = useState<TabContext | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const initCalled = useRef(false)

  const updateContext = useCallback(async (newContextPart: Partial<TabContext>) => {
    if (tabId === null) {
        console.warn("updateContext called before tabId was set.");
        return;
    }

    // Use functional update for setContext to avoid dependency on 'context'
    setContext(prevContext => {
      // Ensure prevContext is not null/undefined before spreading
      const currentContext = prevContext || { url: window.location.href, content: "", mode: "llm" };
      const updated = { ...currentContext, ...newContextPart };

      // Persist to storage immediately after calculating the new state
      // Use a separate async function or IIFE to handle the promise
      (async () => {
          try {
              await storage.set(`tabContext:${tabId}`, updated);
              console.log(`Context updated and saved for tab ${tabId}:`, updated); // Added log
          } catch (error) {
              console.error(`Failed to save context for tab ${tabId}:`, error);
          }
      })();

      return updated as TabContext;
    });
  }, [tabId]); // Now only depends on tabId

  const debouncedUpdateContext = useCallback(
    debounce((newContext: Partial<TabContext>) => updateContext(newContext), 1000),
    [updateContext]
  )

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data && event.data.type === "command") {
      console.log("Received command from YeshieEditor:", event.data);
      try {
        const result = await Stepper(event.data.command);
        console.log("Command result:", result);
        window.postMessage({ 
          type: "commandResult", 
          command: event.data.command,
          result: result,
          timestamp: new Date().toISOString()
        }, "*");
      } catch (error) {
        console.error("Error processing command:", error);
        window.postMessage({ 
          type: "commandResult", 
          command: event.data.command,
          result: null,
          error: error.message,
          timestamp: new Date().toISOString()
        }, "*");
      }
    }
  }, []);

  useEffect(() => {
    if (window.top !== window.self || !document.getElementById(getShadowHostId())) {
      console.log("Yeshie is in an iframe or shadow host not found, not rendering")
      return

    }
    

    async function init() {
      if (initCalled.current) return 
      initCalled.current = true 

      console.log("INITTING", isOpen, isReady)
      try {
        const response = await sendToBackground({ name: "getTabId" });
        console.log("Got tab ID response:", response);
        if (response && typeof response.tabId === 'number') {
          setTabId(response.tabId);
          
          const storedContext = await storage.get(`tabContext:${response.tabId}`) as TabContext | undefined
          if (storedContext) {
            setContext(storedContext)
          } else {
            const newContext: TabContext = {
              url: window.location.href,
              content: "",
              mode: "llm"
            }
            await storage.set(`tabContext:${response.tabId}`, newContext)
            setContext(newContext)
          }
        } else {
          console.error("Invalid tab ID response:", response);
        }
      } catch (error) {
        console.error("Error getting tab ID:", error);
      }
    }

    init();

    const observer = new MutationObserver((mutations, obs) => {
      const targetElement = document.querySelector('body')
      if (targetElement) {
        setIsReady(true)
        obs.disconnect()
        console.log("Target element found, Yeshie is ready to render")
      }
    })

    observer.observe(document, {
      childList: true,
      subtree: true
    })

    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'y') {
        event.preventDefault()
        setIsOpen(prevIsOpen => !prevIsOpen)
      }
      
      // Add global Escape key handler to help with focus management
      if (event.key === 'Escape' && isOpen) {
        // If Escape is pressed while extension is open, blur any focused elements
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
          
          // Focus back on the page - try to find a reasonable target
          const pageInput = document.querySelector('input, textarea, [contenteditable="true"]') as HTMLElement;
          if (pageInput && pageInput.closest('.yeshie-editor') === null) {
            pageInput.focus();
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
  }, [handleMessage, updateContext, isOpen, isReady])

  useEffect(() => {
    if (document.body && isReady) {
      document.body.classList.toggle("plasmo-google-sidebar-show", isOpen)
    }
  }, [isOpen, isReady])

  useEffect(() => {
    const style = document.createElement("style")
    const styleContent: string = cssText + "\n" + cssTextBase;
    style.textContent = styleContent
    document.head.appendChild(style)
    
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  useEffect(() => {
    if (isReady && storedTabId) {
      console.log("Extension is ready, attempting to restore tab focus to:", storedTabId);
      // Use exponential backoff strategy for multiple attempts
      attemptTabFocusWithRetries(storedTabId);
    }
  }, [isReady]);

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
          width={32} 
          height={32} 
        />
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          flex: 1,
          overflow: 'hidden',
          width: '100%'
        }}>
          {/* Full height YeshieEditor */}
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
      
      {/* Toggle button */}
      <button 
        className="sidebar-toggle" 
        onClick={() => setIsOpen(!isOpen)}
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
        <img src={iconBase64} alt="Yeshie Icon" width={32} height={32} />
      </button>
      
      {/* Add our helper component for the prompt dialog, but only mount it once */}
      {!dialogPanelMounted && (() => {
        dialogPanelMounted = true;
        return <DialogPanel />;
      })()}
    </div>
  )
}


export default Yeshie

console.log("Yeshie script loaded")
