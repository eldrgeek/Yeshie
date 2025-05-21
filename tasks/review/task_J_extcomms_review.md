# Task J: Extcomms Review

## Summary
Audit `extension/functions/extcomms.ts` for unused functionality and clarify the communication flow between background and content scripts. The file currently mixes setup logic and message handling which can be confusing.

## Acceptance Criteria
- [ ] Documented overview of message types and expected payloads.
- [ ] Unused handlers or variables are removed.
- [ ] Setup functions for background and content scripts expose clear APIs.

## Implementation Notes
- Determine if socket.io connection logic belongs in this module or a separate service.
- Ensure unit tests cover key messaging paths after refactoring.
