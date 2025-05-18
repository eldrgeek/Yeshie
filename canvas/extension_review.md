# Yeshie Extension Review and Task Planning

## Overview
This document summarizes the current state of the Yeshie browser extension, outstanding bugs, planned features, and refactoring goals. It consolidates information from various markdown files located throughout the repository.

## Current Problems
1. **Control Tab Loading**
   - Ensure the Tab page ("Yeshie Control") loads if not already open.
2. **Focus Preservation**
   - Reloading or updating the extension should not steal focus from the user's active tab.
3. **Plasmo Context Invalidated**
   - When the extension reloads, non‑focused pages report a "context invalidated" message. Ideally the context should be refreshed without a full reload. If not possible, reload the tab only when it becomes focused and still lacks a valid context.
4. **Additional Issues to Investigate**
   - Repeated console messages in the Tab page (see BUG‑004).
   - Extension tabs not updating last visited tab when on `chrome://` pages (BUG‑003).
   - Tab fails to load without a `React.StrictMode` wrapper containing `""` (BUG‑005).
   - Unimplemented command execution logic in `background/messages/command.ts`.

## Existing Plans and Documentation
- `project-plan.md` – outlines Phase 1 tasks for LLM learning implementation.
- `refactor-plan.md` – checklist for code clean‑up and improved architecture.
- `vision_plan.md` – long term goal to integrate MCP orchestrator/server.
- `logging_refactor_checklist.md` – tracks migration from `console.*` to structured logger.
- `feature-analysis.md` – inventory of extension features and dependencies.
- `bugs/` directory – detailed bug reports (BUG‑003 to BUG‑005 currently open).
- `LLMNotes/testing/test_plan.md` – describes upcoming automated test coverage.

## Potential Additional Problems
- Background scripts reload all application tabs when the extension updates, which may cause unnecessary page refreshes.
- Inconsistent state management and missing error handling in some components.
- Lack of automated tests for many critical flows.

## Task List
1. **Investigate Control Tab Loading**
   - Verify `openOrFocusExtensionTab` logic in `background/index.ts`.
   - Ensure the tab is created only when absent and recorded for later retrieval.
2. **Preserve Focus on Reload**
   - Review `onInstalled` update logic to store the currently focused tab.
   - After the update, restore focus if the user was not already on the control tab.
3. **Plasmo Context Handling**
   - Determine why non‑active tabs lose context on reload.
   - Attempt to reinitialize context programmatically without page refresh.
   - If impossible, defer reload until the tab is focused.
4. **Resolve Open Bugs**
   - BUG‑003 – Update tab history logic to include chrome extension pages.
   - BUG‑004 – Reduce verbose polling logs in Tab page.
   - BUG‑005 – Investigate StrictMode/empty string requirement.
5. **Complete TODOs and Missing Features**
   - Implement command execution in `background/messages/command.ts`.
   - Refresh task list UI after processing recordings.
6. **Refactoring and Testing**
   - Follow `refactor-plan.md` items still unchecked.
   - Continue migrating console statements per `logging_refactor_checklist.md`.
   - Expand automated tests as described in `LLMNotes/testing/test_plan.md`.
7. **Integration with Cursor IDE**
   - Explore using Cursor’s AI features for code review and inline chat.
   - Provide documentation for installing Cursor extension and connecting to this repo.
8. **Parallel Work**
   - Many subtasks (bug fixes, refactoring, test writing) can be tackled independently. Multiple agents could work in parallel on distinct modules, then merge results via standard PR workflow.

---
