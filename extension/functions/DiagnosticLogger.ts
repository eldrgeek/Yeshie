import { sendToBackground } from "@plasmohq/messaging";

// DiagnosticLogger.ts - Utility for logging diagnostic information about focus management

// Maximum number of log entries to keep in memory
const MAX_LOG_ENTRIES = 100;

// Control whether logging is active
let loggingEnabled = false;

// Store log entries
const logEntries: LogEntry[] = [];

// Track the active element for context
let lastActiveElement: Element | null = null;

interface LogEntry {
  timestamp: string;
  type: string;
  details: any;
  activeElement?: string;
  debugInfo?: any;
}

/**
 * Enable or disable diagnostic logging
 */
export const setLoggingEnabled = (enabled: boolean) => {
  loggingEnabled = enabled;
  log('config', { loggingEnabled: enabled });
};

/**
 * Add an entry to the diagnostic log
 */
export const log = (type: string, details: any) => {
  if (!loggingEnabled && type !== 'config') return;
  
  // Get information about the currently focused element
  const activeEl = document.activeElement;
  const activeElementInfo = activeEl ? {
    tagName: activeEl.tagName,
    id: activeEl.id,
    className: activeEl.className,
    textContent: activeEl.textContent?.substring(0, 50),
    isContentEditable: activeEl instanceof HTMLElement ? activeEl.isContentEditable : false,
    isYeshieEditor: !!activeEl.closest('.yeshie-editor'),
    isLLMTextarea: activeEl.id === 'prompt-textarea' || 
                  (activeEl instanceof HTMLElement && activeEl.matches('textarea[data-id="root"]'))
  } : 'no active element';
  
  // Only log if focus has changed
  if (type === 'focus' && activeEl === lastActiveElement) {
    return;
  }
  
  // Update the last active element
  lastActiveElement = activeEl;
  
  // Create a log entry
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type,
    details,
    activeElement: JSON.stringify(activeElementInfo),
    debugInfo: {
      url: window.location.href,
      userAgent: navigator.userAgent
    }
  };
  
  // Add to log entries, keeping only most recent MAX_LOG_ENTRIES
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift();
  }
  
  // Log to console for immediate visibility
  console.log(`[Yeshie Diagnostic] ${entry.timestamp} - ${type}:`, details, activeElementInfo);
};

/**
 * Get all log entries
 */
export const getLogEntries = () => {
  return [...logEntries];
};

/**
 * Clear all log entries
 */
export const clearLogEntries = () => {
  logEntries.length = 0;
  log('config', { action: 'cleared_logs' });
};

/**
 * Copy log entries to clipboard as JSON
 */
export const copyLogsToClipboard = () => {
  const logText = JSON.stringify(logEntries, null, 2);
  navigator.clipboard.writeText(logText)
    .then(() => {
      console.log('[Yeshie Diagnostic] Logs copied to clipboard');
      return logText;
    })
    .catch(err => {
      console.error('[Yeshie Diagnostic] Failed to copy logs to clipboard:', err);
      return null;
    });
};

/**
 * Save logs to persistent storage through background script
 */
export const saveLogsToStorage = async () => {
  try {
    const response = await sendToBackground({
      name: "message",
      body: {
        command: "saveDiagnosticLog", 
        diagnosticData: logEntries,
        url: window.location.href
      }
    });
    
    if (response.success) {
      console.log('[Yeshie Diagnostic] Logs saved to persistent storage:', response.key);
      return response.key;
    } else {
      console.error('[Yeshie Diagnostic] Failed to save logs:', response.message);
      return null;
    }
  } catch (err) {
    console.error('[Yeshie Diagnostic] Error saving logs:', err);
    return null;
  }
};

/**
 * Get logs from persistent storage
 */
export const getLogsFromStorage = async () => {
  try {
    const response = await sendToBackground({
      name: "message",
      body: { command: "getDiagnosticLogs" }
    });
    
    if (response.success) {
      return response.logs;
    } else {
      console.error('[Yeshie Diagnostic] Failed to retrieve logs:', response.message);
      return [];
    }
  } catch (err) {
    console.error('[Yeshie Diagnostic] Error retrieving logs:', err);
    return [];
  }
};

/**
 * Start monitoring focus events and related events
 */
