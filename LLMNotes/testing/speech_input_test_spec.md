---
title: SpeechInput Test Specification
last_updated: 2025-05-21
author: Codex
category: testing
priority: 2
status: draft
dependencies:
  - file: extension/components/SpeechEditor.tsx
    sha: current
related_notes:
  - testing/test_plan.md
---

# SpeechInput Test Specification

## Overview
This document describes manual and automated test scenarios for the SpeechInput component. It consolidates command phrases, cursor handling behaviours and timing-sensitive cases to guide future E2E and unit tests.

## Command Phrase Mapping
The SpeechInput supports special phrases that translate into punctuation or control characters. The following table summarises built‑in commands and their expected output:

| Phrase | Output | Notes |
| ------ | ------ | ----- |
| `period` | `.` | inserts punctuation after current word |
| `comma` | `,` | |
| `question mark` | `?` | |
| `exclamation point` / `exclamation mark` | `!` | |
| `colon` | `:` | |
| `semicolon` | `;` | |
| `hyphen` / `dash` | `-` | no surrounding space |
| `ellipsis` | `...` | |
| `open quote` | `"` | space before |
| `close quote` | `"` | space after |
| `single quote` | `'` | space before |
| `apostrophe` | `'` | no surrounding space |
| `quote` | `"` | space before |
| `open paren` | `(` | space before |
| `close paren` | `)` | space after |
| `open bracket` | `[` | space before |
| `close bracket` | `]` | space after |
| `open brace` | `{` | space before |
| `close brace` | `}` | space after |
| `new line` | `\n` | removes trailing space before newline |
| `all caps` | toggles uppercase mode | continues until `end caps` |
| `end caps` | exit uppercase mode | |
| `literally <command>` | inserts `<command>` text | e.g. `literally period` -> `period` |

## Text Insertion vs Append
1. **Append at end**: When the cursor is at the end of the text area, dictated words and punctuation are appended. Unit tests should verify that final text equals previous text plus transcribed words.
2. **Insert at cursor**: When the user moves the cursor into the middle of the text, new words are inserted without overwriting existing content. Tests should simulate cursor movement between recognition events and ensure the buffer reflects correct insertion.

## Timing-Sensitive Cases
Certain phrases depend on pause timing:
- Saying `literally period` in one utterance should result in the text `period`.
- Saying `literally` followed by a pause then `period` should produce `literally.` due to the command being interpreted separately.
- Pauses after `all caps` or before `end caps` should not break the capitalization state.

## Automated Test Setup
Automated tests use Vitest and React Testing Library. The SpeechRecognition API is mocked so tests run without browser support.

1. Mock the `SpeechRecognition` constructor and emit interim and final result events.
2. Fire `onresult` events with transcripts to simulate user speech.
3. Manipulate the textarea `selectionStart` and `selectionEnd` to emulate cursor movements.
4. Verify output text and logging messages for each scenario.

## Manual QA Checklist
- Toggle the microphone icon to verify listening and transcription states.
- Dictate punctuation commands and confirm expected symbols appear.
- Move the cursor mid-sentence and continue dictation to ensure insertion works.
- Test `all caps` and `end caps` with varying pauses.
- Say help phrases (e.g., type "help" then submit) to display the built‑in help dialog.

## Document History
- 2025-05-21: Initial creation
