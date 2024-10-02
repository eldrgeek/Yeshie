import iconBase64 from "data-base64:~assets/icon.png"
import cssText from "data-text:~/contents/google-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useCallback } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { setupCS } from "../functions/extcomms"
import "./google-sidebar-base.css"
import { Stepper, getOrCreateInstanceId } from "../functions/Stepper"
import { sendToBackground } from "@plasmohq/messaging"

// Inject to the webpage itself
const logMessages: string[] = [];
// const originalConsoleLog = console.log;

// console.log = (...args: any[]) => {
//   originalConsoleLog(...args);
//   logMessages.push(args.join(" "));
//   // Send log messages to parent window if in an iframe
//   if (window.parent && window.parent !== window) {
//     window.parent.postMessage({ type: "log", messages: logMessages }, "*");
//   }
// };
setupCS()
// import { pageObserver, type ObserverEvent } from '../functions/observer'; 
// pageObserver.registerCallback((event: ObserverEvent) => {
//   switch (event.type) {
//     case 'dom':
//       // console.log('DOM changed:', event.details);
//       break;
//     case 'location':
//       console.log('Location changed to:', event.details);
//       break;
//     case 'focus':
//       console.log('Page focus changed:', event.details);
//       break;
//     case 'elementFocus':
//       console.log('Focused element:', event.details);
//       break;
//     case 'keydown':
//     case 'keyup':
//       console.log('Key event:', event.type, event.details);
//       break;
//     case 'click':
//       // Updated to log new details
//       console.log('Mouse click:', event.details.x, event.details.y, event.details.selector, event.details.label);
//       break;
//     case 'mousemove':
//       // console.log('Mouse move:', event.details);
//       break;
//   }
// });
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

const isMatchingURL = (pattern) => {
  const currentURL = new URL(window.location.href)
  const patternURL = new URL(pattern.replace('*', ''), currentURL.origin)
  const cordURL = new URL("https://docs.cord.com")
  const currentMatch = currentURL.hostname === patternURL.hostname && currentURL.pathname.startsWith(patternURL.pathname)
  const cordMatch = currentURL.hostname === cordURL.hostname && currentURL.pathname.startsWith(cordURL.pathname)
  return currentMatch || cordMatch
}

export const getShadowHostId = () => "plasmo-google-sidebar"

const Yeshie: React.FC = () => {
  const [isOpen, setIsOpen] = useStorage("isOpen" + window.location.hostname, false)
  const [isReady, setIsReady] = useState(false)
  const [tabId, setTabId] = useState<any | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(null)

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.origin !== "http://localhost:3000") return;

    if (event.data && event.data.type === "monitor") {
      console.log("Received message from CollaborationPage iframe:", event.data)
      if (event.data.op === "command") {
        console.log("Command", event.data.line)
        Stepper(event.data.line)
      }
    }
  }, [])

  useEffect(() => {
    if (window.top !== window.self) {
      console.log("Yeshie is in an iframe, not rendering")
      return
    }

    async function init() {
      console.log("INITTING")
      // chrome.runtime.sendMessage({op: "getTabId"}, (response) => {
      //   console.log("Response from background script:", response);
      // });
      

    
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

    document.addEventListener('keydown', handleKeyPress)
    window.addEventListener("message", handleMessage)

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener("message", handleMessage)
    }
  }, [handleMessage]) // Ensure handleMessage is defined and used correctly

  useEffect(() => {
    setupCS()
    if (document.body && isReady) {
      document.body.classList.toggle("plasmo-google-sidebar-show", isOpen)
    }
  }, [isOpen, isReady])

  if (!isReady) {
    console.log("Yeshie is not ready to render yet")
    return null
  }

  if (!document.body) {
    console.log("Body not found, not rendering Yeshie")
    return null
  }

  return (
    <div id="sidebar" className={isOpen ? "open" : "closed"}>
      <h2>Tab ID: {tabId !== null ? tabId : 'Loading...'}</h2>
      <img 
        src={iconBase64} 
        alt="Yeshie Icon" 
        className="resizing-icon"
        width={32} 
        height={32} 
      />
      <iframe 
        src={`http://localhost:3000?sessionID=${sessionID}&tabId=${tabId}`} 
        width="100%" 
        height="500px" 
        title="Localhost Iframe" 
      />
      <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
        <img src={iconBase64} alt="Yeshie Icon" width={32} height={32} />
        {isOpen ? "🟡" : "🟣"}
      </button>
    </div>
  )
}

// Add this function to get the sessionID from the server
async function getSessionIDFromServer(): Promise<string> {
  // Implement your logic to get the sessionID from the server
  // This is a placeholder implementation
  return new Promise((resolve) => {
    setTimeout(() => resolve("server-generated-session-id"), 1000);
  });
}

export default Yeshie

console.log("Yeshie script loaded")