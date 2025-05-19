// shared/utils/logger.ts
export function logInfo(message, ...optionalParams) {
    console.log(message, ...optionalParams);
}
export function logWarn(message, ...optionalParams) {
    console.warn(message, ...optionalParams);
}
export function logError(message, ...optionalParams) {
    console.error(message, ...optionalParams);
}
