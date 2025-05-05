import React, { useState, useEffect } from 'react';
import { storageGet, storageRemove } from '../functions/storage';
import { logInfo, logWarn, logError, logDebug } from '../functions/logger';
import type { LogEntry } from '../functions/logger'; // Import the LogEntry type
import { handleError } from '../functions/errorHandler';
import './LogViewer.css'; // Import CSS for styling

const LOG_STORAGE_KEY = 'yeshieSessionLogs'; // Reuse the key from logger

interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string) => void; // Function to display toast messages
}

function LogViewer({ isOpen, onClose, showToast }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setLogs([]); // Clear previous logs before loading new ones

      storageGet<LogEntry[]>(LOG_STORAGE_KEY)
        .then(storedLogs => {
          const currentLogs = storedLogs || [];
          setLogs(currentLogs);
          logDebug(`[LogViewer] Fetched ${currentLogs.length} logs from storage.`);
          
          if (currentLogs.length > 0) {
              // Format logs for clipboard (Keep using simpler format for copy)
              const logTextForClipboard = currentLogs.map(log => 
                  `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${log.context ? ` ${JSON.stringify(log.context)}` : ''}`
              ).join('\n');
              
              navigator.clipboard.writeText(logTextForClipboard)
                .then(() => {
                   logInfo('[LogViewer] Session logs automatically copied to clipboard on open.');
                   showToast('Session logs copied to clipboard!');
                })
                .catch(clipError => {
                    handleError(clipError, { operation: 'LogViewer - initialCopyToClipboard' });
                    showToast('Failed to auto-copy logs to clipboard.');
                });
          } else {
              showToast('No session logs found to copy.');
          }
        })
        .catch(storageError => {
           const errorDetails = handleError(storageError, { operation: 'LogViewer - fetchLogs' });
           setError(`Failed to load logs. Details:\n${errorDetails}`); // Show error in the viewer
           showToast('Error loading session logs.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, showToast]); // Rerun when isOpen changes

  const handleClearLogs = async () => {
    try {
      await storageRemove(LOG_STORAGE_KEY);
      setLogs([]); // Clear logs in the UI
      logInfo('Session logs cleared by user from LogViewer.');
      showToast('Session logs cleared.');
    } catch (clearError) {
       handleError(clearError, { operation: 'LogViewer - clearLogs' });
       showToast('Failed to clear logs from storage.');
    }
  };

  const handleCopyLogs = () => {
      if (logs.length === 0) {
          showToast('No logs to copy.');
          return;
      }
      const logTextForClipboard = logs.map(log => 
          `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${log.context ? ` ${JSON.stringify(log.context)}` : ''}`
      ).join('\n');

      navigator.clipboard.writeText(logTextForClipboard)
        .then(() => {
           logInfo('[LogViewer] Session logs manually copied to clipboard.');
           showToast('Logs copied to clipboard!');
        })
        .catch(clipError => {
            handleError(clipError, { operation: 'LogViewer - manualCopyToClipboard' });
            showToast('Failed to copy logs to clipboard.');
        });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="log-viewer-backdrop">
      <div className="log-viewer-content">
        <h3>Session Logs</h3>
        <div className="log-viewer-area">
          {loading && <p>Loading logs...</p>}
          {error && <pre className="log-viewer-error">{error}</pre>}
          {!loading && !error && logs.length === 0 && <p>No logs recorded in this session yet.</p>}
          {!loading && !error && logs.length > 0 && (
            logs.map((log, index) => (
              <div key={index} className={`log-entry log-entry-${log.level}`}> 
                <span className="log-entry-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="log-entry-level">{log.level}</span>
                <span className="log-entry-message">{log.message}</span>
                {log.context && (
                  <pre className="log-entry-context">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
        <div className="log-viewer-actions">
          <button 
              onClick={handleCopyLogs}
              className="button-copy"
              disabled={loading || logs.length === 0}
              title="Copy currently displayed logs to clipboard"
          >
            Copy Logs
          </button>
          <button 
              onClick={handleClearLogs} 
              className="button-secondary" 
              disabled={loading || logs.length === 0}
              title="Clear logs from storage for this session"
          >
            Clear Logs
          </button>
          <button onClick={onClose} disabled={loading}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default LogViewer; 