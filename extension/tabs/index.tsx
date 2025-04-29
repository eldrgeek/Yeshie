import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

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
      <h1>Yeshie Tab Page</h1>
      <p>This is the main operational page for the Yeshie extension.</p>
      {/* Add main tab page functionality here */}

      <div className="version-footer">
        Version: {version}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <TabsIndex />
  </React.StrictMode>
); 