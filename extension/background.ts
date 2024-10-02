import { setupBG } from "./functions/extcomms";
import type {PlasmoMessaging} from "@plasmohq/messaging"

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


// Function to get the current tab ID
async function getCurrentTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log("All active tabs:", tabs);
  const tabId = tabs[0]?.id ?? -1;
  console.log("Selected tab ID:", tabId);
  return tabId;
}

// Message handler for getting the current tab ID
export const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  console.log("ASKED FOR TABID")
  if (req.name === "getCurrentTabId") {
    const tabId = await getCurrentTabId();
    console.log("Current Tab ID:", tabId); // This will log to the background script console
    res.send({ tabId });
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

// Log tab ID when a tab is removed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("Tab removed:", tabId);
  logCurrentTabId();
});

// Log tab ID when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  logCurrentTabId();
});

// Log the current tab ID every 30 seconds
setInterval(logCurrentTabId, 30000);

// Background script or worker script

// Adding the offline event listener immediately during script evaluation


// Other code related to the service worker or background script

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

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === 'screenshot' && sender.tab && sender.tab.windowId !== undefined) {
//     captureScreenshot(sender.tab.windowId);
//     sendResponse({ status: 'screenshot taken' });
//   } else {
//     sendResponse({ status: 'invalid request' });
//   }
//   return true;  // Keep the messaging channel open for sendResponse
// });

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(message.op=="getTabId"){
    sendResponse(getCurrentTabId)
  }
  
  if (sender.tab && sender.tab.id) {
    // Forward the message to the specific tab that sent it
    chrome.tabs.sendMessage(sender.tab.id, message);
  } 
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

// Log the current tab ID every 5 seconds
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log("Updated Tab ID:", tabId);
    logCurrentTabId();
  }
});

console.log("Background loaded")


async function logAllTabs() {
  const allTabs = await chrome.tabs.query({});
  console.log("All open tabs:", allTabs.map(tab => ({ id: tab.id, url: tab.url })));
}
