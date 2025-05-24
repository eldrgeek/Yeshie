<!-- Codex task derived from Task G in TASKS.md -->
# Task G: Dialog Speech Input Integration

## Summary
Ensure all dialog components that collect text use the SpeechInput component so users can dictate instead of typing.

## Acceptance Criteria
- [ ] Every dialog with a text field renders `<SpeechInput>` instead of a raw `<textarea>` or `<input>`.
- [ ] Dialogs automatically focus their SpeechInput when opened.
- [ ] Manual typing remains possible without breaking SpeechInput features.

## Implementation Notes
- Audit the extension for dialogs such as ReportDialog, YeshieEditor, and any others that accept text.
- Replace existing inputs with the SpeechInput component and wire up `onSubmit`/`onChange` props as needed.
- Add ref handling so the SpeechInput textarea receives focus when the dialog becomes visible.
