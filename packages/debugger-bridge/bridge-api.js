/**
 * Yeshie Bridge API — include this in executor-inject.js
 * Wraps window.postMessage ↔ debugger-bridge extension into a Promise API
 * Falls back to execCommand if bridge is not available
 */

(function installBridge() {
  if (window.__yeshieBridgeAPI) return;

  let bridgeAvailable = false;
  const pending = new Map();
  let reqCounter = 0;

  // Listen for responses from the bridge content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (msg?.__yeshieBridgeReady) {
      bridgeAvailable = true;
      console.log('[Yeshie] Debugger bridge available');
      return;
    }
    if (msg?.__yeshieBridgeResponse && pending.has(msg.requestId)) {
      const { resolve, reject } = pending.get(msg.requestId);
      pending.delete(msg.requestId);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    }
  });

  function callBridge(action, params) {
    return new Promise((resolve, reject) => {
      const requestId = ++reqCounter;
      pending.set(requestId, { resolve, reject });
      // Timeout after 5s
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error('Bridge timeout'));
        }
      }, 5000);
      window.postMessage({ __yeshieBridge: true, requestId, action, ...params }, '*');
    });
  }

  // Main API: focus element by selector and type text using CDP
  async function trustedType(selector, text) {
    if (!bridgeAvailable) return false;
    try {
      await callBridge('focusAndType', { selector, text });
      return true;
    } catch (e) {
      console.warn('[Yeshie Bridge] trustedType failed:', e.message);
      return false;
    }
  }

  async function ping() {
    if (!bridgeAvailable) return false;
    try {
      const result = await callBridge('ping', {});
      return result?.pong === true;
    } catch {
      return false;
    }
  }

  window.__yeshieBridgeAPI = { trustedType, ping, isAvailable: () => bridgeAvailable };
  console.log('[Yeshie] Bridge API installed, waiting for bridge...');
})();
