# Effective Use of Browser Developer Tools

## Rule
Thoroughly utilize browser developer tools for debugging all parts of the extension.

- Always inspect console logs for background scripts (service workers), content scripts, and any extension-specific pages (like the options or tab page).
- Pay close attention to errors, warnings, and unexpected log outputs to identify and resolve issues promptly.

## Rationale
Browser developer tools provide invaluable insights into the runtime behavior of an extension. Console logs are often the first place where errors manifest, and understanding them is crucial for efficient debugging and development. 