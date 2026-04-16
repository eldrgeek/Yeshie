---
type: feedback
project: yeshie
created: 2026-04-15
tags: [esm, node, modules, package.json]
---

# ESM Module Type Required

The Yeshie project root has `"type": "module"` in package.json. All Node scripts must use ESM syntax (`import`/`export`). Never use `require()` or `module.exports` — they will fail with ERR_REQUIRE_ESM. This applies to all scripts under `skills/`, `sites/`, and project root.

**Why:** `dry-run.js` was written with `require()` and crashed immediately; had to convert to import statements.
