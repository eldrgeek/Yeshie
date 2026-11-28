// Jared bridge, page half: runs only on Jared's own site and passes Jared's requests to Yeshie's
// background (src/jared-bridge.ts), which checks the origin again. Jared posts
// { source: 'jared', id, type, ... } and gets { source: 'yeshie-jared', id, reply } back.
export default defineContentScript({
  matches: ['https://soma-jared.netlify.app/*', 'https://*.soma-jared.netlify.app/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== window || !m || m.source !== 'jared' || !m.type) return;
      // A copy left over from before Yeshie reloaded stays quiet, so only the fresh copy answers.
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({ jared: m }, (reply) => {
        const r = chrome.runtime.lastError ? { ok: false, why: chrome.runtime.lastError.message } : reply;
        window.postMessage({ source: 'yeshie-jared', id: m.id, reply: r }, window.location.origin);
      });
    });
    window.postMessage({ source: 'yeshie-jared', type: 'here' }, window.location.origin);
  },
});
