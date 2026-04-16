---
name: yeshie:relay
description: >
  Relay server and Socket.IO mechanics for Yeshie. Load this skill when you need
  to debug the relay, understand Socket.IO events, work with the inject flow,
  test the relay in isolation, or understand the log endpoint.
  Trigger on: "relay", "socket.io", "port 3333", "relay log", "inject flow",
  "RELAY_TEST_MODE", "relay is down", "extension not responding".
---

# Yeshie — Relay & Socket Mechanics

## What the Relay Does

`packages/relay/index.js` is a Socket.IO + HTTP server on **port 3333**. It bridges:

```
Claude (HTTP POST /run)
    ↓
relay:3333  ←→  Chrome Extension (Socket.IO WebSocket)
    ↓
HTTP response with ChainResult
```

The relay holds HTTP connections open while the extension executes the chain. Responses come back over the WebSocket and are forwarded to the waiting HTTP client.

---

## Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/status` | Health check — `{"ok":true,"extensionConnected":true,"pending":N}` |
| `POST` | `/run` | Execute a payload; body: `{payload, params, tabId, timeoutMs}` |
| `GET` | `/log` | Last N log lines from relay (useful for debugging) |
| `POST` | `/chat/inject` | Inject a message into the side-panel chat |
| `GET` | `/chat/await` | Long-poll for a chat response `?tabId=X&timeout=60&since=TS` |

---

## Socket.IO Events

### Extension → Relay

| Event | Payload | Meaning |
|-------|---------|---------|
| `register` | `{extensionId}` | Extension identifies itself on connect |
| `chain_result` | `ChainResult` | Payload run completed (success or failure) |
| `chat_response` | `{tabId, chatId, text, ...}` | Haiku replied to a chat message |
| `heartbeat` | `{tabId, status, step, ts}` | Progress update during long-running chain |

### Relay → Extension

| Event | Payload | Meaning |
|-------|---------|---------|
| `run_chain` | `{payload, params, tabId, commandId}` | Run a payload on the given tab |
| `chat_inject` | `{tabId, chatId, message}` | Inject a message into the side panel |

---

## Inject Flow (end-to-end)

1. Claude calls `yeshie_run(payload_path, params, tab_id)` → cc-bridge MCP → `POST /run`
2. Relay reads the payload file, assigns a `commandId`, stores `pending[commandId] = {resolve, reject, timer}`
3. Relay emits `run_chain` to the extension socket
4. Extension background worker receives event, executes chain step-by-step
5. On completion, extension emits `chain_result` with `commandId`
6. Relay resolves the pending promise → sends HTTP response
7. cc-bridge returns ChainResult to Claude

**Timeout:** Default `timeoutMs` is 120000ms (2 min). Pass higher for long chains.

---

## RELAY_TEST_MODE

For testing the relay in isolation (without a real extension):

```bash
RELAY_TEST_MODE=true node packages/relay/index.js
```

In test mode, the relay auto-acknowledges `run_chain` events with a mock `chain_result` after a short delay. Useful for testing the HTTP/Socket.IO plumbing without a browser.

The test suite (`tests/unit/relay-chat.test.ts`) uses this mode — it mocks Socket.IO rather than spinning up a real server.

---

## Log Endpoint

The relay logs all significant events to `/tmp/relay.log` and exposes them via:

```bash
curl -s http://localhost:3333/log?lines=50
```

Useful events to look for:
- `[relay] extension registered` — extension connected
- `[relay] run_chain dispatched commandId=...` — payload sent to extension
- `[relay] chain_result received commandId=...` — result came back
- `[relay] timeout commandId=...` — extension didn't respond in time
- `[relay] notify dispatched` — osascript notification sent to Mac

---

## Testing Relay in Isolation

**Health check:**
```bash
curl -s http://localhost:3333/status
```

**Trigger a payload run via curl:**
```bash
curl -s -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -d '{
    "payload": '"$(cat ~/Projects/yeshie/sites/yeshid/tasks/03-user-modify.payload.json)"',
    "params": {"user_identifier": "Claude", "new_first_name": "Claude",
                "new_last_name": "AI", "base_url": "https://app.yeshid.com"},
    "tabId": null,
    "timeoutMs": 120000
  }'
```

**Test chat inject:**
```bash
# Inject a message
curl -s -X POST http://localhost:3333/chat/inject \
  -H "Content-Type: application/json" \
  -d '{"tabId": 12345, "message": "Hello from relay test (C)"}'

# Await response (blocks up to 60s)
curl -s "http://localhost:3333/chat/await?tabId=12345&timeout=60"
```

---

## Conversation Logging

The relay logs all chat conversations to:
```
logs/conversations/{YYYY-MM-DD}.jsonl
```

One JSONL file per day. Each line is a JSON object with a `ts` field. The `since` param on `/chat/await` uses these timestamps to avoid re-reading old responses.

---

## Multi-Extension Support

The relay tracks all connected extension sockets (`extensionSockets` Set). The last registered socket is the primary; others are fallbacks. If the primary disconnects, the next most recently registered takes over.

---

## Relay is Down

**Symptoms:** `curl -s http://localhost:3333/status` returns nothing.

**Restart:**
```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay
```

**Verify:**
```bash
sleep 2 && curl -s http://localhost:3333/status
```

**Check logs for why it crashed:**
```bash
tail -30 /tmp/relay.log
```

**If port in use:**
```bash
lsof -i :3333
# Kill the occupying process if needed
```

---

## Architecture Notes

- Relay is an **ESM module** (`"type": "module"` in package.json) — `import` not `require`
- Uses `createServer` + `socket.io` Server on the same HTTP server (not Express)
- osascript notifier sends Mac desktop notifications on key events (configurable)
- The `pending` Map is in-memory only — a relay restart clears all pending requests
