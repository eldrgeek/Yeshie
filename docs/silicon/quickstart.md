---
audience: silicon
document: quickstart
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Quickstart

## Prerequisites

- macOS (launchd services)
- Node.js + npm (root `package.json` is `yeshie-executor`)
- Chrome browser
- Claude Desktop or Claude Code with MCP support
- cc-bridge MCP server installed: `~/Projects/cc-bridge-mcp/server.js`

## 1. Install dependencies

```bash
cd ~/Projects/yeshie
npm install
```

## 2. Build the extension

```bash
# One-time build
cd packages/extension && npm install && npm run build
# Outputs to: packages/extension/.output/chrome-mv3/
```

## 3. Load extension in Chrome

1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/.output/chrome-mv3/`

## 4. Start services (launchd — persist across reboots)

Services are registered as launchd agents. If not already running:

```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay
launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher
```

Logs:
- Relay: `tail -f /tmp/relay.log`
- Watcher: `tail -f /tmp/wxt.log`

## 5. Verify health

```bash
curl -s http://localhost:3333/status
# Expected: {"ok":true,"extensionConnected":true,"pending":0}
```

If `extensionConnected: false`: reload the extension in `chrome://extensions` (click the reload icon on the Yeshie card).

## 6. Run a payload

### Via yeshie_run MCP tool (preferred)

```
yeshie_run(
  payload_path="~/Projects/yeshie/sites/yeshid/tasks/03-user-modify.payload.json",
  params={
    "user_identifier": "Claude",
    "new_first_name": "Claude",
    "new_last_name": "AI",
    "base_url": "https://app.yeshid.com"
  }
)
```

### Via curl

```bash
curl -s -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\": $(cat ~/Projects/yeshie/sites/yeshid/tasks/03-user-modify.payload.json),
    \"params\": {\"user_identifier\": \"Claude\", \"new_first_name\": \"Claude\", \"new_last_name\": \"AI\", \"base_url\": \"https://app.yeshid.com\"},
    \"tabId\": null,
    \"timeoutMs\": 120000
  }"
```

## 7. Run tests

```bash
npm test
# Expected: 176 tests pass across 15 suites
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `extensionConnected: false` | Reload extension in `chrome://extensions` |
| relay unreachable | `launchctl kickstart -k gui/$(id -u)/com.yeshie.relay` |
| watcher unreachable | `launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher` |
| Payload times out | Check active Chrome tab is on correct domain; extension must be active |
| Vue 3 type fields fail | Ensure `chrome.debugger` permission is active; check extension manifest |

## Environment Variables (build-time overrides)

| Variable | Default | Purpose |
|----------|---------|---------|
| `WXT_RELAY_URL` | `http://localhost:3333` | Override relay endpoint at build time |
| `WXT_WATCHER_URL` | `http://localhost:27182` | Override watcher endpoint at build time |
