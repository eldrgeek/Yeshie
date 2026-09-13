# HUD Investigation — Raw Data Collection
Generated: 2026-04-30

---

## 1. File Locations

| File | Absolute Path | Line Count | Confirmed Exists |
|------|---------------|------------|-----------------|
| Relay (index.js) | `/Users/mikewolf/Projects/yeshie/packages/relay/index.js` | 1594 | yes |
| hud.py | `/Users/mikewolf/Projects/yeshie/scripts/hud.py` | 276 | yes |
| jobs-state.json | `/Users/mikewolf/Projects/yeshie/packages/relay/jobs-state.json` | 61 (content: `{}`) | yes |
| relay plist | `/Users/mikewolf/Library/LaunchAgents/com.yeshie.relay.plist` | — | yes |
| hud plist | `/Users/mikewolf/Library/LaunchAgents/com.yeshie.hud.plist` | — | yes |
| listener plist | `/Users/mikewolf/Library/LaunchAgents/com.yeshie.listener.plist` | — | yes |
| watcher plist | `/Users/mikewolf/Library/LaunchAgents/com.yeshie.watcher.plist` | — | yes |

### Plist contents

**com.yeshie.relay.plist**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.yeshie.relay</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/mikewolf/.nvm/versions/node/v24.14.0/bin/node</string>
        <string>/Users/mikewolf/Projects/yeshie/packages/relay/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/mikewolf/Projects/yeshie/packages/relay</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/relay.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/relay.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>/Users/mikewolf</string>
        <key>PATH</key>
        <string>/Users/mikewolf/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

**com.yeshie.hud.plist**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.yeshie.hud</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/python3.14</string>
        <string>/Users/mikewolf/Projects/yeshie/scripts/hud.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/hud.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/hud.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>/Users/mikewolf</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

Note: hud plist launches `/opt/homebrew/bin/python3.14` but actual running process (PID 39216) is `/opt/homebrew/Cellar/python@3.14/3.14.3_1/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python`.

**com.yeshie.listener.plist**
```xml
<Label>com.yeshie.listener</Label>
<ProgramArguments>/bin/bash /Users/mikewolf/Projects/yeshie/scripts/yeshie-listener-watch.sh</ProgramArguments>
<WorkingDirectory>/Users/mikewolf/Projects/yeshie</WorkingDirectory>
<RunAtLoad/> <KeepAlive/>
StandardOutPath/StandardErrorPath: /tmp/yeshie-listener.log
```

**com.yeshie.watcher.plist**
```xml
<Label>com.yeshie.watcher</Label>
<ProgramArguments>/Users/mikewolf/.nvm/versions/node/v24.14.0/bin/node /Users/mikewolf/Projects/yeshie/packages/watch-and-build.mjs /Users/mikewolf/Projects/yeshie/packages/extension</ProgramArguments>
<WorkingDirectory>/Users/mikewolf/Projects/yeshie/packages/extension</WorkingDirectory>
StandardOutPath/StandardErrorPath: /tmp/wxt.log
```

---

## 2. Process State Snapshot

### `lsof -i :3333 -i :3334`
```
COMMAND     PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
Python    39216 mikewolf    6u  IPv4 0xa19b8aac105d5971      0t0  TCP localhost:directv-web (LISTEN)
node      68684 mikewolf   12u  IPv6 0x4f8b1995a3d07ddb      0t0  TCP *:dec-notes (LISTEN)
node      68684 mikewolf   13u  IPv6 0xe246d9ba33912f44      0t0  TCP localhost:dec-notes->localhost:55059 (ESTABLISHED)
node      68684 mikewolf   14u  IPv6 0xbcefcbd5161cd791      0t0  TCP localhost:dec-notes->localhost:61678 (ESTABLISHED)
Google    68685 mikewolf   25u  IPv6 0xa5c54e7f94ef8b6e      0t0  TCP localhost:55059->localhost:dec-notes (ESTABLISHED)
node      91664 mikewolf   14u  IPv6 0x6be4e60e91d63f10      0t0  TCP localhost:61678->localhost:dec-notes (ESTABLISHED)
```

Notes:
- `:3333` = `dec-notes` in lsof naming. Listening: node PID 68684 (`relay/index.js`).
- `:3334` = `directv-web` in lsof naming. Listening: Python PID 39216 (`hud.py`).
- node 68684 has 2 ESTABLISHED connections on :3333 — one to Google (Chrome extension, PID 68685), one to node 91664 (cc-bridge-mcp).

