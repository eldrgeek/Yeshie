You are working on the Yeshie project at ~/Projects/yeshie. Implement Bead 6b: MCP Chat Tools.

Read ~/Projects/yeshie/BEADS-SIDEPANEL.md for the FULL spec — find "## Bead 6b".

Summary:
1. Read ~/Projects/cc-bridge-mcp/server.js to understand existing tools
2. Add 3 new tools: yeshie_listen, yeshie_respond, yeshie_chat_status
3. These call the relay endpoints from Bead 6a (GET /chat/listen, POST /chat/respond, GET /chat/status)
4. Create tests in ~/Projects/cc-bridge-mcp/tests/chat-tools-test.mjs (3 integration tests)
5. Verify MCP server starts without errors
6. Commit: "Bead 6b PASS: MCP chat tools — yeshie_listen + yeshie_respond"

The relay already has the /chat/* endpoints (Bead 6a is done). Handle errors gracefully — return error objects, don't throw.
