# Agent Guidelines

This file provides instructions for Codex and other automated agents when working on the **Yeshie** project.

## Reference Material
- Review all files under `.cursor/rules/` before changing code. The main project conventions are in `project-guidelines.mdc` and related rule documents.
- Additional documentation lives in `docs/` and `extension/docs/`. Consult these as needed.
- A summary of open tasks and outstanding issues is maintained in `docs/codebase_review.md`.
- Open tasks are tracked in the `tasks/` directory.

## Development Practices
- Keep implementation code in `extension/`, `yeshie/server/`, or `src/` following existing naming patterns.
- Use the custom logging approach described in `.cursor/rules/structured_logging_convention.md`.
- Follow React rules in `.cursor/rules/` (import/export consistency, component isolation, etc.).
- Reload the Chrome extension after significant changes as noted in `extension_reload_best_practices.md`.
- Do not embed API keys or secrets in client-side code (`api_key_security.md`).

## Testing
- At minimum run the MCP server tests which CI expects:
  ```bash
  pytest yeshie/server/test_mcp_server.py -q
  ```
- Run any additional tests relevant to your edits and capture their output for the pull request description.

## Commits and Documentation
- Write concise commit messages explaining the change.
- Document new patterns or assumptions in appropriate markdown files when introducing them.
