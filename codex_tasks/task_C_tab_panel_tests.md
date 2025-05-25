<!-- Codex task derived from tasks/task_C_tab_panel_tests.md -->
# Task C: Tab Panel Script Execution Tests

## Summary
Expand test coverage for the Tab page's script runner. Verify the Auto-run toggle, loading of `instructions.json`, step execution via Stepper, result writing, and archive/download behavior.

## Acceptance Criteria
- [ ] Toggling Auto-run loads instructions and begins execution automatically.
- [ ] Steps are executed sequentially and recorded in `results.json`.
- [ ] Success and failure toasts appear at the correct times.
- [ ] Archived runs appear in the UI and can be downloaded.

## Implementation Notes
- Use Playwright to simulate toggling and monitor resulting behavior.
- Mock file operations as needed to capture outputs.
- Ensure tests run quickly by using a simple sample script.
