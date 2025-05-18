import { logInfo, logWarn, logError, logDebug } from './logger';
import { storageGet, storageSet } from './storage';
import { io, Socket } from "socket.io-client";

/**
 * Enum representing the possible states of a WebSocket connection.
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * Interface for WebSocket client configuration.
 */
export interface WebSocketConfig {
  serverUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  authToken?: string;
  pingInterval?: number;
  timeout?: number;
  debug?: boolean;
  namespace?: string;
}

/**
 * Storage key for WebSocket configuration.
 */
export const WEBSOCKET_CONFIG_KEY = 'yeshie_websocket_config';

/**
 * Default WebSocket configuration.
 */
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketConfig = {
  serverUrl: 'ws://localhost:3000',
  reconnectInterval: 2000,
  maxReconnectAttempts: 5,
  pingInterval: 30000,
  timeout: 5000,
  debug: false
};

/**
 * Type for message handlers.
 */
type MessageHandler<T = any> = (data: T) => void;

/**
 * A WebSocket client for communication with remote servers.
 */
export class WebSocketClient {
  private config: WebSocketConfig;
  private socket: Socket | null = null;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectCount: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private sessionId: string | null = null;
  
  /**
   * Creates a new WebSocket client.
   * @param config The WebSocket configuration.
   */
  constructor(config?: Partial<WebSocketConfig>) {
    this.config = { ...DEFAULT_WEBSOCKET_CONFIG, ...config };
    
    if (this.config.debug) {
      logDebug('WebSocket', 'Client initialized with config', { config: this.config });
    }
  }
  
  /**
   * Sets the session ID for this connection.
   * @param sessionId The session ID.
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    if (this.config.debug) {
      logDebug('WebSocket', `Session ID set to ${sessionId}`);
    }
  }
  
  /**
   * Loads configuration from storage.
   * @returns A promise that resolves when configuration is loaded.
   */
  async loadConfig(): Promise<void> {
    try {
      const savedConfig = await storageGet<WebSocketConfig>(WEBSOCKET_CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
        logInfo('WebSocket', 'Config loaded from storage', { config: this.config });
      }
    } catch (error) {
      logError('WebSocket', 'Failed to load config from storage', error);
    }
  }
  
  /**
   * Saves the current configuration to storage.
   * @returns A promise that resolves when configuration is saved.
   */
  async saveConfig(): Promise<void> {
    try {
      await storageSet(WEBSOCKET_CONFIG_KEY, this.config);
      logInfo('WebSocket', 'Config saved to storage');
    } catch (error) {
      logError('WebSocket', 'Failed to save config to storage', error);
    }
  }
  
  /**
   * Updates the WebSocket configuration.
   * @param config The new configuration options to apply.
   * @param saveToStorage Whether to save the changes to storage.
   * @returns A promise that resolves when the configuration is updated.
   */
  async updateConfig(config: Partial<WebSocketConfig>, saveToStorage: boolean = true): Promise<void> {
    this.config = { ...this.config, ...config };
    
    if (this.config.debug) {
      logDebug('WebSocket', 'Config updated', { config: this.config });
    }
    
    if (saveToStorage) {
      await this.saveConfig();
    }
    
    // If the connection is active and the server URL changed, reconnect
    if (this.isConnected() && config.serverUrl) {
      logInfo('WebSocket', 'Reconnecting due to server URL change');
      await this.reconnect();
    }
  }
  
  /**
   * Connects to the WebSocket server.
   * @returns A promise that resolves when connected.
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        this.status = ConnectionStatus.CONNECTING;
        logInfo('WebSocket', 'Connecting to server', { url: this.config.serverUrl });
        
        // Create connection options
        const opts: any = {
          reconnection: false, // We'll handle reconnection manually
          timeout: this.config.timeout
        };
        
        // Add auth token if available
        if (this.config.authToken) {
          opts.auth = { token: this.config.authToken };
        }
        
        // Connect with namespace if specified
        const url = this.config.namespace 
          ? `${this.config.serverUrl}/${this.config.namespace}`
          : this.config.serverUrl;
          
        this.socket = io(url, opts);
        
        // Set up event handlers
        this.socket.on('connect', () => {
          this.status = ConnectionStatus.CONNECTED;
          this.reconnectCount = 0;
          logInfo('WebSocket', 'Connected to server', { url });
          
          // If we have a session ID, send an init message
          if (this.sessionId) {
            this.send('init', { sessionId: this.sessionId });
          }
          
          resolve();
        });
        
        this.socket.on('disconnect', (reason) => {
          this.status = ConnectionStatus.DISCONNECTED;
          logWarn('WebSocket', 'Disconnected from server', { reason });
          
          // Attempt to reconnect if not closed intentionally
          if (reason !== 'io client disconnect') {
            this.attemptReconnect();
          }
        });
        
        this.socket.on('connect_error', (error) => {
          this.status = ConnectionStatus.ERROR;
          logError('WebSocket', 'Connection error', error);
          
          this.attemptReconnect();
          reject(error);
        });
        
        // Set up handler for all incoming messages
        this.socket.onAny((event, ...args) => {
          if (this.config.debug) {
            logDebug('WebSocket', `Received message: ${event}`, { args });
          }
          
          const handlers = this.messageHandlers.get(event);
          if (handlers) {
            for (const handler of handlers) {
              try {
                handler(args[0]);
              } catch (error) {
                logError('WebSocket', `Error in message handler for ${event}`, error);
              }
            }
          }
        });
        
      } catch (error) {
        this.status = ConnectionStatus.ERROR;
        logError('WebSocket', 'Failed to connect', error);
        this.attemptReconnect();
        reject(error);
      }
    }).finally(() => {
      this.connectionPromise = null;
    });
    
    return this.connectionPromise;
  }
  
  /**
   * Attempts to reconnect to the server.
   */
  private attemptReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Check if we've exceeded the max reconnect attempts
    if (this.reconnectCount >= this.config.maxReconnectAttempts) {
      logError('WebSocket', 'Maximum reconnect attempts reached, giving up');
      return;
    }
    
