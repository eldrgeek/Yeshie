# Using Git Stash for Focused Debugging

## Rule
When facing complex bugs or needing to test a clean state without losing current work, utilize `git stash`.

- `git stash push -m "Descriptive message"` can be used to temporarily shelve uncommitted changes.
- This allows for focused debugging or testing on a clean branch or commit.
- Changes can be reapplied later using `git stash pop` or `git stash apply`.

## Rationale
`git stash` is a powerful tool for managing work-in-progress. It helps maintain a clean working directory for debugging or switching contexts without needing to make premature commits, thus streamlining the development workflow. 