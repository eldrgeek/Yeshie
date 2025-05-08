// shared/utils/logger.ts
export function logInfo(message: string, ...optionalParams: any[]): void {
  console.log(message, ...optionalParams);
}

export function logWarn(message: string, ...optionalParams: any[]): void {
  console.warn(message, ...optionalParams);
}

export function logError(message: string, ...optionalParams: any[]): void {
  console.error(message, ...optionalParams);
} 