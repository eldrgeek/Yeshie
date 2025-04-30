import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import YeshieEditor from "../components/YeshieEditor";
import { SpeechInput } from "../components/SpeechEditor";
import TabList from "./TabList";

import "./style.css"; // Assuming you might want some basic styling

function TabsIndex() {
  const [version, setVersion] = useState("Loading...");

  useEffect(() => {
    // Get version from manifest
    const manifest = chrome.runtime.getManifest();
    setVersion(manifest.version);
  }, []);

  return (
    <div className="container two-panel-layout">
      <div className="header">
        <h1>Yeshie</h1>
        <div className="version">Version: {version}</div>
      </div>
      
      <div className="main-content">
        <div className="left-panel">
          <div className="editor-section">
            <YeshieEditor />
          </div>
        </div>
        <div className="right-panel">
          <TabList />
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
console.log("TabsIndex", TabsIndex);
root.render(
  <React.StrictMode>
    <TabsIndex />
  </React.StrictMode>
); 