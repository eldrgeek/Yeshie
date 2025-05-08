import { logError, logInfo, logWarn } from "../functions/logger";
import { handleError } from "../functions/errorHandler";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

/**
 * Performs a storage operation with retry logic for transient errors.
 */
async function performStorageOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      const isLastError = attempts === MAX_RETRIES;
      if (isLastError) {
        logError("Storage", `Storage operation '${operationName}' permanently failed after ${attempts} attempts.`, { error, operationName, attempts });
        handleError(error, { operation: operationName, attempts, willRetry: false});
      } else {
        logWarn("Storage", `Storage operation '${operationName}' failed, attempt ${attempts}. Retrying...`, { error, operationName, attempts, willRetry: true });
      }
      if (isLastError) {
        throw new Error(`Storage operation '${operationName}' failed: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempts - 1)));
    }
  }
  throw new Error(`Storage operation '${operationName}' failed unexpectedly after exhausting retries.`);
}

/**
 * Retrieves an item from chrome.storage.local.
 * @param key The key of the item to retrieve.
 * @returns The value associated with the key, or undefined if not found.
 */
export async function storageGet<T>(key: string): Promise<T | undefined> {
  return performStorageOperation<T | undefined>(async () => {
    const result = await chrome.storage.local.get(key);
    if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message);
        logError("Storage", `Error getting key "${key}"`, { error: err, key });
        handleError(err, { operation: 'storageGet', key });
        throw err;
    }
    return result[key] as T | undefined;
  }, `get('${key}')`);
}

/**
 * Retrieves multiple items from chrome.storage.local.
 * @param keys An array of keys to retrieve.
 * @returns An object with the key-value pairs found.
 */
export async function storageGetMultiple<T>(keys: string[]): Promise<{ [key: string]: T }> {
     return performStorageOperation<{ [key: string]: T }>(async () => {
        const result = await chrome.storage.local.get(keys);
        if (chrome.runtime.lastError) {
            const err = new Error(chrome.runtime.lastError.message);
            logError("Storage", `Error getting multiple keys`, { error: err, keys });
            handleError(err, { operation: 'storageGetMultiple', keys });
            throw err;
        }
        return result as { [key: string]: T };
     }, `getMultiple([${keys.join(', ')}])`);
}

/**
 * Retrieves all items from chrome.storage.local.
 * Use with caution, can be slow for large storage.
 * @returns An object containing all items in local storage.
 */
export async function storageGetAll(): Promise<{ [key: string]: any }> {
    return performStorageOperation<{ [key: string]: any }>(async () => {
        const result = await chrome.storage.local.get(null) as unknown as { [key: string]: any };
        if (chrome.runtime.lastError) {
            const err = new Error(chrome.runtime.lastError.message);
            logError("Storage", `Error getting all items`, { error: err });
            handleError(err, { operation: 'storageGetAll' });
            throw err;
        }
        return result;
     }, 'getAll');
}


/**
 * Saves an item to chrome.storage.local.
 * @param key The key to store the item under.
 * @param value The value to store.
 */
export async function storageSet<T>(key: string, value: T): Promise<void> {
  await performStorageOperation<void>(async () => {
    await chrome.storage.local.set({ [key]: value });
    if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message);
        logError("Storage", `Error setting key "${key}"`, { error: err, key, value });
        handleError(err, { operation: 'storageSet', key, value });
        throw err;
    }
  }, `set('${key}')`);
}

/**
 * Saves multiple items to chrome.storage.local.
 * @param items An object containing key-value pairs to store.
 */
export async function storageSetMultiple(items: { [key: string]: any }): Promise<void> {
    await performStorageOperation<void>(async () => {
        await chrome.storage.local.set(items);
        if (chrome.runtime.lastError) {
            const err = new Error(chrome.runtime.lastError.message);
            logError("Storage", `Error setting multiple items`, { error: err, keys: Object.keys(items) });
            handleError(err, { operation: 'storageSetMultiple', keys: Object.keys(items) });
            throw err;
        }
    }, `setMultiple([${Object.keys(items).join(', ')}])`);
}


/**
 * Removes an item from chrome.storage.local.
 * @param key The key of the item to remove.
 */
export async function storageRemove(key: string): Promise<void> {
  await performStorageOperation<void>(async () => {
    await chrome.storage.local.remove(key);
    if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message);
        logError("Storage", `Error removing key "${key}"`, { error: err, key });
        handleError(err, { operation: 'storageRemove', key });
        throw err;
    }
  }, `remove('${key}')`);
}

/**
 * Removes multiple items from chrome.storage.local.
 * @param keys An array of keys to remove.
 */
export async function storageRemoveMultiple(keys: string[]): Promise<void> {
    await performStorageOperation<void>(async () => {
        await chrome.storage.local.remove(keys);
        if (chrome.runtime.lastError) {
            const err = new Error(chrome.runtime.lastError.message);
            logError("Storage", `Error removing multiple keys`, { error: err, keys });
            handleError(err, { operation: 'storageRemoveMultiple', keys });
            throw err;
        }
    }, `removeMultiple([${keys.join(', ')}])`);
}


/**
 * Clears all items from chrome.storage.local.
 * Use with caution!
 */
export async function storageClear(): Promise<void> {
  await performStorageOperation<void>(async () => {
    await chrome.storage.local.clear();
    if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message);
        logError("Storage", `Error clearing storage`, { error: err });
        handleError(err, { operation: 'storageClear' });
        throw err;
    }
  }, 'clear');
}

/**
 * Logs current storage usage.
 */
export async function logStorageUsage(): Promise<void> {
  try {
    const localItems = await storageGetAll();
    const localCount = Object.keys(localItems).length;
    logInfo("Storage", `chrome.storage.local item count: ${localCount}`);

    // Note: We are centralizing on chrome.storage.local.
    // If sync storage is needed later, add similar wrappers for it.
    // const syncItems = await chrome.storage.sync.get(null);
    // const syncCount = Object.keys(syncItems).length;
    // logInfo("Storage", `chrome.storage.sync item count: ${syncCount}`);
    // if (syncCount >= 510) { 
    //     logWarn("Storage", "chrome.storage.sync is near or at its MAX_ITEMS limit!", { area: 'sync', count: syncCount });
    // }
  } catch (error) {
    handleError(error, { operation: 'logStorageUsage' });
  }
} 