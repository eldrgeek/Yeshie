/**
 * @fileoverview Provides a structured logging utility for the extension.
 */

// Define constants first, before any imports or code that might import this module
// These need to be defined before any code that imports this module
const LOG_CONFIG_STORAGE_KEY = 'yeshie_log_configuration';
const MAX_LOG_ENTRIES = 200; // Limit the number of logs stored
const LOG_STORAGE_KEY = 'yeshieSessionLogs';

// Now import dependencies
import { storageGet, storageSet, storageRemove } from './storage'; // Import storage functions

/**
 * Defines the possible levels for log messages.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Represents the structure of additional context data that can be logged.
 */
export interface LogContext {
  [key: string]: any;
}

/**
 * Represents the structure of a single log entry.
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  feature: string; // Added feature field
  message: string;
  context?: LogContext;
}

// --- Configuration --- //

/** Defines the structure for log feature configuration */
export interface LogConfig {
  [feature: string]: boolean;
}

// Define default features and their states
// Add more features as needed (e.g., 'Stepper', 'TabsUI', 'Background', 'API', 'Storage')
const defaultLogConfig: LogConfig = {
  Core: true, // Basic initialization, critical errors
  UI: true, // General UI interactions, toasts
  Stepper: false, // Detailed stepper execution (can be verbose)
  Background: false, // Background script lifecycle, major events (disabled by default due to noise)
  Storage: false, // Storage get/set operations
  Recording: false, // User action recording feature
  TestViewer: true, // Test viewer dialog interactions
  // Add others...
};

// Variable to hold the active configuration
let currentLogConfig: LogConfig = { ...defaultLogConfig };
let configLoaded = false;

// Queue for logs that arrive before config is loaded
let pendingLogs: { level: LogLevel; feature: string; message: string; context?: LogContext }[] = [];

/** Loads log configuration from storage or initializes with defaults */
async function loadLogConfig(): Promise<void> {
  try {
    const savedConfig = await storageGet<LogConfig>(LOG_CONFIG_STORAGE_KEY);
    if (savedConfig) {
      // Merge saved config with defaults to ensure all features are present
      currentLogConfig = { ...defaultLogConfig, ...savedConfig };
      console.log('[Logger] Loaded configuration from storage.', currentLogConfig);
    } else {
      currentLogConfig = { ...defaultLogConfig };
      console.log('[Logger] No configuration found, initializing with defaults.', currentLogConfig);
      // Save the defaults if none existed
      await storageSet(LOG_CONFIG_STORAGE_KEY, currentLogConfig);
    }
  } catch (error) {
    console.error('[Logger] Failed to load log configuration, using defaults.', error);
    currentLogConfig = { ...defaultLogConfig };
  } finally {
    configLoaded = true;
    
    // Process any pending logs that were queued during initialization
    if (pendingLogs.length > 0) {
      console.log(`[Logger] Processing ${pendingLogs.length} queued logs after config load.`);
      const logsToProcess = [...pendingLogs]; // Copy the array
      pendingLogs = []; // Clear the queue
      
      // Process each queued log
      logsToProcess.forEach(({ level, feature, message, context }) => {
        log(level, feature, message, context);
      });
    }
  }
}

/** Returns the current log configuration (primarily for UI) */
export function getLogConfig(): LogConfig {
  return { ...currentLogConfig };
}

/** Updates the log configuration and saves it */
export async function updateLogConfig(newConfig: Partial<LogConfig>): Promise<void> {
  currentLogConfig = { ...currentLogConfig, ...newConfig };
  try {
    await storageSet(LOG_CONFIG_STORAGE_KEY, currentLogConfig);
    console.log('[Logger] Log configuration updated and saved.', currentLogConfig);
  } catch (error) {
    console.error('[Logger] Failed to save updated log configuration.', error);
    // Optionally revert currentLogConfig here, but might be complex
  }
}

// --- End Configuration --- //

// --- Function to add a log entry to storage ---
async function logToStorage(logEntry: LogEntry): Promise<void> {
  try {
    const currentLogs = await storageGet<LogEntry[]>(LOG_STORAGE_KEY) || [];
    currentLogs.push(logEntry);

    // Trim old logs if exceeding the limit
    if (currentLogs.length > MAX_LOG_ENTRIES) {
      currentLogs.splice(0, currentLogs.length - MAX_LOG_ENTRIES); // Remove oldest entries
    }

    await storageSet(LOG_STORAGE_KEY, currentLogs);
  } catch (error) {
    // Log storage error to console directly to avoid infinite loop if logger itself fails
    console.error('[Logger] Failed to write log to storage:', error, logEntry);
  }
}

/**
 * Clears all session logs from storage.
 */
export async function clearSessionLogs(): Promise<void> {
    try {
        await storageRemove(LOG_STORAGE_KEY);
        console.log('[Logger] Session logs cleared from storage.');
    } catch (error) {
        console.error('[Logger] Failed to clear session logs from storage:', error);
    }
}

/**
 * Retrieves all session logs from storage.
 * @returns Promise that resolves to an array of log entries
 */
export async function getSessionLogs(): Promise<LogEntry[]> {
    try {
        const logs = await storageGet<LogEntry[]>(LOG_STORAGE_KEY) || [];
        console.log(`[Logger] Retrieved ${logs.length} session logs from storage.`);
        return logs;
    } catch (error) {
        console.error('[Logger] Failed to retrieve session logs from storage:', error);
        return [];
    }
}

/**
 * Central log processing function.
 *
 * @param level - The severity level of the log message.
 * @param feature - The feature/category this log belongs to.
 * @param message - The main message string to log.
 * @param context - Optional additional data related to the log entry.
 */
function log(level: LogLevel, feature: string, message: string, context?: LogContext): void {
  // If config not loaded yet, queue the log for processing later
  if (!configLoaded) {
      pendingLogs.push({ level, feature, message, context });
      // Still log to console for immediate visibility (optional)
      console.log(`[Logger] Queued log (config loading...): [${level.toUpperCase()}] ${feature}: ${message}`);
      return;
  }

  // Check if this feature's logging is enabled
  // Always log errors regardless of feature toggle (can be refined later)
  if (level !== 'error' && !currentLogConfig[feature]) {
    // Optional: console.debug(`[Logger] Log skipped for disabled feature '${feature}':`, { level, message });
    return; // Don't log if feature is disabled (and it's not an error)
  }

  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    timestamp,
    level,
    feature, // Added feature
    message,
    ...(context && { context }), // Only include context if it exists
  };

  // Log to storage for the Log Viewer (asynchronously)
  logToStorage(logEntry);
}

// --- Specific Helper Log Functions (Updated Signatures) ---

/** Logs an informational message. */
export function logInfo(feature: string, message: string, context?: LogContext): void {
  log('info', feature, message, context);
}

/** Logs a warning message. */
export function logWarn(feature: string, message: string, context?: LogContext): void {
  log('warn', feature, message, context);
}

/** Logs an error message. */
export function logError(feature: string, message: string, context?: LogContext | Error): void {
  // If context is an Error object, extract relevant info
  if (context instanceof Error) {
    log('error', feature, message, {
      errorMessage: context.message,
      stack: context.stack,
      name: context.name,
     });
  } else {
    log('error', feature, message, context);
  }
}

/** Logs a debug message. */
export function logDebug(feature: string, message: string, context?: LogContext): void {
    log('debug', feature, message, context);
}

// --- Initialize --- //
// Load the configuration when the module is imported/initialized.
// Note: This is async, so there's a brief moment logs might be skipped by the `configLoaded` check.
loadLogConfig(); 