// Content script — signals readiness to background worker
try {
  chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href });
} catch(e) { /* extension context invalidated */ }
