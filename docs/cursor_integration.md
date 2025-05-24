# Using Cursor IDE with Yeshie

This guide explains how to set up the Cursor IDE as a standalone application and connect it to the Yeshie project. It also covers built‑in features like inline chat and automated pull‑request review.

## Obtain the Cursor IDE

1. Visit [https://www.cursor.sh/](https://www.cursor.sh/) and download the installer for your platform.
2. Run the installer and follow the prompts to install the application.
3. Launch **Cursor** from your applications menu or start menu.

## Open this Project in Cursor

1. In the Cursor window, choose **Clone Repository** from the welcome screen or **File → Clone Repository**.
2. Enter the repository URL for Yeshie or select a local path if you have already cloned it.
3. Cursor will open the project in a familiar VS Code‑style interface.

## Built‑in AI Features

Cursor includes several AI tools that can assist with development:

- **Inline Chat** – highlight code and press `Cmd/Ctrl+K` to ask questions or request edits directly within the editor.
- **Commit Message Generation** – when committing changes, Cursor can suggest commit messages.
- **Pull Request Review** – open a PR and use the "Review with AI" button to generate review comments.
- **Codebase Search** – natural‑language search across files with the shortcut `Cmd/Ctrl+L`.

These features can speed up code understanding and review tasks.

## Notes on Extensions

Cursor ships as a complete editor, so you do **not** need to install a separate VS Code extension. If you previously used the Cursor extension inside VS Code, you can uninstall it and run the standalone IDE instead.

## Register the MCP Server

Yeshie exposes a Model Context Protocol (MCP) server on port `8123`. After starting the server (`python yeshie/server/mcp_server.py` or `pnpm run mcp-server` inside the `extension` folder), open **Cursor** and navigate to **Settings → MCP Servers**.
Add `http://localhost:8123` as a server URL so Cursor can issue actions and receive logs from Yeshie while you develop.



## Automated MCP Workflow

The MCP server located at `yeshie/server/mcp_server.py` provides a lightweight API for coordinating tests and browser actions.

1. Start the server with `python yeshie/server/mcp_server.py`.
2. The Chrome extension connects to `http://localhost:8123` and reports profile tabs.
3. Pull requests trigger the GitHub Actions workflow which runs the MCP server tests.
4. After merging, you can extend the server to pull updates and rebuild the extension automatically.

The server exposes the following endpoints:

- `GET /health` – simple health check.
- `POST /logs` – accepts diagnostic log entries.
- `POST /actions` – queues actions to be processed by the extension.
