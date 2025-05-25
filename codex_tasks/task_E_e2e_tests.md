<!-- Codex task derived from tasks/task_E_e2e_tests.md -->
# Task E: Expanded E2E Tests

## Summary
Extend Playwright end-to-end tests as described in `LLMNotes/testing/test_plan.md`. Cover GitHub login recording, command execution, error handling, and archiving of test runs.

## Acceptance Criteria
- [ ] Tests automate GitHub login flow recording and replay.
- [ ] Command execution failures generate helpful output and screenshots.
- [ ] Archived runs can be viewed and verified in the Tab page.
- [ ] CI passes with the new tests on a local development server.

## Implementation Notes
- Reuse existing E2E setup in `tests/e2e`.
- Parameterize tests with environment variables for GitHub credentials.
- Consult the test plan for prioritization and edge cases.
