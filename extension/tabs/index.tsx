import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import YeshieEditor from "../components/YeshieEditor";
import { SpeechInput } from "../components/SpeechEditor";

import "./style.css"; // Assuming you might want some basic styling

function TabsIndex() {
  const [version, setVersion] = useState("Loading...");

  useEffect(() => {
    // Get version from manifest
    const manifest = chrome.runtime.getManifest();
    setVersion(manifest.version);
  }, []);

  return (
    <div className="container">
      <div className="header">
        <h1>Yeshie</h1>
        <div className="version">Version: {version}</div>
      </div>
      
      <div className="content">
        <div className="editor-section">
          <YeshieEditor />
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