# API Key and Sensitive Data Security

## Rule
Sensitive credentials, such as API keys, must never be hardcoded directly into client-side scripts (e.g., background scripts, content scripts, UI components).

- For user-provided keys, utilize secure storage mechanisms like `chrome.storage.local`.
- If the application itself manages the key (not applicable for user-specific keys entered in the extension), a backend proxy server approach is preferred for handling API communication.

## Rationale
Hardcoding sensitive data in client-side code exposes it to potential theft and misuse, leading to security vulnerabilities and potential financial impact. Storing user-provided keys in `chrome.storage.local` keeps them sandboxed to the user's extension instance. 