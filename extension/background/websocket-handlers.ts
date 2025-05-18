import { getWebSocketClient } from '../functions/websocket';
import type { WebSocketConfig } from '../functions/websocket';
import { logInfo, logError, logDebug } from '../functions/logger';
import { storageGet, storageSet } from '../functions/storage';

// Constants
const WEBSOCKET_SESSION_KEY = 'yeshie_websocket_session';

/**
 * Interface for WebSocket session information.
 */
export interface WebSocketSession {
  sessionId: string;
  serverUrl: string;
  timestamp: number;
}

/**
 * Initializes WebSocket handlers for the background script.
 */
export function initWebSocketHandlers() {
  logInfo('WebSocketHandlers', 'Initializing WebSocket handlers');
  
  // Set up message handlers for WebSocket operations
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'WEBSOCKET_CONNECT') {
      handleWebSocketConnect(message.config, message.sessionId)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => {
          logError('WebSocketHandlers', 'Error handling WebSocket connect', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }
    
    if (message.type === 'WEBSOCKET_DISCONNECT') {
      handleWebSocketDisconnect()
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('WebSocketHandlers', 'Error handling WebSocket disconnect', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    if (message.type === 'WEBSOCKET_SEND') {
      handleWebSocketSend(message.messageType, message.payload)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('WebSocketHandlers', 'Error handling WebSocket send', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    if (message.type === 'WEBSOCKET_STATUS') {
      const status = handleWebSocketStatus();
      sendResponse({ success: true, status });
      return false; // No async response needed
    }
    
    if (message.type === 'WEBSOCKET_CONFIG') {
      handleWebSocketConfig(message.config)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('WebSocketHandlers', 'Error handling WebSocket config', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  });
  
  // Try to restore previous session if available
  restorePreviousSession().catch(error => {
    logError('WebSocketHandlers', 'Error restoring previous WebSocket session', error);
  });
}

/**
 * Handles a request to connect to a WebSocket server.
 * @param config The WebSocket configuration.
 * @param sessionId Optional session ID.
 * @returns A promise that resolves with the connection result.
 */
async function handleWebSocketConnect(config?: Partial<WebSocketConfig>, sessionId?: string): Promise<{ connected: boolean }> {
  try {
    const client = getWebSocketClient(config);
    
    if (sessionId) {
      client.setSessionId(sessionId);
    }
    
    await client.connect();
    
    // Save session information
    const session: WebSocketSession = {
      sessionId: sessionId || 'default',
      serverUrl: client['config']?.serverUrl || 'unknown', // Access private property with caution
      timestamp: Date.now()
    };
    
    await storageSet(WEBSOCKET_SESSION_KEY, session);
    logInfo('WebSocketHandlers', 'WebSocket session saved', { session });
    
    return { connected: client.isConnected() };
  } catch (error) {
    logError('WebSocketHandlers', 'Failed to connect to WebSocket server', error);
    throw error;
  }
}

/**
 * Handles a request to disconnect from the WebSocket server.
 * @returns A promise that resolves when disconnected.
 */
async function handleWebSocketDisconnect(): Promise<void> {
  try {
    const client = getWebSocketClient();
    await client.disconnect();
    
    // Clear session information
    await storageSet(WEBSOCKET_SESSION_KEY, null);
    logInfo('WebSocketHandlers', 'WebSocket session cleared');
  } catch (error) {
    logError('WebSocketHandlers', 'Failed to disconnect from WebSocket server', error);
    throw error;
  }
}

/**
 * Handles a request to send a message via WebSocket.
 * @param messageType The message type.
 * @param payload The message payload.
 * @returns A promise that resolves when the message is sent.
 */
async function handleWebSocketSend(messageType: string, payload: any): Promise<void> {
  try {
    const client = getWebSocketClient();
    
    if (!client.isConnected()) {
      await client.connect();
    }
    
    await client.send(messageType, payload);
    logDebug('WebSocketHandlers', `Sent WebSocket message: ${messageType}`, { payload });
  } catch (error) {
    logError('WebSocketHandlers', `Failed to send WebSocket message: ${messageType}`, error);
    throw error;
  }
}

/**
 * Handles a request to get the WebSocket status.
 * @returns The WebSocket status.
 */
function handleWebSocketStatus(): { connected: boolean, status: string } {
  const client = getWebSocketClient();
  return {
    connected: client.isConnected(),
    status: client.getStatus()
  };
}

/**
 * Handles a request to update the WebSocket configuration.
 * @param config The new configuration.
 * @returns A promise that resolves when the configuration is updated.
 */
async function handleWebSocketConfig(config: Partial<WebSocketConfig>): Promise<void> {
  try {
    const client = getWebSocketClient();
    await client.updateConfig(config, true);
    logInfo('WebSocketHandlers', 'WebSocket configuration updated', { config });
  } catch (error) {
    logError('WebSocketHandlers', 'Failed to update WebSocket configuration', error);
    throw error;
  }
}

/**
 * Attempts to restore a previous WebSocket session.
 * @returns A promise that resolves when the session is restored.
 */
async function restorePreviousSession(): Promise<void> {
  try {
    const session = await storageGet<WebSocketSession>(WEBSOCKET_SESSION_KEY);
    
    if (!session) {
      logInfo('WebSocketHandlers', 'No previous WebSocket session found');
      return;
    }
    
    // Check if the session is too old (e.g., more than 1 hour)
    const MAX_SESSION_AGE = 60 * 60 * 1000; // 1 hour in milliseconds
    if (Date.now() - session.timestamp > MAX_SESSION_AGE) {
      logInfo('WebSocketHandlers', 'Previous WebSocket session expired', { session });
      await storageSet(WEBSOCKET_SESSION_KEY, null);
      return;
    }
    
    logInfo('WebSocketHandlers', 'Restoring previous WebSocket session', { session });
    
    // Connect with the previous session information
    await handleWebSocketConnect(
      { serverUrl: session.serverUrl },
      session.sessionId
    );
    
    logInfo('WebSocketHandlers', 'Previous WebSocket session restored');
  } catch (error) {
    logError('WebSocketHandlers', 'Failed to restore previous WebSocket session', error);
    throw error;
  }
} 