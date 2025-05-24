from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
try:
    import socketio  # type: ignore
except Exception:  # pragma: no cover - fallback for test env
    class _DummySocketIO:
        def __init__(self, *a, **k):
            pass

        def event(self, fn):
            return fn

        def on(self, *a, **k):
            def wrapper(fn):
                return fn

            return wrapper

        async def emit(self, *a, **k):
            pass

    class socketio:  # type: ignore
        AsyncServer = _DummySocketIO
        ASGIApp = lambda *a, **k: a[1] if len(a) > 1 else a[0]

import uvicorn

app = FastAPI(
    title="Yeshie MCP Server",
    description="Minimal MCP server to interface with the Yeshie extension.",
    version="0.1.0",
)

# Socket.IO server for extension communication
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Connected clients indexed by tab_id
_ws_clients: Dict[int, WebSocket] = {}
_sio_clients: Dict[int, str] = {}
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
    _ws_clients[tab_id] = ws
    try:
        while True:
            data = await ws.receive_json()
            fut = _pending.pop(tab_id, None)
            if fut and not fut.done():
                fut.set_result(ActionResponse(**data).dict())
    except WebSocketDisconnect:
        _ws_clients.pop(tab_id, None)
        fut = _pending.pop(tab_id, None)
        if fut and not fut.done():
            fut.set_result({"success": False, "details": "client disconnected"})


@app.post("/actions", response_model=ActionResponse)
async def send_actions(req: ActionRequest):
    """Send an action script to a connected Yeshie tab and await the result."""
    ws = _ws_clients.get(req.tab_id)
    sid = _sio_clients.get(req.tab_id)
    if not ws and not sid:
        return JSONResponse(status_code=404, content={"success": False, "details": "Tab not connected"})
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _pending[req.tab_id] = fut
    if ws:
        await ws.send_json({"type": "actions", **req.dict()})
    else:
        await sio.emit("actions", req.dict(), to=sid)
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


# --- Socket.IO Events ---

@sio.event
async def connect(sid, environ):
    pass


@sio.event
async def disconnect(sid):
    for tab_id, s in list(_sio_clients.items()):
        if s == sid:
            _sio_clients.pop(tab_id)
            fut = _pending.pop(tab_id, None)
            if fut and not fut.done():
                fut.set_result({"success": False, "details": "client disconnected"})


@sio.on("register_tab")
async def register_tab(sid, data):
    tab_id = data.get("tab_id")
    if tab_id is not None:
        _sio_clients[tab_id] = sid
        await sio.emit("registered", {"tab_id": tab_id}, to=sid)


@sio.on("action_result")
async def action_result(sid, data):
    tab_id = data.get("tab_id")
    fut = _pending.pop(tab_id, None)
    if fut and not fut.done():
        fut.set_result({"success": data.get("success", False), "details": data.get("details")})


@sio.on("log_entry")
async def sio_log_entry(_sid, data):
    _logs.append(data)

if __name__ == "__main__":
    uvicorn.run(socket_app, host="0.0.0.0", port=8123)

