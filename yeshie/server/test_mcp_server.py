import asyncio

from mcp_server import health, receive_logs, perform_actions, LogEntry, Action, ActionRequest


def test_health():
    result = asyncio.run(health())
    assert result == {"status": "MCP server healthy"}


def test_receive_logs():
    entry = LogEntry(tab_id=1, timestamp="2024-01-01T00:00:00Z", log_level="INFO", message="test")
    resp = asyncio.run(receive_logs(entry))
    assert resp == {"status": "received"}


def test_perform_actions():
    req = ActionRequest(tab_id=1, actions=[Action(cmd="navigate", target="https://example.com")])
    resp = asyncio.run(perform_actions(req))
    assert resp.success is True
