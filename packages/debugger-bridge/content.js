// Content script: relay window.postMessage → background via chrome.runtime.sendMessage
// Runs in ISOLATED world but can bridge page ↔ extension

window.addEventListener('message', (event) => {
  // Only accept messages from the same page
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.__yeshieBridge !== true) return;

  // Forward to background worker
  chrome.runtime.sendMessage(msg, (response) => {
    // Relay response back to page
    window.postMessage({
      __yeshieBridgeResponse: true,
      requestId: msg.requestId,
      result: response?.result,
      error: response?.error
    }, '*');
  });
});

// Signal to page that bridge is available
window.postMessage({ __yeshieBridgeReady: true }, '*');