### `curl -s 'http://localhost:3333/jobs/status?filter=all'`
```json
{"jobs":[],"ts":1777576511428}
```

### `curl -s http://localhost:3334/wv-status`
```json
{"loaded": true, "url": "http://localhost:3333/hud", "isLoading": false}
```

Note: `/wv-status` reports loaded=true, correct URL, not loading. This is derived from `webview.URL()` and `webview.isLoading()` in hud.py — it does NOT run JavaScript to verify DOM state, Socket.IO connection, or jobs.size.

### `curl -s http://localhost:3333/hud | wc -c`
```
13442
```

### `ps aux | grep -E 'node|hud\.py|relay' | grep -v grep` (filtered to relevant processes)
```
mikewolf  39216   0.1  0.2  Python  /Users/mikewolf/Projects/yeshie/scripts/hud.py          (started Tue08PM)
mikewolf  68684   0.0  0.1  node    /Users/mikewolf/Projects/yeshie/packages/relay/index.js  (started 10:26AM)
mikewolf    812   0.6  0.1  node    /Users/mikewolf/Projects/yeshie/packages/watch-and-build.mjs  (started 22Apr26)
mikewolf  91664   0.0  0.4  node    /Users/mikewolf/Projects/cc-bridge-mcp/server.js         (started 1:13PM)
```

Full raw output:
```
mikewolf         45222   4.0  0.1 436148864  23360   ??  S     8:06AM   0:02.03 /Users/mikewolf/.nvm/versions/node/v24.14.0/bin/node /Users/MikeWolf/Projects/cc-bridge-mcp/server.js
mikewolf           812   0.6  0.1 436141696  11376   ??  S    22Apr26   3:29.37 /Users/mikewolf/.nvm/versions/node/v24.14.0/bin/node /Users/mikewolf/Projects/yeshie/packages/watch-and-build.mjs /Users/mikewolf/Projects/yeshie/packages/extension
mikewolf         54669   0.3  0.1 444614480  24576   ??  Ss   22Apr26  10:33.58 node /Users/mikewolf/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js --port 3000 --session /Users/mikewolf/.hermes/whatsapp/session --mode bot
mikewolf         39216   0.1  0.2 440184144  32032   ??  S    Tue08PM   9:38.73 /opt/homebrew/Cellar/python@3.14/3.14.3_1/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python /Users/mikewolf/Projects/yeshie/scripts/hud.py
mikewolf         68684   0.0  0.1 444569248  23744   ??  S    10:26AM   0:05.62 /Users/mikewolf/.nvm/versions/node/v24.14.0/bin/node /Users/mikewolf/Projects/yeshie/packages/relay/index.js
mikewolf         91664   0.0  0.4 444577280  65616   ??  S     1:13PM   0:00.40 node /Users/mikewolf/Projects/cc-bridge-mcp/server.js
```

---

## 3. Relevant Code Sections

### From `/Users/mikewolf/Projects/yeshie/packages/relay/index.js`

#### `render()` function — lines 842–892
```javascript
842  function render() {
843    const now = Date.now();
844    const active = [...jobs.values()].filter(j => {
845      if (['running','blocked','pending','notify_pending','needs_action'].includes(j.status)) return true;
846      return (now - j.updatedAt) < (j.status === 'needs_action' ? 600000 : 60000);
847    });
848    if (!active.length) { jobsEl.innerHTML = '<div class="empty">No active jobs</div>'; return; }
849    jobsEl.innerHTML = active.map(j => {
850      const el   = elapsed(now - j.createdAt);
851      const cls  = j.status.replace(/_/g,'-'); // CSS class
852  
853      let notifyHtml = '';
854      if (j.status === 'notify_pending' && j.countdown_start != null && j.countdown_seconds != null) {
855        const remaining = Math.max(0, j.countdown_seconds - Math.floor((now - j.countdown_start) / 1000));
856        notifyHtml = `<div class="notify-row">
857          <button class="btn btn-notify" onclick="notifyNow('${esc(j.id)}')">Notify Now</button>
858          <button class="btn btn-stop"   onclick="stopCountdown('${esc(j.id)}')">Stop</button>
859          <span class="countdown">⏱ Auto in ${remaining}s</span>
860        </div>`;
861      }
862  
863      let actionHtml = '';
864      if (j.status === 'needs_action' && j.notify_message) {
865        const msg = esc(j.notify_message);
866        actionHtml = `<div class="notify-row">
867          <button class="btn btn-copy" onclick="copyMsg('${msg}')">📋 Copy Message</button>
868          <span style="color:#f97316;font-size:10px">⚠ Paste into Claude chat</span>
869        </div>
870        <div style="margin-top:4px;font-size:10px;color:#aaa;word-break:break-word">${msg}</div>`;
871      }
872  
873      const statusLabel = j.status === 'notify_pending' ? 'NOTIFY PENDING'
874                        : j.status === 'needs_action'   ? 'NEEDS ACTION'
875                        : j.status === 'completed'      ? 'COMPLETED'
876                        : j.status === 'failed'         ? 'FAILED'
877                        : j.status.toUpperCase();
878  
879      return `<div class="job ${j.status}">
880        <div>
881          <div class="job-title">${esc(j.title || j.id)}</div>
882          <div class="job-meta">${esc(j.id)}</div>
883          ${j.step ? '<div class="job-step">' + esc(j.step) + '</div>' : ''}
884          ${notifyHtml}${actionHtml}
885        </div>
886        <div>
887          <div class="job-status ${j.status}">${statusLabel}</div>
888          <div class="job-elapsed">${el}</div>
889        </div>
890      </div>`;
891    }).join('');
892  }
```

