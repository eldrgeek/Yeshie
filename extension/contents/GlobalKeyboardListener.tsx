import React, { useEffect } from 'react'
import { logInfo, logDebug, logError } from "../functions/logger"
import { startRecording, stopRecording } from "../functions/passiveRecorder"

interface GlobalKeyboardListenerProps {
  onRecordingStart: () => void
  onRecordingStop: (steps: any[]) => void
  isRecording: boolean
}

export default function GlobalKeyboardListener({ 
  onRecordingStart, 
  onRecordingStop, 
  isRecording 
}: GlobalKeyboardListenerProps) {
  
  // Immediate log to confirm mounting
  console.log("🔧 GlobalKeyboardListener mounted", { isRecording, timestamp: Date.now() });
  
  useEffect(() => {
    logDebug("GlobalKeyboard", "Setting up global keyboard listener");
    console.log("🔧 GlobalKeyboardListener setting up event listeners");

    const handleKeyDown = (e: KeyboardEvent) => {
      // Log all Cmd/Ctrl+Shift combinations for debugging
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        logInfo("GlobalKeyboard", `Cmd/Ctrl+Shift+${e.key.toUpperCase()} detected`, { 
          ctrl: e.ctrlKey, 
          meta: e.metaKey, 
          shift: e.shiftKey,
          key: e.key,
          target: (e.target as HTMLElement)?.tagName || 'unknown',
          currentIsRecording: isRecording
        });
      }

      // Always check for our shortcuts first, regardless of focus
      const isRecordingShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r";
      const isLegacyShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l";
      const isOurShortcut = isRecordingShortcut || isLegacyShortcut;

      if (isOurShortcut) {
        // ALWAYS prevent default for our shortcuts to stop browser reload
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        logInfo("GlobalKeyboard", `PREVENTED DEFAULT for ${e.key.toUpperCase()}`, { 
          ctrl: e.ctrlKey, 
          meta: e.metaKey, 
          shift: e.shiftKey,
          prevented: true,
          currentIsRecording: isRecording
        });
      }

      // Check if user is currently typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]')
      );

      // Skip processing shortcuts if user is typing (but we already prevented default above)
      if (isTyping && isOurShortcut) {
        logDebug("GlobalKeyboard", "User is typing, skipping shortcut processing but default prevented");
        return;
      }

      // Handle Cmd/Ctrl+Shift+R for recording - DISABLED - using buttons instead
      if (isRecordingShortcut) {
        logInfo("GlobalKeyboard", `Cmd/Ctrl+Shift+R detected but recording now uses buttons instead`);
        // Do nothing - recording is now controlled by buttons
      }
      // Handle Cmd/Ctrl+Shift+L for old learn mode
      else if (isLegacyShortcut) {
        logInfo("GlobalKeyboard", "Cmd/Ctrl+Shift+L DETECTED. Sending toggle message to background.");
        
        // Send message to background to toggle recording state
        chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING_FROM_SHORTCUT" }, (response) => {
          if (chrome.runtime.lastError) {
            logError("GlobalKeyboard", "Error sending toggle shortcut message", { error: chrome.runtime.lastError.message });
          } else {
            logInfo("GlobalKeyboard", "Toggle shortcut message sent successfully.", { response });
          }
        });
      }
    };

    // Use capture phase with highest priority
    document.addEventListener("keydown", handleKeyDown, { capture: true, passive: false });
    
    // Also add to window for extra coverage
    window.addEventListener("keydown", handleKeyDown, { capture: true, passive: false });
    
    logInfo("GlobalKeyboard", "Global keyboard listeners attached to document and window");

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      logDebug("GlobalKeyboard", "Global keyboard listeners removed");
    };
  }, [isRecording, onRecordingStart, onRecordingStop]); // Include isRecording back in dependencies

  // This component doesn't render anything
  return null;
} 