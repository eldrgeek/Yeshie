import { logInfo } from "./logger"

/**
 * Debug utility to track all keyboard events for troubleshooting
 */
export function enableKeyboardDebug(duration: number = 30000) {
  logInfo("KeyboardDebug", `Enabling keyboard debug for ${duration}ms`);
  
  const handleKeyEvent = (e: KeyboardEvent) => {
    // Only log modifier key combinations
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.metaKey) modifiers.push('Cmd');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      
      logInfo("KeyboardDebug", `${e.type}: ${modifiers.join('+')}+${e.key.toUpperCase()}`, {
        type: e.type,
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        target: (e.target as HTMLElement)?.tagName || 'unknown',
        defaultPrevented: e.defaultPrevented,
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        timestamp: Date.now()
      });
    }
  };

  // Listen to all phases
  document.addEventListener('keydown', handleKeyEvent, true);  // Capture
  document.addEventListener('keydown', handleKeyEvent, false); // Bubble
  window.addEventListener('keydown', handleKeyEvent, true);    // Window capture
  window.addEventListener('keydown', handleKeyEvent, false);   // Window bubble

  // Auto-disable after duration
  setTimeout(() => {
    document.removeEventListener('keydown', handleKeyEvent, true);
    document.removeEventListener('keydown', handleKeyEvent, false);
    window.removeEventListener('keydown', handleKeyEvent, true);
    window.removeEventListener('keydown', handleKeyEvent, false);
    
    logInfo("KeyboardDebug", "Keyboard debug disabled");
  }, duration);

  return () => {
    document.removeEventListener('keydown', handleKeyEvent, true);
    document.removeEventListener('keydown', handleKeyEvent, false);
    window.removeEventListener('keydown', handleKeyEvent, true);
    window.removeEventListener('keydown', handleKeyEvent, false);
    
    logInfo("KeyboardDebug", "Keyboard debug manually disabled");
  };
}

// Export for console access
if (typeof window !== 'undefined') {
  (window as any).enableKeyboardDebug = enableKeyboardDebug;
} 