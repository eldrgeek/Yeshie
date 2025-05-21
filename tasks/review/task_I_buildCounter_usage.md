# Task I: Build Counter Review

## Summary
Clarify the purpose of `background/buildCounter.ts` and remove obsolete commented code. Ensure build information is consistently available to the extension UI and background scripts.

## Acceptance Criteria
- [ ] `getBuildInfo()` returns accurate version and build data in development and production.
- [ ] Unused commented sections in `buildCounter.ts` are removed.
- [ ] All callers (`tabs/index.tsx`, message handlers, reports) receive the same build info structure.

## Implementation Notes
- Decide whether build counters should reset on extension load or installation.
- Document the expected format of the returned object in code comments.
