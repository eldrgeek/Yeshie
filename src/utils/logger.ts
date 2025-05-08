// src/utils/logger.ts
export function logInfo(message: string, ...optionalParams: any[]): void {
  console.log(`[INFO] ${message}`, ...optionalParams);
}

export function logWarn(message: string, ...optionalParams: any[]): void {
  console.warn(`[WARN] ${message}`, ...optionalParams);
}

export function logError(message: string, ...optionalParams: any[]): void {
  console.error(`[ERROR] ${message}`, ...optionalParams);
} 