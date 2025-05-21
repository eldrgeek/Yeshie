# Task B: Unit Tests for Stepper Commands

## Summary
Create unit tests covering every command supported by the Stepper component. Tests should verify expected behavior in a controlled page and include error cases for invalid selectors or command arguments.

## Acceptance Criteria
- [ ] Tests exist for all Stepper commands (navto, click, type, waitforelement, etc.).
- [ ] Error handling is tested for missing selectors and invalid commands.
- [ ] Tests run via the existing test runner and pass in CI.

## Implementation Notes
- Use Playwright or the existing testing framework to drive a mock page.
- Provide fixtures for pages with known selectors to exercise each command.
- Document any limitations or assumptions in `LLMNotes/testing`.
