You are working on the Yeshie project at ~/Projects/yeshie. Implement Bead 8: Progress Overlay.

Read ~/Projects/yeshie/BEADS-SIDEPANEL.md for the FULL bead specification — find "## Bead 8" and follow it exactly.

Quick summary:
1. Read existing content.ts and wxt.config.ts for conventions
2. Create packages/extension/src/entrypoints/content-overlay.ts (WXT content script, matches app.yeshid.com)
3. Create packages/extension/src/overlay/progress-panel.ts (shadow DOM panel)
4. Create packages/extension/src/overlay/teach-tooltip.ts (placeholder stub)
5. Create packages/extension/src/overlay/styles.ts (CSS-in-JS)
6. Create tests/unit/progress-panel.test.ts (8 tests)
7. Run tests — all must pass
8. Verify build: cd packages/extension && npx wxt build
9. Verify existing tests: npm test (85+)
10. git add and commit: "Bead 8 PASS: progress overlay — shadow DOM + cancel/suggest + {N} tests"

MUST use shadow DOM for style isolation. Project uses "type": "module" and vitest.
