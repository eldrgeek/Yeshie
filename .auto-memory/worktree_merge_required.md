---
type: feedback
project: yeshie
created: 2026-04-15
tags: [git, worktree, start_code_task, merging]
---

# Worktree Merge Required After Code Tasks

`start_code_task` always creates a new git worktree. Changes built there are NEVER visible in master until explicitly merged. If a build looks stale (wrong version number, missing changes), the fix was probably built in a worktree that was never merged. Always verify the active branch after a code task completes and merge if needed.

**Why:** Smart advance changes were built at version 0.1.182 in a worktree but master stayed at 0.1.308 — the fix was invisible until the merge issue was caught.
