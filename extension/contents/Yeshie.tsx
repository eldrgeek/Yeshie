import iconBase64 from "data-base64:~assets/icon.png"
import cssText from "data-text:~/contents/google-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import { useStorage } from "@plasmohq/storage/hook";
import { setupCS } from "../functions/extcomms";
// import YeshieConversation from "../components/YeshieConversation"
// import DoSteps from "../components/DoSteps";
// import SaveSteps from "../components/SaveSteps";
// import YeshieChat from "../components/YeshieChat"

// Inject to the webpage itself
import "./google-sidebar-base.css"
setupCS();


export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
  // matches: ["https://app.yeshid.com/*", 
  //   "https://github.com/*", 
  //   "https://yeshid.com/*",
  //    "https://suno.com/*", 
  //    "https://accounts.google.com/*",
  //    "https://copilot.microsoft.com/*",
  //    "http://localhost:5173/*",
  //    "localhost:5173/*",
  //    "localhost:3000/*"
  //   ],
  // css: ["../assets/main.css"]

}

// Inject into the ShadowDOM
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const isMatchingURL = (pattern) => {
  const currentURL = new URL(window.location.href);
  const patternURL = new URL(pattern.replace('*', ''), currentURL.origin);
  const cordURL = new URL("https://docs.cord.com")
  const currentMatch = currentURL.hostname === patternURL.hostname && currentURL.pathname.startsWith(patternURL.pathname);
  const cordMatch = currentURL.hostname === cordURL.hostname && currentURL.pathname.startsWith(cordURL.pathname);
  return currentMatch || cordMatch;
};

const yeshID = "https://app.yeshid.com/*";
const yeshHome = "https://yeshid.com/*";

export const getShadowHostId = () => "plasmo-google-sidebar"

const GoogleSidebar = () => {
  const [isOpen, setIsOpen] = useStorage("isOpen", false);
  const [steps, setSteps] = useStorage("steps", null);
  const [stepNo, setStepNo] = useStorage("stepNo", 0);
  const [convoStep,setConvoStep] = useStorage("convoStep", 0);


  useEffect(() => {
    console.log("ISOPEN toggle", isOpen);
  }, [isOpen]);
  

  useEffect(() => {
    document.body.classList.toggle("plasmo-google-sidebar-show", isOpen)
  }, [isOpen])

  return (
    <div id="sidebar" className={isOpen ? "open" : "closed"}>
      <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
      <img src={iconBase64} alt="Yeshie Icon" width={32} height={32} />
        {isOpen ? "🟡GGG" : "🟣"}
      </button>
      <img src={iconBase64} alt="Yeshie Icon" width={128} height={128} />
      {/* { (isMatchingURL(yeshID) || isMatchingURL(yeshHome)) ?
        <YeshieConversation convoStep={convoStep} setConvoStep={setConvoStep} /> 
        : 
      steps ? (
        <DoSteps steps={steps} stepNo={stepNo} setStepNo={setStepNo} setSteps={setSteps} />
      ) : (
        <SaveSteps setSteps={setSteps} setStepNo={setStepNo} />
      )
    }  */}
    </div>
  )
}

export default GoogleSidebar
