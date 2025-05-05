import { logError } from './logger';
import type { LogContext } from './logger';

/**
 * Processes an error, logs it, and formats a detailed string representation.
 *
 * @param error - The error object or value caught.
 * @param context - Optional additional context data related to the error.
 * @returns A formatted string containing error details suitable for copying.
 */
export function handleError(error: unknown, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  let errorMessage = 'An unknown error occurred';
  let errorStack = 'Stack trace not available';
  let errorName = 'UnknownError';

  // Log the error first using the structured logger
  logError('Error caught', { ...(context || {}), error });

  // Extract details from the error object
  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || errorStack;
    errorName = error.name || errorName;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    try {
      errorMessage = JSON.stringify(error);
    } catch (e) {
      errorMessage = 'Could not stringify non-Error object';
    }
  }

  // Format the detailed string for copying
  const details = [
    `Timestamp: ${timestamp}`,
    `Error Type: ${errorName}`,
    `Message: ${errorMessage}`,
    ...(context ? [`Context: ${JSON.stringify(context, null, 2)}`] : []),
    `Stack Trace: ${errorStack}`,
  ].join('\n--------------------\n');

  return details;
} 