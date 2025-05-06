# Chrome Extension Reload Best Practices

## Rule
Always ensure the Chrome extension is manually reloaded from the `chrome://extensions` page after making significant changes, especially to:

- Background scripts (Service Workers)
- `manifest.json`
- Content scripts that are injected at `document_start`
- Other core components affecting the extension's initial load or permissions.

## Rationale
Browsers, especially Chrome, may not always immediately pick up changes to an extension's core files without a manual reload via `chrome://extensions`. This can lead to debugging outdated code and behavior. Reloading ensures the latest version is active, particularly for background processes and manifest configurations. 