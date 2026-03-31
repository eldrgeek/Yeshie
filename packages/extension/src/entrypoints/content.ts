export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Bridge: window.postMessage → chrome.runtime → background worker
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data?.__yeshieExt) return;
      const msg = event.data;
      chrome.runtime.sendMessage(msg, (response) => {
        window.postMessage({
          __yeshieExtResponse: true,
          requestId: msg.requestId,
          response,
          error: chrome.runtime.lastError?.message || null
        }, '*');
      });
    });

    // Signal relay is ready
    window.postMessage({ __yeshieExtReady: true }, '*');
    chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href });
  }
});
