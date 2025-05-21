# Task K: SpeechInput Test Specification

## Summary
Write a detailed test specification covering manual and automated scenarios for the SpeechInput component. This document will guide future E2E tests and manual QA.

## Acceptance Criteria
- [ ] Document all command phrases and expected text output.
- [ ] Include scenarios for text append vs insertion at the cursor.
- [ ] Describe timing-sensitive cases such as pauses after "literally". Include specific examples like "literally period" vs "literally" *pause* "period".
- [ ] Outline setup steps and any mocks needed for automated tests.
- [ ] Spec lives under `docs` or `LLMNotes/testing`.

## Implementation Notes
- Base the spec on current SpeechInput logic in `extension/components/SpeechEditor.tsx`.
- Provide clear example transcripts and resulting text for each case.
- Link to this spec from `TASKS.md` for visibility.
