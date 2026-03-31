// Background service worker: handles chrome.debugger calls
// Receives messages from content script, executes CDP commands, returns results

const PROTOCOL_VERSION = '1.3';

// Pending debugger attachments — track attached tabs to avoid double-attach
const attachedTabs = new Set();

async function attachIfNeeded(tabId) {
  if (attachedTabs.has(tabId)) return;
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, PROTOCOL_VERSION, () => {
      if (chrome.runtime.lastError) {
        // Already attached is OK
        if (chrome.runtime.lastError.message?.includes('already attached')) {
          attachedTabs.add(tabId);
          resolve();
        } else {
          reject(chrome.runtime.lastError);
        }
      } else {
        attachedTabs.add(tabId);
        resolve();
      }
    });
  });
}

async function detachIfAttached(tabId) {
  if (!attachedTabs.has(tabId)) return;
  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId);
      resolve();
    });
  });
}

async function sendCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// Type text into the currently focused element using Input.insertText
// This produces isTrusted:true events that Vue/React respond to
async function typeText(tabId, text) {
  await attachIfNeeded(tabId);
  try {
    // Focus the element first via Runtime.evaluate if selector provided
    // Then use Input.insertText — inserts at cursor position, respects focus
    await sendCommand(tabId, 'Input.insertText', { text });
    return { ok: true };
  } finally {
    await detachIfAttached(tabId);
  }
}

// Clear a field and type new text
// Uses Input.dispatchKeyEvent for Ctrl+A, then insertText
async function clearAndType(tabId, text) {
  await attachIfNeeded(tabId);
  try {
    // Select all: Ctrl+A
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'a', code: 'KeyA',
      modifiers: 2, // Ctrl
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
    });
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'a', code: 'KeyA',
      modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
    });
    // Delete selection
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Delete', code: 'Delete',
      windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46
    });
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Delete', code: 'Delete',
      windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46
    });
    // Insert new text
    await sendCommand(tabId, 'Input.insertText', { text });
    // Blur to trigger Vue's change handlers
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
    });
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
    });
    return { ok: true };
  } finally {
    await detachIfAttached(tabId);
  }
}

// Focus an element by selector using Runtime.evaluate, then clear+type
async function focusAndType(tabId, selector, text) {
  await attachIfNeeded(tabId);
  try {
    // Focus the element
    await sendCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return 'not found';
          el.focus();
          el.click();
          el.select && el.select();
          return 'focused: ' + el.id;
        })()
      `,
      returnByValue: true
    });

    // Small delay for focus to settle
    await new Promise(r => setTimeout(r, 50));

    // Select all via keyboard
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2,
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
    });
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2,
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
    });

    // Insert text (replaces selection)
    await sendCommand(tabId, 'Input.insertText', { text });

    // Tab out to trigger Vue blur/change
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
    });
    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
    });

    return { ok: true };
  } finally {
    await detachIfAttached(tabId);
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message.__yeshieBridge) return false;

  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ error: 'No tab ID' });
    return false;
  }

  const handle = async () => {
    try {
      if (message.action === 'focusAndType') {
        const result = await focusAndType(tabId, message.selector, message.text);
        return { result };
      }
      if (message.action === 'typeText') {
        const result = await typeText(tabId, message.text);
        return { result };
      }
      if (message.action === 'clearAndType') {
        const result = await clearAndType(tabId, message.text);
        return { result };
      }
      if (message.action === 'ping') {
        return { result: { pong: true, tabId } };
      }
      return { error: 'Unknown action: ' + message.action };
    } catch (err) {
      return { error: err.message };
    }
  };

  handle().then(sendResponse);
  return true; // Keep message channel open for async response
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

console.log('[Yeshie Bridge] Background worker started');
