<!-- Codex task derived from Task I in TASKS.md -->
# Task I: Always-Listening SpeechInput

## Summary
Refactor the SpeechInput component so the speech recognition service stays running in the background. Transcription of results only occurs when the mic icon is toggled on.

## Acceptance Criteria
- [ ] Recognition starts on mount and restarts automatically after `onend` or transient errors.
- [ ] The mic button toggles an `isTranscribing` state without stopping the recognition service.
- [ ] When `isTranscribing` is false, incoming results are ignored.
- [ ] UI reflects the listening and transcribing states separately.

## Implementation Notes
- Start the recognition service once using `startListening` in an effect.
- Keep it alive with a retry timer if the service ends unexpectedly.
- Update `handleResult` to skip processing when transcription is disabled.
- Adjust status messages and styles to clarify when the mic is listening but idle.
