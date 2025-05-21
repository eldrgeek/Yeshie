# Task H: Singleton Speech Input Service

## Summary
Manage the SpeechInput recognition service globally so only the focused component in the active tab transcribes. The background script coordinates which component is active.

## Acceptance Criteria
- [ ] Only one SpeechInput instance is actively processing results at any time.
- [ ] When tab focus changes, the SpeechInput in the newly focused tab gains control and others pause.
- [ ] Losing focus stops transcription without shutting down the recognition service.

## Implementation Notes
- Each SpeechInput registers with the background script when it mounts and unregisters on unmount.
- Use `chrome.tabs.onActivated` and `chrome.windows.onFocusChanged` listeners to track the active tab.
- Background script sends messages to start or pause transcription based on focus events.