export const startMonitoring = () => {
  // Only attach event listeners once
  if (window._yeshieMonitoringStarted) return;
  window._yeshieMonitoringStarted = true;
  
  // Monitor focus events
  document.addEventListener('focusin', (e) => {
    log('focusin', { 
      target: {
        tagName: e.target instanceof Element ? e.target.tagName : 'unknown',
        id: e.target instanceof Element ? e.target.id : 'unknown',
        className: e.target instanceof Element ? e.target.className : 'unknown',
        isYeshieEditor: e.target instanceof Element ? !!e.target.closest('.yeshie-editor') : false,
      },
      relatedTarget: e.relatedTarget
    });
  }, true);
  
  document.addEventListener('focusout', (e) => {
    log('focusout', {
      target: {
        tagName: e.target instanceof Element ? e.target.tagName : 'unknown',
        id: e.target instanceof Element ? e.target.id : 'unknown',
        className: e.target instanceof Element ? e.target.className : 'unknown'
      },
      relatedTarget: e.relatedTarget
    });
  }, true);
  
  // Monitor relevant keyboard events
  document.addEventListener('keydown', (e) => {
    // Only log certain keys to avoid excessive logging
    if (['Tab', 'Escape', 'Enter'].includes(e.key)) {
      log('keydown', {
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        target: {
          tagName: e.target instanceof Element ? e.target.tagName : 'unknown',
          id: e.target instanceof Element ? e.target.id : 'unknown',
          className: e.target instanceof Element ? e.target.className : 'unknown',
        },
        prevented: e.defaultPrevented
      });
    }
  }, true);
  
  // Monitor mouse events on editor
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('.yeshie-editor')) {
      log('click', {
        target: {
          tagName: e.target.tagName,
          id: e.target.id,
          className: e.target.className,
          parent: e.target.parentElement ? {
            tagName: e.target.parentElement.tagName,
            className: e.target.parentElement.className
          } : 'none',
          isYeshieEditor: !!e.target.closest('.yeshie-editor'),
        },
        prevented: e.defaultPrevented
      });
    }
  }, true);
  
  // Observe DOM mutations (minimal to avoid overwhelming logs)
  const observer = new MutationObserver((mutations) => {
    // Filter to only focus-related mutations
    const relevantMutations = mutations.filter(mutation => {
      // Only record mutations that could affect focus
      if (mutation.type === 'attributes' && 
          (mutation.attributeName === 'tabindex' || mutation.attributeName === 'disabled')) {
        return true;
      }
      
      // For ChatGPT and Claude, also check for their specific focus-related classes
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target as Element;
        if (target.id === 'prompt-textarea' || 
            (target instanceof HTMLElement && target.matches('textarea[data-id="root"]'))) {
          return true;
        }
      }
      
      return false;
    });
    
    if (relevantMutations.length > 0) {
      log('dom_mutation', {
        count: relevantMutations.length,
        details: relevantMutations.map(m => ({
          type: m.type,
          target: m.target instanceof Element ? {
            tagName: m.target.tagName,
            id: m.target.id,
            className: m.target.className
          } : 'unknown',
          attributeName: m.attributeName
        }))
      });
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'tabindex', 'disabled', 'data-focused']
  });
  
  // Store the observer for cleanup if needed
  window._yeshieMutationObserver = observer;
  
  log('monitoring_started', { timestamp: new Date().toISOString() });
  
  // Set up periodic saving to background storage
  // Save logs every 30 seconds if logging is enabled and we have entries
  const autoSaveInterval = setInterval(() => {
    if (loggingEnabled && logEntries.length > 0) {
      saveLogsToStorage()
        .then(() => clearLogEntries());
    }
  }, 30000);
  
  // Store the interval for cleanup
  window._yeshieAutoSaveInterval = autoSaveInterval;
};

// Add these to the window for TypeScript
declare global {
  interface Window {
    _yeshieMonitoringStarted?: boolean;
    _yeshieMutationObserver?: MutationObserver;
    _yeshieAutoSaveInterval?: ReturnType<typeof setInterval>;
  }
}

// Export the API
export default {
  log,
  getLogEntries,
  clearLogEntries,
  copyLogsToClipboard,
  setLoggingEnabled,
  startMonitoring,
  saveLogsToStorage,
  getLogsFromStorage
}; 