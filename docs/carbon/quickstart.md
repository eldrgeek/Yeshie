---
audience: carbon
document: quickstart
sync_version: 1
last_updated: 2026-04-04
repo: yeshie
---

# Getting Started

This guide walks you through getting Yeshie running from scratch. There are three things to set up: the Node dependencies, the Chrome extension, and the two background services.

---

## What You'll Need

- A Mac (the services use launchd, which is macOS-specific)
- Node.js and npm
- Google Chrome
- Claude Desktop or Claude Code with the cc-bridge MCP configured
- The cc-bridge MCP server at `~/Projects/cc-bridge-mcp/server.js`

---

## Step 1: Install Dependencies

```bash
cd ~/Projects/yeshie
npm install
```

---

## Step 2: Build and Load the Extension

The Chrome extension needs to be built before Chrome can load it.

```bash
cd packages/extension
npm install
npm run build
# Produces: packages/extension/.output/chrome-mv3/
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Toggle on "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `packages/extension/.output/chrome-mv3/` folder

You should see a "Yeshie" card appear in the extensions list.

---

## Step 3: Start the Background Services

Yeshie runs two services in the background:

- **The relay** (port 3333) — the messenger between Claude and the extension
- **The watcher** (port 27182) — watches for source changes and triggers hot-reloads

These run as launchd agents, meaning they restart automatically when your Mac restarts. Start them now:

```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay
launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher
```

To see what they're doing:
```bash
tail -f /tmp/relay.log    # relay activity
tail -f /tmp/wxt.log      # build/watcher activity
```

---

## Step 4: Verify Everything Is Connected

```bash
curl -s http://localhost:3333/status
```

You want to see:
```json
{"ok":true,"extensionConnected":true,"pending":0}
```

If `extensionConnected` is `false`, the extension isn't talking to the relay. The most common fix: go to `chrome://extensions` and click the reload icon on the Yeshie card. The extension reconnects within a few seconds.

---

## Step 5: Run Your First Task

Once the health check shows everything connected, try running the "modify user" task. This assumes you have a YeshID account with a user named "Claude" in it.

**Using the MCP tool** (recommended — works from Claude):
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

**Using curl** (useful for testing without Claude):
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

You should see Chrome navigate through the YeshID app and complete the task. The relay returns a `ChainResult` JSON when it's done.

---

## Step 6: Run the Tests

To confirm nothing is broken:
```bash
npm test
```

All 176 tests should pass. If any fail, check that dependencies are installed (`npm install`) and that you're on the right branch.

---

## Common Problems

**The extension keeps disconnecting.** This is usually caused by the Chrome MV3 service worker going to sleep. The extension has a 24-second keepalive alarm that should prevent this, but sometimes it takes a moment after Chrome starts. Reloading the extension fixes it immediately.

**Tasks time out.** The most common cause is that Chrome doesn't have an active tab on the target domain. The extension needs to be injected into a real tab. Navigate Chrome to `app.yeshid.com` (or whatever your target is) before running a task.

**Typing doesn't work / Vue fields don't update.** This means the `chrome.debugger` permission isn't active. Check that the extension manifest lists `debugger` in its permissions, and that Chrome hasn't blocked the debugger session (some enterprise Chrome policies restrict this).

**Services aren't starting.** Check whether the launchd plist files are installed. If this is a fresh setup and the services have never been registered, you may need to install the plists first — check the setup documentation for your specific environment.
