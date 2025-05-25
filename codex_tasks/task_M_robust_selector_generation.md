<!-- Codex task derived from tasks/task_M_robust_selector_generation.md -->
# Task M: Robust Selector Generation

## Summary
Implement a reliable `getRobustSelector` helper in `extension/functions/learn.ts` so recorded steps replay consistently.

## Acceptance Criteria
- [ ] Generated selectors uniquely identify elements across page reloads.
- [ ] Selector generation handles IDs, classes, and hierarchy with minimal length.
- [ ] Unit tests cover a variety of DOM structures.

## Implementation Notes
- Evaluate existing selector libraries or implement a heuristic approach.
- Ensure fallback logic when elements lack IDs or stable attributes.
- Document the algorithm in code comments for maintainability.
