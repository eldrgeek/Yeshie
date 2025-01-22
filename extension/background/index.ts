import { setupBG } from "../functions/extcomms";
import type {PlasmoMessaging} from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

// Add these type definitions at the top of your file
declare global {
  interface WorkerGlobalScope {
    addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  }
}

interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
  preloadResponse: Promise<Response | undefined>;
}

console.log("Background script loaded");
self.addEventListener('offline', () => {
  console.log('The browser is offline.');
  // Handle offline situation, e.g., cache resources or notify the user
});

// Optionally, you can also add an 'online' event listener to handle reconnection
self.addEventListener('online', () => {
  console.log('The browser is back online.');
  // Handle reconnection logic, e.g., sync with server or fetch updates
});

// Update the fetch event listener
self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }

        return await fetch(event.request);
      } catch (error) {
        console.error('Fetch failed; returning offline page instead.', error);
        // You might want to return a custom offline page here
        return new Response('Offline page', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
  }
});

// Function to get the current tab ID
async function getCurrentTabId(): Promise<number> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("All active tabs:", tabs);
    const tabId = tabs[0]?.id ?? -1;
    console.log("Selected tab ID:", tabId);
    return tabId;
  } catch (error) {
    console.error("Error getting current tab ID:", error);
    return -1;
  }
}

// Log tab ID when a new tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log("Activated Tab ID:", activeInfo.tabId);
  logCurrentTabId();
});

// Log tab ID when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log("Updated Tab ID:", tabId);
    logCurrentTabId();
  }
});

// Log tab ID when a new tab is created
chrome.tabs.onCreated.addListener((tab) => {
  console.log("New tab created:", tab.id);
  logCurrentTabId();
});

const CONTEXT_REMOVAL_DELAY = 10000
// Log tab ID when a tab is removed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Schedule context removal
  setTimeout(async () => {
    await storage.remove(`tabContext:${tabId}`)
  }, CONTEXT_REMOVAL_DELAY)
});

// Log tab ID when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  logCurrentTabId();
});

// Log the current tab ID every 30 seconds
setInterval(logCurrentTabId, 30000);

setupBG();

const captureScreenshot = (windowId) => {
  chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
    if (!dataUrl) {
      console.error(chrome.runtime.lastError.message);
    } else {
      console.log('Screenshot taken:', dataUrl);
      chrome.tabs.create({ url: dataUrl });
    }
  });
};

// Add message handler for getTabId
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.name === "getTabId") {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id ?? -1;
      console.log("Selected tab ID:", tabId);
      sendResponse({ tabId });
    } catch (error) {
      console.error("Error getting current tab ID:", error);
      sendResponse({ tabId: -1 });
    }
    return true; // Keep the message channel open for async response
  }
  return true;
});

const captureScreenshotToClipboard = (sendResponse) => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ])
            .then(() => {
              sendResponse("copied");
              console.log('Screenshot copied to clipboard');
            })
            .catch((error) => {
              sendResponse("error");
              console.error('Error copying screenshot to clipboard:', error);
            });
        }, 'image/png');
      };
      img.src = dataUrl;
    } else {
      console.error('Failed to capture screenshot');
    }
  });
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Function to send a message to a specific tab
function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message);
}

// Add this function to your background.ts file
function logCurrentTabId() {
  getCurrentTabId().then(tabId => {
    console.log("Current Tab ID (from background):", tabId);
    logAllTabs();
  });
}

async function logAllTabs() {
  const allTabs = await chrome.tabs.query({});
  console.log("All open tabs:", allTabs.map(tab => ({ id: tab.id, url: tab.url })));
}

console.log("Background loaded") 