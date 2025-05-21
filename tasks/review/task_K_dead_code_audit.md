# Task K: Dead Code Audit

## Summary
Perform a sweep of the `extension/` directory to identify modules, components, or functions that are no longer referenced. Remove them or write tests to prove they are still needed.

## Acceptance Criteria
- [ ] A list of unused files or functions is compiled and documented.
- [ ] Dead code is removed with no loss of functionality.
- [ ] All tests continue to pass after cleanup.

## Implementation Notes
- Use tools like TypeScript's `--noUnusedLocals` and `--noUnusedParameters` where possible.
- Consider adding a linter rule to prevent future dead code accumulation.
