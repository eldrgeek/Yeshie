import iconBase64 from "data-base64:~assets/icon.png"
import cssText from "data-text:~/contents/google-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { setupCS } from "../functions/extcomms"
import "./google-sidebar-base.css"

// Inject to the webpage itself
setupCS()

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

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [])

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
        <div>Some oddball shit</div>
        <iframe src="http://localhost:3000" width="100%" height="500px" title="Localhost Iframe" />
        <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
          <img src={iconBase64} alt="Yeshie Icon" width={32} height={32} />
          {isOpen ? "🟡GGG" : "🟣"}
        </button>
        <img src={iconBase64} alt="Yeshie Icon" width={128} height={128} />
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