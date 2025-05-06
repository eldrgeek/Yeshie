**Rule Name**: `structured-logging-convention`
**Applies to**: TypeScript (all project files with logging)
**Description**: Utilize the project's custom `log` function (from `../functions/DiagnosticLogger`) for all diagnostic and event logging. Ensure log messages follow a consistent structure: the first argument should be a clear event type or category string (e.g., `storage_get`, `api_error`), and the second argument should be a structured payload object containing relevant context, keys, values, or error messages.

**Good Example**:
```typescript
import { log } from "../functions/DiagnosticLogger";

// ...
try {
  const data = await storageGet<MyDataType>(itemKey);
  if (data) {
    log('storage_cache_hit', { key: itemKey, component: 'MyComponent' });
    // ... use data
  } else {
    log('storage_cache_miss', { key: itemKey, component: 'MyComponent' });
  }
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  log('storage_error', { operation: 'getItem', key: itemKey, error: errorMessage, component: 'MyComponent' });
}
```

**Bad Example**:
```typescript
console.log("Failed to get item " + itemKey + " in MyComponent. Error: " + error.message); // Unstructured
log('An error occurred while getting item'); // Lacks detail in payload
log({ message: 'storage_error', key: itemKey, error: errorMessage }); // Event type not the first argument
``` 