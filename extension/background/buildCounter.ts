// Track build number for development mode
let buildTimestamp = Date.now();
let buildCounter = 0;

// Expose build information to popup and content scripts
export function getBuildInfo() {
  try {
    return {
      manifestVersion: chrome.runtime.getManifest().version,
      buildTimestamp,
      buildCounter: ++buildCounter,
      buildId: `${chrome.runtime.getManifest().version}-dev.${buildCounter}.${buildTimestamp}`,
      isDev: process.env.NODE_ENV !== 'production'
    };
  } catch (error) {
    // Handle case where chrome.runtime is not available (e.g. in worker context)
    return {
      manifestVersion: 'unknown',
      buildTimestamp,
      buildCounter: ++buildCounter,
      buildId: `unknown-dev.${buildCounter}.${buildTimestamp}`,
      isDev: true
    };
  }
}

// Initialize build counters
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(() => {
    buildCounter = 0;
    buildTimestamp = Date.now();
    console.log(`Build initialized: ${getBuildInfo().buildId}`);
  });
} 