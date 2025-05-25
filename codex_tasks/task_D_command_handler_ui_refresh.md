<!-- Codex task derived from tasks/task_D_command_handler_ui_refresh.md -->
# Task D: Background Command Handler and UI Refresh

## Summary
Implement the missing command execution handler in `background/messages/command.ts` and update the Tab page to refresh its task list after recordings are processed.

## Acceptance Criteria
- [ ] `command.ts` handles incoming commands and triggers appropriate Stepper actions.
- [ ] Tab page updates its task list UI immediately after new recordings are saved.
- [ ] No console errors occur during command handling or refresh.

## Implementation Notes
- Follow patterns from existing background message handlers.
- Use messaging to notify the Tab page when recordings are processed.
- Keep the UI update lightweight to avoid blocking user interactions.
