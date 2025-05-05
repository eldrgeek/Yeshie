/**
 * @fileoverview Provides a structured logging utility for the extension.
 */
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
  message: string;
  context?: LogContext;
}

// --- Constants for Log Storage ---
const LOG_STORAGE_KEY = 'yeshieSessionLogs';
const MAX_LOG_ENTRIES = 200; // Limit the number of logs stored

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
 * Logs a message with a specified level and optional context.
 *
 * @param level - The severity level of the log message.
 * @param message - The main message string to log.
 * @param context - Optional additional data related to the log entry.
 */
export function log(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    timestamp,
    level,
    message,
    ...(context && { context }), // Only include context if it exists
  };

  // 1. Log to console
  // Use appropriate console method based on level
  switch (level) {
    case 'debug':
      // Debug logs might be too verbose for production, could add a flag later
      console.debug(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context || '');
      break;
    case 'info':
      console.info(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context || '');
      break;
    case 'warn':
      console.warn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context || '');
      break;
    case 'error':
      console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context || '');
      break;
  }

  // 2. Log to storage (asynchronously, don't wait for it)
  logToStorage(logEntry); 

  // Potential future enhancement: Send logs to a background service or store them
}

// --- Specific Helper Log Functions ---

/** Logs an informational message. */
export function logInfo(message: string, context?: LogContext): void {
  log('info', message, context);
}

/** Logs a warning message. */
export function logWarn(message: string, context?: LogContext): void {
  log('warn', message, context);
}

/** Logs an error message. */
export function logError(message: string, context?: LogContext | Error): void {
  // If context is an Error object, extract relevant info
  if (context instanceof Error) {
    log('error', message, {
      errorMessage: context.message,
      stack: context.stack,
      name: context.name,
     });
  } else {
    log('error', message, context);
  }
}

/** Logs a debug message. */
export function logDebug(message: string, context?: LogContext): void {
    // Consider adding a build flag check here to disable debug logs in production
    log('debug', message, context);
} 