Note: `render()` reads from `jobs` (a `Map` declared at line 748 inside the HTML `<script>` block — this is the client-side in-browser Map, not the server-side `jobs` variable at line 181).

#### `pollJobs()` function — lines 927–941
```javascript
927  function pollJobs() {
928    fetch('/jobs/status?filter=all').then(r=>r.json()).then(d => {
929      d.jobs.forEach(j => jobs.set(j.id, j));
930      render();
931      const p = document.getElementById('last-poll');
932      if (p) { const t = new Date(); p.textContent = t.getHours()+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0'); }
933    }).catch(e => {
934      const p = document.getElementById('last-poll');
935      if (p) p.textContent = 'poll ERR';
936    });
937  }
938  // Fire immediately on load, then every 5s
939  pollJobs();
940  setInterval(pollJobs, 5000);
941  setInterval(render, 1000);
```

#### `/hud` GET route handler — lines 687–976
The route starts at line 687:
```javascript
687    if (path === '/hud' && req.method === 'GET') {
688      const html = `<!DOCTYPE html>
...
972      `;
973          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
974          res.end(html);
975          return;
976        }
```
The entire HTML/JS payload is inlined as a template literal from line 688 to 972.

#### Socket.IO job broadcast code — all `io.emit` calls involving jobs

**`broadcastHud()` — lines 108–114** (emits `hud_update`, sourced from `jobMap`):
```javascript
108  function broadcastHud() {
109    const jobs = [...jobMap.values()].map(j => ({
110      job_id: j.job_id, session_title: j.session_title, description: j.description,
111      status: j.status, message: j.message, started_at: j.started_at, updated_at: j.updated_at,
112    }));
113    io.emit('hud_update', { jobs });
114  }
```

**`io.emit('job_update', ...)` call sites** (sourced from `jobs` Map, not `jobMap`):
- Line 232: `io.emit('job_update', upd);` — after `fireInject` completes
- Line 245: `io.emit('job_update', pending);` — inside `scheduleNotify`
- Line 1317: `io.emit('job_update', updatedJob);` — at `/jobs/update` route
- Line 1372: `io.emit('job_update', jobs.get(id));` — at `/jobs/create` route
- Line 1561: `io.emit('job_update', updatedJob);` — at `/job-update` alias route

**Client-side socket listeners in the `/hud` HTML** (lines 894–905):
```javascript
894  const socket = io({ transports: ['websocket', 'polling'] });
895  socket.on('connect', () => {
896    connEl.textContent = 'live';
897    connEl.style.color = '#3fb950';
898    fetch('/jobs/status?filter=all').then(r=>r.json()).then(d => {
899      d.jobs.forEach(j => jobs.set(j.id, j));
900      render();
901    }).catch(()=>{});
902  });
903  socket.on('disconnect', () => { connEl.textContent = 'offline'; connEl.style.color = '#f85149'; });
904  socket.on('job_update', job => { jobs.set(job.id, job); render(); });
905  socket.on('jobs_snapshot', list => { jobs.clear(); list.forEach(j => jobs.set(j.id, j)); render(); });
```

**The client does NOT listen for `hud_update`.** The `broadcastHud()` function emits `hud_update`, but the HUD HTML only listens for `job_update` and `jobs_snapshot`. `jobs_snapshot` is not emitted anywhere in index.js.

---

### From `/Users/mikewolf/Projects/yeshie/scripts/hud.py`

