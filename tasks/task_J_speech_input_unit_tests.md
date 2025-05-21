# Task J: SpeechInput Unit Tests

## Summary
Create comprehensive unit tests covering SpeechInput behavior, including buffer insertion logic, cursor movement, and command timing.

## Acceptance Criteria
- [ ] Tests verify text is appended correctly when the cursor is at the end.
- [ ] Tests verify insertion at an arbitrary cursor position preserves existing text.
- [ ] Tests cover command interpretation such as "literally period" vs pauses around "literally".
- [ ] Transcription toggle state is respected during tests.
- [ ] All tests run via `pnpm test` and pass in CI.

## Implementation Notes
- Use Vitest and React Testing Library, mocking the SpeechRecognition API.
- Simulate interim and final result events to test insertion logic.
- Include cases where the user manually moves the cursor between recognition events.
