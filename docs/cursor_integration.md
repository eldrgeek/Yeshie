# Cursor IDE Integration

Cursor IDE is a standalone editor based on VS Code with built-in AI features. Use it to collaborate with Codex and manage pull requests efficiently.

## Installation

1. Download the latest Cursor IDE from the [official website](https://cursor.so/).
2. Install the application following the platform-specific instructions.

## Opening This Project

1. Launch Cursor.
2. Use **File > Open Folder...** to open this repository.
3. If prompted, sign in with your GitHub account so Cursor can access your repositories and pull requests.

## Working with Codex PRs

Codex typically creates a pull request when it finishes a task. To review and merge these changes in Cursor:

1. Open the **Pull Requests** view from the Source Control sidebar.
2. Locate the PR created by Codex and open it.
3. Review the diff or run the project locally.
4. Press **Checkout** to check out the PR branch or **Merge** if you're ready to merge.

While Cursor does not yet provide a single-click flow to automatically fetch and merge Codex PRs, using the Pull Requests view simplifies the process so you can review and merge without leaving the editor.

## Useful Features

- **Inline Chat** – highlight code and press `Cmd+Shift+L` (`Ctrl+Shift+L` on Windows/Linux) to open an inline conversation.
- **PR Review** – generate review comments directly from the Pull Requests panel.
- **Code Generation** – ask Cursor to generate or refactor code snippets within the editor.

For more information, see the official Cursor documentation.