#### `HUD_URL` definition and usage — line 46
```python
46  HUD_URL   = "http://localhost:3333/hud"
```
Used at:
- Line 82 (inside `_reload`): `webview.loadRequest_(NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL)))`
- Line 183 (in `applicationDidFinishLaunching_`): `req = NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL))`
- Line 251 (in `reload_panel`): `req = NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL))`

#### `_reload()` handler — lines 81–85
```python
81          elif path == '/reload':
82              def _reload():
83                  if webview:
84                      webview.loadRequest_(NSURLRequest.requestWithURL_(NSURL.URLWithString_(HUD_URL)))
85                  _show_panel()
86              _main_queue.put(_reload)
```

#### `_show_panel()` function — lines 58–72
```python
58  def _show_panel():
59      """Bring the HUD panel forward on the current Space, without stealing focus."""
60      if not panel:
61          return
62      # Move to whichever Space the user is on right now (Stationary would pin it
63      # to its original Space and Mike would never see it after switching).
64      panel.setCollectionBehavior_(
65          AppKit.NSWindowCollectionBehaviorCanJoinAllSpaces |
66          AppKit.NSWindowCollectionBehaviorStationary
67      )
68      # NSStatusWindowLevel (25) sits above NSFloatingWindowLevel (3) and full-screen apps.
69      panel.setLevel_(AppKit.NSStatusWindowLevel)
70      # orderFrontRegardless reliably surfaces a NonactivatingPanel; makeKey is a no-op for those.
71      panel.orderFrontRegardless()
72      print(f"[hud] _show_panel: orderFrontRegardless called, visible={panel.isVisible()}", flush=True)
```

#### `/wv-status` implementation — lines 101–128
```python
101          if self.path == '/wv-status':
102              result_holder = [None]
103              ev = threading.Event()
104              js = ("JSON.stringify({"
105                    "loaded:true,"
106                    "conn:document.getElementById('conn')?document.getElementById('conn').textContent:'?',"
107                    "jobCount:typeof jobs!=='undefined'?jobs.size:-1,"
108                    "url:location.href"
109                    "})")
110              def do_eval():
111                  if webview:
112                      url     = webview.URL()
113                      loading = webview.isLoading()
114                      result_holder[0] = json.dumps({
115                          'loaded':    bool(url),
116                          'url':       str(url) if url else None,
117                          'isLoading': bool(loading),
118                      })
119                  else:
120                      result_holder[0] = json.dumps({'loaded': False, 'error': 'no webview'})
121                  ev.set()
122              _main_queue.put(do_eval)
123              ev.wait(timeout=3.0)
124              body = (result_holder[0] or json.dumps({'loaded': False, 'error': 'timeout'})).encode()
```

Note: The `js` variable (lines 104–109) is constructed but NEVER called. `do_eval()` (lines 110–121) uses only `webview.URL()` and `webview.isLoading()` — native ObjC properties. It does NOT execute any JavaScript. The `conn` element text, `jobs.size`, and Socket.IO connection status are not checked.

---

## 4. Session Transcript Pointers

Session transcripts are at: `~/Library/Application Support/Claude/local-agent-mode-sessions/**/<session_id>/`

| Session ID | Title |
|-----------|-------|
| `local_548b7eb7-2b04-408a-9f83-0795b7a88963` | "HUD blank — root cause" |
| `local_fb0d19ac-eafe-4aa6-8413-82c20ac76672` | Current Dispatch session (this conversation) — derived from working directory path `/Users/mikewolf/Library/Application Support/Claude/local-agent-mode-sessions/f84bda13-161c-4923-ac38-ebfdef6a6fa6/853382b2-6ccc-4172-a693-adabf5edc760/local_fb0d19ac-eafe-4aa6-8413-82c20ac76672/` |
| `local_1bbb701b` | "HUD persist + cmd scale" |
| `local_4b055e6a` | "HUD progress + status semantics" |

---

## 5. Observed Symptom (verbatim, no interpretation)

The HUD window shows 'No active jobs' or blank content. The relay API at /jobs/status?filter=all returns jobs. The WKWebView reports loaded:true at the correct URL. The problem persists after relay restart and WKWebView reload.

---

## 6. Experiments a Fresh Investigator Could Run

### See the actual HTML being rendered in WKWebView
```bash
# Fetch what the relay is actually serving (raw HTML source)
curl -s http://localhost:3333/hud > /tmp/hud-source.html
open /tmp/hud-source.html   # opens in browser for inspection

# Count bytes to confirm the right route is hit
curl -s http://localhost:3333/hud | wc -c
```

