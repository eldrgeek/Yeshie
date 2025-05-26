from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio

app = FastAPI(
    title="Yeshie MCP Server",
    description="Minimal MCP server to interface with the Yeshie extension.",
    version="0.1.0",
)

# Connected clients indexed by tab_id
_clients: Dict[int, WebSocket] = {}
# Futures waiting for action results
_pending: Dict[int, asyncio.Future] = {}
# In-memory log store
_logs: List[Dict[str, Any]] = []


class InitializeRequest(BaseModel):
    client: str
    version: str


class InitializeResponse(BaseModel):
    server: str
    capabilities: List[str]


class LogEntry(BaseModel):
    tab_id: int
    timestamp: str
    log_level: str
    message: str
    context: Optional[Dict[str, Any]] = None


class Action(BaseModel):
    cmd: str
    target: str
    value: Optional[str] = None

class ActionRequest(BaseModel):
    tab_id: int
    actions: List[Action]


class ActionResponse(BaseModel):
    success: bool
    details: Optional[str] = None


@app.post("/initialize", response_model=InitializeResponse)
async def initialize(req: InitializeRequest):
    """Handle MCP initialize request."""
    return InitializeResponse(server="Yeshie MCP", capabilities=["actions", "logs"])


@app.websocket("/ws/{tab_id}")
async def websocket_endpoint(ws: WebSocket, tab_id: int):
    """WebSocket endpoint used by Yeshie instances."""
    await ws.accept()
    _clients[tab_id] = ws
    try:
        while True:
            data = await ws.receive_json()
            fut = _pending.pop(tab_id, None)
            if fut and not fut.done():
                fut.set_result(ActionResponse(**data).dict())
    except WebSocketDisconnect:
        _clients.pop(tab_id, None)
        fut = _pending.pop(tab_id, None)
        if fut and not fut.done():
            fut.set_result({"success": False, "details": "client disconnected"})


@app.post("/actions", response_model=ActionResponse)
async def send_actions(req: ActionRequest):
    """Send an action script to a connected Yeshie tab and await the result."""
    ws = _clients.get(req.tab_id)
    if not ws:
        return JSONResponse(status_code=404, content={"success": False, "details": "Tab not connected"})
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _pending[req.tab_id] = fut
    await ws.send_json({"type": "actions", **req.dict()})
    try:
        result = await asyncio.wait_for(fut, timeout=10)
        return result
    except asyncio.TimeoutError:
        _pending.pop(req.tab_id, None)
        return ActionResponse(success=False, details="timeout waiting for client").dict()


@app.post("/logs")
async def receive_logs(entry: LogEntry):
    """Receive diagnostic log entries."""
    _logs.append(entry.dict())
    return {"success": True}


@app.get("/logs")
async def get_logs():
    """Retrieve all collected logs (debug use only)."""
    return {"logs": _logs}


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"status": "ok"}

