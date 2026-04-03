You are working on the Yeshie project at ~/Projects/yeshie. Implement Bead 8b: Wire Progress Overlay to Chain Execution.

Read ~/Projects/yeshie/BEADS-SIDEPANEL.md for the FULL spec — find "## Bead 8b".

Summary:
1. Read packages/extension/src/entrypoints/background.ts — find the startRun/chain executor
2. Add overlay_show message before chain starts (send step list to content script)
3. Add overlay_step_update before/after each step (running → ok/error)
4. Add overlay_hide after chain completes (3s delay)
5. Add abort flag check before each step (for cancel support)
6. Add cancel_run and user_suggestion message handlers
7. Create tests/unit/chain-overlay.test.ts (4 tests)
8. Verify all tests pass: npm test
9. Commit: "Bead 8b PASS: chain executor → overlay wiring + abort + {N} tests"

Bead 8 is done — the overlay content script already listens for overlay_show/overlay_step_update/overlay_hide messages.
