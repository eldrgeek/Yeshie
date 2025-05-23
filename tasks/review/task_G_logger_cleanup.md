# Task G: Logger Cleanup

## Summary
Replace all `console.log` and related debug statements across the extension with the structured logger utilities.

## Acceptance Criteria
- [ ] No remaining `console.log`, `console.warn`, or `console.error` statements in the `extension/` directory.
- [ ] Existing behavior is preserved and logs appear through `logInfo`, `logWarn`, or `logError`.
- [ ] All unit tests and lint checks continue to pass.

## Implementation Notes
- Search the entire `extension/` directory for console statements.
- For trivial debugging statements that add no value, simply remove them.
- For useful diagnostics, replace with the appropriate logger call.
