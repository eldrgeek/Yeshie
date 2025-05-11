Cursor Project Plan: Integrating MCP Orchestrator and Server within Yeshie
Cursor AI Instructions:
This checklist guides implementation of an MCP-compatible orchestrator and MCP server directly into the Yeshie Chrome extension project. Follow provided MCP protocol standards. Limit human interaction to necessary reviews, offer concise explanations, status reports, and avoid unnecessary detail.

✅ Initial Environment and Dependency Setup
 Create a new directory (yeshie/server) in Yeshie's codebase for orchestrator and MCP server code.

 Initialize Python virtual environment (venv) in yeshie/server.

 Install essential dependencies:

bash
Copy
Edit
pip install fastapi uvicorn langgraph mcp
 Commit initial environment setup.

✅ Orchestrator (LangGraph + FastAPI) Setup
 Create yeshie/server/orchestrator.py:

Use LangGraph to coordinate tasks between agents.

Implement FastAPI endpoints to interact with orchestrator functions.

 Write a basic orchestrator test script (test_orchestrator.py) verifying task distribution and message exchange.

 Commit orchestrator and associated tests.

✅ MCP Server Implementation (Aligned with MCP Documentation)
 Create yeshie/server/mcp_server.py:

Implement standard MCP initialization sequence:

Handle initialize request.

Respond with server capabilities.

Handle notifications (initialized).

Provide MCP endpoints (tools, logs, actions) adhering to MCP standard:

Logs Endpoint: Receives diagnostic data (POST /logs).

Actions Endpoint: Sends commands to Yeshie instances (POST /actions).

📡 MCP Standard Protocol Schemas:
Diagnostic Log Schema (POST /logs)

json
Copy
Edit
{
  "tab_id": "number",
  "timestamp": "ISO8601 string",
  "log_level": "INFO|WARN|ERROR|DEBUG",
  "message": "string",
  "context": { "optional": "JSON object" }
}
Action Request Schema (POST /actions)

json
Copy
Edit
{
  "tab_id": "number",
  "actions": [
    {
      "cmd": "navigate|click|type",
      "target": "selector or URL",
      "value": "optional string"
    }
  ]
}
Action Response Schema

json
Copy
Edit
{
  "success": "boolean",
  "details": "optional string"
}
 Write comprehensive test cases (test_mcp_server.py) for MCP server.

 Run and validate MCP tests.

 Commit MCP server code and tests.

✅ Integration of MCP Logging into Existing Yeshie Logging
 Enhance Yeshie's existing logging (DiagnosticLogger.ts, logger.ts) to automatically post logs to MCP endpoint (/logs).

 Validate integration with end-to-end log posting tests.

 Implement minimal log analysis feature within MCP server to identify and flag issues.

 Commit logging integration enhancements.

✅ Task Dispatch and Agent Communication Protocols
 Define standard task schema (yeshie/server/schemas/task_schema.json):

json
Copy
Edit
{
  "task_id": "string",
  "task_type": "development|testing|logging",
  "task_payload": { "specific task details": "JSON object" }
}
 Implement orchestrator task dispatch logic using this schema.

 Validate with orchestrator-agent communication tests.

 Commit task dispatch setup.

✅ Git Branch and Merge Automation for Multi-Agent Development
 Automate Git feature branch creation (feature/<task-id>) for agent tasks (scripts/git_automation.py).

 Implement automated merging strategy after successful tests.

 Verify and test Git automation.

 Commit Git automation scripts.

✅ Parallel Testing and Environment Isolation Setup
 Leverage Chrome APIs and existing Yeshie capabilities for managing parallel isolated tab-based tests.

 Write scripts (scripts/parallel_testing.py) to facilitate isolated parallel tests.

 Validate parallel testing functionality.

 Commit parallel testing scripts and environment setup.

✅ Comprehensive Documentation and Final Review
 Clearly document MCP server and orchestrator endpoints, schemas, and protocols.

 Update main README.md with usage and setup instructions, including MCP schemas.

 Conduct end-to-end system review.

 Commit documentation updates and complete final project review.

📌 Next Step:
Begin executing tasks starting with the Initial Environment and Dependency Setup.
Use concise reporting at each step for clarity and efficient progress tracking. 