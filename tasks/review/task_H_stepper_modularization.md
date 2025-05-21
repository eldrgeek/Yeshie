# Task H: Stepper Modularization

## Summary
Refactor `extension/functions/Stepper.ts` to break the large switch statement into modular command handlers. This will simplify future maintenance and enable easier unit testing of individual commands.

## Acceptance Criteria
- [ ] Each command type has its own handler function with a clear interface.
- [ ] `Stepper` composes handlers via a command map rather than a long switch block.
- [ ] Unit tests cover at least the most common commands (navto, click, type, wait, showtoast).
- [ ] No regressions in existing functionality.

## Implementation Notes
- Create a `commands/` subdirectory under `extension/functions` for handler modules.
- Consider dependency injection to allow mocking DOM interactions in tests.
- Maintain backward compatibility with existing command payloads.
