// Content script — bridges window.postMessage ↔ chrome.runtime for background worker
// Runs in ISOLATED world, has access to chrome.runtime

// Signal readiness
try {
  chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href });
} catch(e) {}

// Relay: page → background
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (msg?.__yeshieExt !== true) return;

  chrome.runtime.sendMessage(msg, (response) => {
    window.postMessage({
      __yeshieExtResponse: true,
      requestId: msg.requestId,
      response: response,
      error: chrome.runtime.lastError?.message || null
    }, '*');
  });
});

// Signal to page that relay is ready
window.postMessage({ __yeshieExtReady: true }, '*');
