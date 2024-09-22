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
import { setupBG } from "./functions/extcomms";
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