### Check if JavaScript is executing in the WKWebView
Add a JavaScript eval to /wv-status. Currently hud.py constructs a `js` variable (line 104) but never calls `evaluateJavaScript_completionHandler_`. To test:
```bash
# Manually inject a test via osascript to run JS in the WKWebView process
# (requires knowing the WKWebView's process — use chrome-devtools-mcp if WKWebView exposes port)

# Alternative: add a console.log to the /hud HTML and check system logs
log stream --predicate 'process == "hud"' --level debug 2>/dev/null | head -50
cat /tmp/hud.log
```

### Verify if Socket.IO is connecting
```bash
# Watch relay log for 'client' or 'hud' connection events
tail -f /tmp/relay.log | grep -i 'connect\|socket\|hud'

# Check if relay sees any Socket.IO clients besides the extension
curl -s http://localhost:3333/status
```

### Check if pollJobs() is being called
```bash
# Add a temporary endpoint to the relay that logs poll calls, or:
# Watch relay access logs — each pollJobs() fires GET /jobs/status?filter=all
# since the relay doesn't log HTTP GETs by default, add middleware temporarily

# Verify the poll endpoint returns data:
curl -sv 'http://localhost:3333/jobs/status?filter=all' 2>&1
# (check response headers and body)

# Inject a live job to verify the full path:
curl -s -X POST http://localhost:3333/jobs/update \
  -H 'Content-Type: application/json' \
  -d '{"id":"test-001","title":"Test Job","status":"running","step":"testing"}'
# then immediately check:
curl -s 'http://localhost:3333/jobs/status?filter=all'
# and observe whether HUD updates within 5s (pollJobs interval)
```

### Verify Socket.IO is connecting from WKWebView
```bash
# Watch relay log for WKWebView Socket.IO connection:
tail -f /tmp/relay.log

# Trigger a reload and watch:
curl -s -X POST http://localhost:3334/reload
# Relay log should show: [relay] connected: unknown (socket_id)
# If no connection appears within 2s, Socket.IO is not connecting from WKWebView
```

### Add console.log to relay HTML and capture from WKWebView
```bash
# In index.js /hud route, add to the inline script (around line 939):
#   console.log('[hud] pollJobs called, jobs count:', jobs.size);
# Then restart relay:
launchctl kickstart -k gui/$(id -u)/com.yeshie.relay

# Capture WKWebView console output via system log:
log stream --predicate 'process CONTAINS "Python" OR process CONTAINS "hud"' --level debug 2>/dev/null
# WKWebView console.log output may appear in system logs under the hud.py process
```

### Serve a minimal test page and verify WKWebView can render dynamic content
```bash
# Add a test route to the relay (or use a separate server) serving:
#   <script>document.body.innerHTML = 'JS works: ' + Date.now();</script>
# Then:
curl -s -X POST http://localhost:3334/reload  # reload WKWebView
# Check /wv-status to confirm URL changed, isLoading false
curl -s http://localhost:3334/wv-status

# Alternatively serve a static counter:
# Add GET /hud-test to relay returning:
#   <body><div id="t">0</div><script>let n=0; setInterval(()=>document.getElementById('t').textContent=++n,1000);</script></body>
# Load it in WKWebView via hud.py /reload after temporarily changing HUD_URL
```

### Check the two-system job tracking split
```bash
# System 1: jobMap-based (uses /job/start, /job/update, broadcasts hud_update)
curl -s -X POST http://localhost:3333/job/start \
  -H 'Content-Type: application/json' \
  -d '{"job_id":"map-test","session_title":"Test","description":"Test job"}'
curl -s http://localhost:3333/jobs   # returns jobMap contents

# System 2: jobs Map-based (uses /jobs/update, broadcasts job_update)
curl -s -X POST http://localhost:3333/jobs/update \
  -H 'Content-Type: application/json' \
  -d '{"id":"jobs-test","title":"Test Job","status":"running"}'
curl -s 'http://localhost:3333/jobs/status?filter=all'  # returns jobs Map contents

# The HUD HTML listens for job_update (System 2) but NOT hud_update (System 1).
# Verify which system cc-dispatch actually calls by checking:
grep -r 'job/start\|job/update\|jobs/update\|jobs/create' ~/Projects/yeshie/scripts/ --include='*.sh' --include='*.py' -l
grep -r 'job/start\|job/update\|jobs/update\|jobs/create' ~/Projects/yeshie/.claude/ --include='*.sh' --include='*.py' -l 2>/dev/null | head -20
```
