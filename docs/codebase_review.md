# Codebase Review - Extension and MCP Server

This document summarizes the current status of the browser extension and the `yeshie/server` modules. It lists known issues, incomplete implementations, open tasks and areas of dead code.

## Extension Overview

- **Tab tracking** (`extension/background/index.ts`, `tabHistory.ts`)
  - Current logic ignores any URL under `chrome.runtime.getURL("")`, so the control page and extension management page are not stored. This prevents them from appearing in the task list within the Tab panel.
  - `TabList.tsx` further filters `chrome://`, `about:` and `chrome-extension://` URLs with `isRestrictedUrl`. This excludes extension pages from the roster.
- **Build information**
  - `background/buildCounter.ts` still contains large commented sections and is partially implemented.
- **Logging**
  - Many files still use raw `console.log` statements despite `logging_refactor_checklist.md`. Examples include `extension/background/messages/message.ts` and several components.
- **Command handler**
  - `background/messages/command.ts` executes a single Stepper step but lacks broader command processing or error recovery.
- **Recorder utilities**
  - `functions/learn.ts` notes a placeholder "Robust Selector Generation" that needs a real implementation.
- **Dead or stale code**
  - Commented logic in `buildCounter.ts` and various debugging prints appear unused.
  - The orchestrator integration inside `extension/functions/extcomms.ts` mixes background and content script logic and may include unused handlers.

## MCP Server

- `yeshie/server/mcp_server.py` implements a minimal FastAPI service with WebSocket support.
- `orchestrator.py` is largely a skeleton with placeholder comments for future LangGraph integration.
- Unit tests for the MCP server pass (`test_mcp_server.py`). The orchestrator tests rely on an external server and currently test only placeholder endpoints.

## Open Tasks

The `tasks/` directory defines many pending items. Key topics include:

- Unit and E2E test expansion (`task_B_stepper_command_tests.md`, `task_C_tab_panel_tests.md`, `task_E_e2e_tests.md`).
- Speech input improvements and global coordination (`task_G_dialog_speech_input_integration.md`, `task_H_singleton_speech_input.md`, `task_I_transcribing_toggle.md`, `task_J_speech_input_unit_tests.md`).
- Bug fixes and refactoring per `canvas/extension_review.md` and `logging_refactor_checklist.md` (`task_F_bug_fixes_refactor.md`).
- Review and cleanup of logging, dead code and extcomms (`review/task_G_logger_cleanup.md`, `review/task_J_extcomms_review.md`, `review/task_K_dead_code_audit.md`).

## Workflow Suggestions

- Track progress using the `tasks/` markdown files and update them as items are completed.
- Run `pytest yeshie/server/test_mcp_server.py -q` before commits, as noted in `AGENTS.md`.
- Consider enabling TypeScript's `--noUnusedLocals` and `--noUnusedParameters` to catch dead code early.
- Periodically audit extension pages so that all open tabs, including the control page and Chrome's extension management page, are listed in the Tab panel.

