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

    // SOMA admin identity (window.__somaAdminToken) is now set by the
    // MAIN-world content script soma-admin.content.ts, NOT by injecting an
    // inline <script> tag here. Injecting a <script> with .textContent runs as
    // a PAGE inline script and is blocked by any site with a strict script-src
    // CSP ("Executing inline script violates ..."). A world:'MAIN' content
    // script is extension-injected and CSP-exempt. See soma-admin.content.ts.

    // Signal relay is ready
    window.postMessage({ __yeshieExtReady: true }, '*');
    chrome.runtime.sendMessage({ type: 'content_ready', url: window.location.href });
  }
});