    this.reconnectCount++;
    this.status = ConnectionStatus.RECONNECTING;
    
    const delay = this.config.reconnectInterval * Math.pow(1.5, this.reconnectCount - 1);
    
    logInfo('WebSocket', `Will attempt to reconnect in ${delay}ms (attempt ${this.reconnectCount}/${this.config.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnect().catch((error) => {
        logError('WebSocket', 'Reconnection attempt failed', error);
      });
    }, delay);
  }
  
  /**
   * Reconnects to the WebSocket server.
   * @returns A promise that resolves when reconnected.
   */
  async reconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    return this.connect();
  }
  
  /**
   * Disconnects from the WebSocket server.
   * @returns A promise that resolves when disconnected.
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (!this.socket) {
      return;
    }
    
    return new Promise<void>((resolve) => {
      this.socket!.disconnect();
      this.socket = null;
      this.status = ConnectionStatus.DISCONNECTED;
      logInfo('WebSocket', 'Disconnected from server');
      resolve();
    });
  }
  
  /**
   * Sends a message to the WebSocket server.
   * @param type The message type.
   * @param payload The message payload.
   * @returns A promise that resolves when the message is sent.
   */
  async send<T>(type: string, payload: T): Promise<void> {
    if (!this.isConnected()) {
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Failed to connect to WebSocket server: ${error.message}`);
      }
    }
    
    if (this.config.debug) {
      logDebug('WebSocket', `Sending message: ${type}`, { payload });
    }
    
    return new Promise<void>((resolve, reject) => {
      try {
        this.socket!.emit(type, payload, () => {
          resolve();
        });
      } catch (error) {
        logError('WebSocket', `Failed to send message: ${type}`, error);
        reject(error);
      }
    });
  }
  
  /**
   * Registers a handler for a specific message type.
   * @param type The message type.
   * @param handler The message handler.
   */
  onMessage<T>(type: string, handler: MessageHandler<T>): void {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.push(handler as MessageHandler);
    this.messageHandlers.set(type, handlers);
    
    if (this.config.debug) {
      logDebug('WebSocket', `Registered handler for message type: ${type}`);
    }
  }
  
  /**
   * Removes a handler for a specific message type.
   * @param type The message type.
   * @param handler The message handler to remove.
   */
  offMessage<T>(type: string, handler: MessageHandler<T>): void {
    const handlers = this.messageHandlers.get(type);
    if (!handlers) {
      return;
    }
    
    const index = handlers.indexOf(handler as MessageHandler);
    if (index !== -1) {
      handlers.splice(index, 1);
      if (handlers.length === 0) {
        this.messageHandlers.delete(type);
      } else {
        this.messageHandlers.set(type, handlers);
      }
    }
    
    if (this.config.debug) {
      logDebug('WebSocket', `Removed handler for message type: ${type}`);
    }
  }
  
  /**
   * Checks if the client is connected.
   * @returns Whether the client is connected.
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED && !!this.socket?.connected;
  }
  
  /**
   * Gets the current connection status.
   * @returns The connection status.
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }
}

// Singleton instance
let instance: WebSocketClient | null = null;

/**
 * Gets the singleton WebSocket client instance.
 * @param config Optional configuration to apply.
 * @returns The WebSocket client instance.
 */
export function getWebSocketClient(config?: Partial<WebSocketConfig>): WebSocketClient {
  if (!instance) {
    instance = new WebSocketClient(config);
    
    // Load config from storage when first created
    instance.loadConfig().catch((error) => {
      logError('WebSocket', 'Failed to load config on initialization', error);
    });
  } else if (config) {
    // Update config if provided
    instance.updateConfig(config);
  }
  
  return instance;
} 