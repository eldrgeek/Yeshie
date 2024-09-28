import iconBase64 from "data-base64:~assets/icon.png"
import cssText from "data-text:~/contents/google-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useCallback } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { setupCS } from "../functions/extcomms"
import "./google-sidebar-base.css"
import {Stepper} from "../functions/Stepper"
// Inject to the webpage itself
setupCS()
import { pageObserver, type ObserverEvent } from '../functions/observer'; 
pageObserver.registerCallback((event: ObserverEvent) => {
  switch (event.type) {
    case 'dom':
      // console.log('DOM changed:', event.details);
      break;
    case 'location':
      console.log('Location changed to:', event.details);
      break;
    case 'focus':
      console.log('Page focus changed:', event.details);
      break;
    case 'elementFocus':
      console.log('Focused element:', event.details);
      break;
    case 'keydown':
    case 'keyup':
      console.log('Key event:', event.type, event.details);
      break;
    case 'click':
      // Updated to log new details
      console.log('Mouse click:', event.details.x, event.details.y, event.details.selector, event.details.label);
      break;
    case 'mousemove':
      // console.log('Mouse move:', event.details);
      break;
  }
});
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
  run_at: "document_end" // Changed from document_idle to document_end
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

const Yeshie = () => {
  console.log("Yeshie script starting")

  // Check if we're in the top-level window
  if (window.top !== window.self) {
    console.log("Yeshie is in an iframe, not rendering")
    return null // Don't render anything if we're in an iframe
  }

  const [isOpen, setIsOpen] = useStorage("isOpen" + window.location.hostname, false)
  const [isReady, setIsReady] = useState(false) // {{ edit_1 }}

  const handleMessage = useCallback((event: MessageEvent) => {
    // Check if the message is coming from the expected origin
    if (event.origin !== "http://localhost:3000") return;

    if (event.data && event.data.type === "monitor") {
      console.log("Received message from CollaborationPage iframe:", event.data)
      // Handle the message here
      if (event.data.op === "command") {
        console.log("Command", event.data.content)
        // Add your logic to handle the LLM message
        // For example, you might want to send this to a background script
        // or process it directly within Yeshie
      }
    }
  }, [])

  useEffect(() => {
    if (window.top !== window.self) {
      console.log("Yeshie is in an iframe, not rendering")
      return
    }

    // Option 1: Using MutationObserver
    const observer = new MutationObserver((mutations, obs) => {
      const targetElement = document.querySelector('body') // Change this to a more specific selector if needed
      if (targetElement) {
        setIsReady(true) // {{ edit 2 }}
        obs.disconnect()
        console.log("Target element found, Yeshie is ready to render")
      }
    })

    observer.observe(document, {
      childList: true,
      subtree: true
    })

    // Add keyboard shortcut listener
    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'y') {
        event.preventDefault()
        setIsOpen(prevIsOpen => !prevIsOpen)
      }
    }

    document.addEventListener('keydown', handleKeyPress)

    // Add message listener
    window.addEventListener("message", handleMessage)

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener("message", handleMessage)
    }
  }, [handleMessage])

  useEffect(() => {
    setupCS() // Initialize communication
    if (document.body && isReady) {
      document.body.classList.toggle("plasmo-google-sidebar-show", isOpen)
    }
  }, [isOpen, isReady]) // {{ edit 3 }}

  if (!isReady) { // {{ edit 4 }}
    console.log("Yeshie is not ready to render yet")
    return null
  }

  try {
    if (!document.body) {
      console.log("Body not found, not rendering Yeshie")
      return null
    }

    return (
      <div id="sidebar" className={isOpen ? "open" : "closed"}>
        <img 
          src={iconBase64} 
          alt="Yeshie Icon" 
          className="resizing-icon"
          width={32} 
          height={32} 
        />
 
        <iframe src="http://localhost:3000" width="100%" height="500px" title="Localhost Iframe" />
        <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
          <img src={iconBase64} alt="Yeshie Icon" width={32} height={32} />
          {isOpen ? "🟡GGG" : "🟣"}
        </button>
      </div>
    )
  } catch (error) {
    console.error("Error in Yeshie component:", error)
    return null
  }
}

export default Yeshie

// Add this at the end of the file for debugging
console.log("Yeshie script loaded")