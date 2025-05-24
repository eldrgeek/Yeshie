import asyncio
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from yeshie.server import mcp_server

class DummyWebSocket:
    def __init__(self):
        self.sent = []
        self.recv_queue = asyncio.Queue()
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        self.sent.append(data)

    async def receive_json(self):
        return await self.recv_queue.get()

def test_end_to_end_action_flow():
    asyncio.run(run_flow())


async def run_flow():
    ws = DummyWebSocket()
    ws_task = asyncio.create_task(mcp_server.websocket_endpoint(ws, tab_id=1))

    # Initialize
    init_resp = await mcp_server.initialize(mcp_server.InitializeRequest(client="test", version="0.1"))
    assert init_resp.server == "Yeshie MCP"

    # Send actions
    action = mcp_server.Action(cmd="navto", target="https://example.com")
    req = mcp_server.ActionRequest(tab_id=1, actions=[action])
    send_task = asyncio.create_task(mcp_server.send_actions(req))

    # Wait until websocket receives message
    while not ws.sent:
        await asyncio.sleep(0.01)
    assert ws.sent[0]["type"] == "actions"
    assert ws.sent[0]["actions"][0]["cmd"] == "navto"

    # Send result back
    await ws.recv_queue.put({"success": True, "details": "ok"})
    resp = await send_task
    assert resp == {"success": True, "details": "ok"}

    # Send a log entry
    log_entry = mcp_server.LogEntry(
        tab_id=1,
        timestamp="2024-01-01T00:00:00Z",
        log_level="INFO",
        message="test log"
    )
    await mcp_server.receive_logs(log_entry)
    logs = (await mcp_server.get_logs())["logs"]
    assert any(l["message"] == "test log" for l in logs)

    ws_task.cancel()
    try:
        await ws_task
    except asyncio.CancelledError:
        pass
