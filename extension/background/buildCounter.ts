// Track build number for development mode
let buildTimestamp = Date.now();
let buildCounter = 0;

// Expose build information to popup and content scripts
export function getBuildInfo() {
  return {
    manifestVersion: chrome.runtime.getManifest().version,
    buildTimestamp,
    buildCounter: ++buildCounter,
    buildId: `${chrome.runtime.getManifest().version}-dev.${buildCounter}.${buildTimestamp}`,
    isDev: process.env.NODE_ENV !== 'production'
  };
}

// Initialize build counters
chrome.runtime.onInstalled.addListener(() => {
  buildCounter = 0;
  buildTimestamp = Date.now();
  console.log(`Build initialized: ${getBuildInfo().buildId}`);
}); 