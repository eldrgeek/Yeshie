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

setupCS()
console.log(cssText)
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

const storage = new Storage()

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
  const [isOpen, setIsOpen] = useStorage("isOpen" + window.location.hostname, false)
  const [isReady, setIsReady] = useState(false)
  const [tabId, setTabId] = useState<number | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [context, setContext] = useState<TabContext | null>(null)
  const [canLoadIframe, setCanLoadIframe] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const initCalled = useRef(false)

  const updateContext = useCallback(async (newContext: Partial<TabContext>) => {
    if (tabId === null) return

    const updatedContext = { ...context, ...newContext }
    await storage.set(`tabContext:${tabId}`, updatedContext)
    setContext(updatedContext as TabContext)
  }, [tabId, context])

  const debouncedUpdateContext = useCallback(
    debounce((newContext: Partial<TabContext>) => updateContext(newContext), 1000),
    [updateContext]
  )

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.origin !== "http://localhost:3000") return;

    if (event.data && event.data.type === "monitor") {
      console.log("Received message from CollaborationPage iframe:", event.origin, event.data);
      if (event.data.op === "command") {
        console.log("Command", event.data.line);
        try {
          const result = await Stepper(event.data.line);
          console.log("Result", result);
          event.source?.postMessage({ 
            type: "commandResult", 
            command: event.data.line,
            result: result,
            timestamp: new Date().toISOString()
          }, { targetOrigin: event.origin });
        } catch (error) {
          console.error("Error processing command:", error);
          event.source?.postMessage({ 
            type: "commandResult", 
            data: {
              command: event.data.line,
              result: null,
              error: error.message,
              timestamp: new Date().toISOString()
            }
          }, { targetOrigin: event.origin });
        }
      }
    }

    if (event.data && event.data.type === "sessionID") {
      console.log("Received session ID from iframe:", event.data.sessionID);
      setSessionID(event.data.sessionID);
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
      const response = await sendToBackground({ name: "get_tab_id" });
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
    setupCS()
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

  if (!isReady) {
    console.log("Yeshie is not ready to render yet")
    return null
  }

  if (!document.body) {
    console.log("Body not found, not rendering Yeshie")
    return null
  }

  return (
    <div id="plasmo-google-sidebar">
      <div
        id="sidebar"
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
          {/* Top half - iframe */}
          <div style={{ height: '50%', borderBottom: '1px solid #e0e0e0', width: '100%' }}>
            {canLoadIframe && !connectionError ? (
              <iframe 
                src={`http://localhost:3000?tabId=${tabId}&mode=${context?.mode}`} 
                width="100%" 
                height="100%" 
                style={{ border: 'none' }}
                title="Localhost Iframe" 
                onError={() => setConnectionError(true)}
              />
            ) : null}
          </div>
          {/* Bottom half - YeshieEditor */}
          <div style={{ height: '50%', width: '100%' }}>
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
        <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
          <img src={iconBase64} alt="Yeshie Icon" width={32} height={32} />
          {isOpen ? "🟡" : "🟣"}
        </button>
      </div>
    </div>
  )
}

export default Yeshie

console.log("Yeshie script loaded")