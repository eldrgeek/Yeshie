<!-- Codex task derived from tasks/task_N_orchestrator_langgraph_integration.md -->
# Task N: Orchestrator LangGraph Integration

## Summary
Complete `yeshie/server/orchestrator.py` by wiring in LangGraph to manage agent workflows.

## Acceptance Criteria
- [ ] Orchestrator exposes endpoints to submit tasks and query status via LangGraph.
- [ ] A small demo workflow runs in tests using mocked agents.
- [ ] Server unit tests pass without requiring an external server.

## Implementation Notes
- Replace placeholder agent functions with minimal LangGraph nodes.
- Use FastAPI's TestClient for unit tests.
- Keep the interface compatible with the existing `test_orchestrator.py` expectations.
