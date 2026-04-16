---
name: yeshie:rebuild
description: >
  Extension build and hot-reload mechanics for Yeshie. Load this skill when you
  need to rebuild the Chrome extension, understand WXT dev watch behavior, verify
  a build incremented, or recover from a downed watcher.
  Trigger on: "rebuild the extension", "hot-reload not working", "build the extension",
  "WXT", "watcher is down", "extension not updating".
---

# Yeshie — Extension Rebuild & Hot-Reload

## Architecture

The extension is built with **WXT** (Web Extension Toolkit). Two launchd services keep development live:

| Service | Port | launchd label | Log |
|---------|------|--------------|-----|
| WXT dev watcher + build server | 27182 | `com.yeshie.watcher` | `/tmp/wxt.log` |
| Relay | 3333 | `com.yeshie.relay` | `/tmp/relay.log` |

The built extension lives at:
```
packages/extension/.output/chrome-mv3/
```
This is what's loaded in Chrome via `chrome://extensions` (Developer mode, Load unpacked).

---

## Hot-Reload Mechanics

The extension background worker polls `localhost:27182` every **2 seconds**. When the build number in the response changes, it calls `chrome.runtime.reload()` automatically.

**Reload latency:** ~2 seconds after a source file save triggers WXT to finish the build.

**What hot-reload does NOT do:** It does not reinject content scripts into already-open tabs. After a reload, navigate to the target site tab (or do a soft reload of the tab) to reinject.

**Why:** Avoids killing active sessions — the background worker restarts but open tabs are intentionally left alone.

---

## Verifying a Build Incremented

Check the build number the watcher is serving:
```bash
curl -s http://localhost:27182/build-number
```

Or watch the relay log for the reload event:
```bash
tail -f /tmp/relay.log | grep -i "reload\|build"
```

Or watch the WXT log directly:
```bash
tail -f /tmp/wxt.log
```

---

## When Hot-Reload Does NOT Fire

Hot-reload fires on any TypeScript source change under `packages/extension/src/`. But you may need a **manual reload** if:

- The watcher was restarted (background.ts polls only after service worker boots)
- The build errored and WXT didn't emit a new build number
- You changed `wxt.config.ts` or `package.json` (structural changes require manual steps)

**Manual reload:** Go to `chrome://extensions`, find the Yeshie card, click the reload (↺) icon.

After manual reload, navigate to your target tab to reinject content scripts.

---

## Outer vs. Inner Loop

| Loop | Scope | Reload needed? |
|------|-------|---------------|
| **Outer** | Changes to `background.ts`, `target-resolver.ts`, `step-executor.ts`, relay | Yes — hot-reload (auto ~2s) |
| **Inner** | Changes to payload JSON only (`sites/*/tasks/*.payload.json`) | No — payloads are read at runtime |

If you're only editing payload JSON, no rebuild is needed. The relay reads the file fresh on each `/run` request.

---

## Watcher is Down

Symptoms: `curl -s http://localhost:27182/build-number` returns nothing or connection refused.

**Restart:**
```bash
launchctl kickstart -k gui/$(id -u)/com.yeshie.watcher
```

**Verify it came back:**
```bash
sleep 3 && curl -s http://localhost:27182/build-number
tail -5 /tmp/wxt.log
```

**If watcher still won't start:** Check for port conflict or build error:
```bash
lsof -i :27182
cat /tmp/wxt.log | tail -30
```

---

## Manual Build (no watcher)

If you need a one-shot build without the watcher running:
```bash
cd ~/Projects/yeshie/packages/extension
npx wxt build
```
Output goes to `.output/chrome-mv3/`. Then reload manually in `chrome://extensions`.

---

## Build Configuration

Extension endpoint defaults (relay URL, watcher URL) can be overridden at build time:
```bash
WXT_RELAY_URL=http://localhost:3333 WXT_WATCHER_URL=http://localhost:27182 npx wxt build
```

---

## Extension Not Connecting to Relay

If `curl -s http://localhost:3333/status` shows `"extensionConnected": false`:

1. Reload the extension in `chrome://extensions`
2. The keepalive alarm (24s interval) will prevent the service worker from sleeping after reload
3. If relay itself is down: `launchctl kickstart -k gui/$(id -u)/com.yeshie.relay`
