// src/contents/safeActionListener.ts

/**
 * Guards against missing chrome.action / chrome.browserAction in content scripts,
 * setting up a fallback key event so Cmd+Shift+Y still toggles the slider.
 */
(function setupSafeActionListener() {
    // Prefer the new chrome.action API, fallback to chrome.browserAction
    const actionApi = (chrome as any).action ?? (chrome as any).browserAction;
    // Only bind if the API exists and supports onClicked.addListener
    if (actionApi?.onClicked?.addListener) {
      actionApi.onClicked.addListener(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "y",
            metaKey: true,
            shiftKey: true,
            ctrlKey: false
          })
        );
      });
    }
  })();
  