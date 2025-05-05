import { log } from './DiagnosticLogger';

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
      log('storage_error', {
          operation: operationName,
          attempt: attempts,
          maxAttempts: MAX_RETRIES,
          error: error.message,
          willRetry: !isLastError
      });
      if (isLastError) {
        console.error(`Storage operation '${operationName}' failed after ${attempts} attempts:`, error);
        throw new Error(`Storage operation '${operationName}' failed: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempts - 1))); // Exponential backoff
    }
  }
  // Should not be reachable due to throw in the loop, but required by TS
  throw new Error(`Storage operation '${operationName}' failed unexpectedly after exhausting retries.`);
}

/**
 * Retrieves an item from chrome.storage.local.
 * @param key The key of the item to retrieve.
 * @returns The value associated with the key, or undefined if not found.
 */
export async function storageGet<T>(key: string): Promise<T | undefined> {
  return performStorageOperation(async () => {
    const result = await chrome.storage.local.get(key);
    // Check for runtime.lastError, although less common with promises
    if (chrome.runtime.lastError) {
        console.error(`Error getting key "${key}":`, chrome.runtime.lastError.message);
        throw new Error(chrome.runtime.lastError.message);
    }
    log('storage_get', { key, found: key in result });
    return result[key] as T | undefined;
  }, `get('${key}')`);
}

/**
 * Retrieves multiple items from chrome.storage.local.
 * @param keys An array of keys to retrieve.
 * @returns An object with the key-value pairs found.
 */
export async function storageGetMultiple<T>(keys: string[]): Promise<{ [key: string]: T }> {
     return performStorageOperation(async () => {
        const result = await chrome.storage.local.get(keys);
        if (chrome.runtime.lastError) {
            console.error(`Error getting multiple keys:`, chrome.runtime.lastError.message);
            throw new Error(chrome.runtime.lastError.message);
        }
        log('storage_get_multiple', { keys, count: Object.keys(result).length });
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
        const result = await chrome.storage.local.get(null);
        if (chrome.runtime.lastError) {
            console.error(`Error getting all items:`, chrome.runtime.lastError.message);
            throw new Error(chrome.runtime.lastError.message);
        }
        log('storage_get_all', { count: Object.keys(result).length });
        return result;
     }, 'getAll');
}


/**
 * Saves an item to chrome.storage.local.
 * @param key The key to store the item under.
 * @param value The value to store.
 */
export async function storageSet<T>(key: string, value: T): Promise<void> {
  await performStorageOperation(async () => {
    await chrome.storage.local.set({ [key]: value });
    if (chrome.runtime.lastError) {
        console.error(`Error setting key "${key}":`, chrome.runtime.lastError.message);
        throw new Error(chrome.runtime.lastError.message);
    }
    log('storage_set', { key });
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
            console.error(`Error setting multiple items:`, chrome.runtime.lastError.message);
            throw new Error(chrome.runtime.lastError.message);
        }
        log('storage_set_multiple', { keys: Object.keys(items) });
    }, `setMultiple([${Object.keys(items).join(', ')}])`);
}


/**
 * Removes an item from chrome.storage.local.
 * @param key The key of the item to remove.
 */
export async function storageRemove(key: string): Promise<void> {
  await performStorageOperation(async () => {
    await chrome.storage.local.remove(key);
    if (chrome.runtime.lastError) {
        console.error(`Error removing key "${key}":`, chrome.runtime.lastError.message);
        throw new Error(chrome.runtime.lastError.message);
    }
    log('storage_remove', { key });
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
            console.error(`Error removing multiple keys:`, chrome.runtime.lastError.message);
            throw new Error(chrome.runtime.lastError.message);
        }
        log('storage_remove_multiple', { keys });
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
        console.error(`Error clearing storage:`, chrome.runtime.lastError.message);
        throw new Error(chrome.runtime.lastError.message);
    }
    log('storage_clear', {});
  }, 'clear');
}

/**
 * Logs current storage usage.
 */
export async function logStorageUsage(): Promise<void> {
  try {
    const localItems = await storageGetAll(); // Use our wrapper
    const localCount = Object.keys(localItems).length;
    log('storage_usage', { area: 'local', count: localCount });
    console.log(`Storage Check: chrome.storage.local item count: ${localCount}`);

    // Note: We are centralizing on chrome.storage.local.
    // If sync storage is needed later, add similar wrappers for it.
    // const syncItems = await chrome.storage.sync.get(null); // Direct call - replace if needed
    // const syncCount = Object.keys(syncItems).length;
    // log('storage_usage', { area: 'sync', count: syncCount });
    // console.log(`Storage Check: chrome.storage.sync item count: ${syncCount}`);
    // if (syncCount >= 510) { // Check against the 512 limit
    //     log('storage_warning', { area: 'sync', message: 'MAX_ITEMS limit nearing', count: syncCount });
    //     console.warn("chrome.storage.sync is near or at its MAX_ITEMS limit!");
    // }
  } catch (error) {
    // Check if error is an instance of Error before accessing message
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error checking storage usage:", error);
    log('storage_error', { operation: 'logStorageUsage', error: errorMessage });
  }
} 