# Configuration Centralization

## Rule
Configuration settings, especially those involving sensitive data entry (like API keys) or core extension functionality, should be centralized.

- Prefer dedicated options pages (e.g., the main extension tab page at `tabs/index.html`) over duplicating configuration UI in multiple content scripts or sidebars.

## Rationale
Centralizing configuration improves maintainability by having a single source of truth for settings. It also provides a clearer and more consistent user experience, as users will know where to find and manage all extension settings. 