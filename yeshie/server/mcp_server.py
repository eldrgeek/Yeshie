from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="Yeshie MCP Server",
    description="Receives logs and action requests from Yeshie agents.",
    version="0.1.0",
)

class LogEntry(BaseModel):
    tab_id: int
    timestamp: str
    log_level: str
    message: str
    context: Optional[dict] = None

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

logs: List[LogEntry] = []
actions_received: List[ActionRequest] = []

@app.get("/health")
async def health():
    """Simple health check."""
    return {"status": "MCP server healthy"}

@app.post("/logs")
async def receive_logs(entry: LogEntry):
    """Store a log entry sent from an agent."""
    logs.append(entry)
    return {"status": "received"}

@app.post("/actions")
async def perform_actions(request: ActionRequest):
    """Accept an action request and queue it for processing."""
    actions_received.append(request)
    return ActionResponse(success=True, details="Actions queued")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8123)

