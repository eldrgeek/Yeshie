You are working on the Yeshie project at ~/Projects/yeshie. Implement Bead 5: Docs Knowledge Base Extraction.

Read ~/Projects/yeshie/BEADS-SIDEPANEL.md for the FULL bead specification — find "## Bead 5" and follow it exactly.

Quick summary:
1. npm install -D cheerio
2. Create scripts/extract-docs.mjs — crawls docs.yeshid.com, extracts all articles to JSON
3. Run it to generate scripts/docs-kb.json
4. Create tests/unit/extract-docs.test.ts (4 tests: schema, known articles, quality, no dupes)
5. Run tests — all must pass
6. Verify existing tests pass: npm test (expect 85+)
7. git add and commit: "Bead 5 PASS: docs KB extraction — {N} articles, {K}KB"

The project uses "type": "module" (ES modules). Test runner is vitest.
