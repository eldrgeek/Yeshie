# Yeshie RSI Loop — Session Context
**Updated:** April 5, 2026 ~19:00
**Project:** ~/Projects/yeshie

---

## What Was Built This Session

### Infrastructure
1. **`scripts/watchdog.sh`** — monitors background jobs, posts to status board every 60s, injects into CD on completion
2. **`scripts/run-campaign.sh`** — sequential RSI campaign runner, one task at a time, blocks on each result, posts to status board, retries on no_listener
3. **Status board** — added to relay (`/status-board` GET/POST), dark themed, live JS countdown, auto-refresh
4. **`scripts/notify-cd.sh`** equivalent — inject_cd() inside watchdog.sh

### Key Patterns
- Launch jobs: `nohup bash /tmp/run-NN.sh > /dev/null 2>&1 & PID=$!`
- Always write task to a file first, avoid inline quoting hell
- Attach watchdog immediately: `nohup bash watchdog.sh $PID "name" $LOG 60 &`
- Status board in separate Chrome window (not tab) to avoid tab hijacking

---

## Current State

### Infrastructure
- Relay: running, extensionConnected: true
- Listener: running (haiku → sonnet → opus escalation)
- Status board: http://localhost:3333/status-board (open in separate Chrome window)
- YeshID tab: one clean tab at app.yeshid.com/overview

### Campaign Progress
| Campaign | Status | Notes |
|---|---|---|
| 01-people | ✅ Ran | 5/7 responded, 24 people confirmed, 2 escalations |
| 02-directory-groups | 🔄 Partial | Task 1 OK (Google Workspace dir found), tasks 2-5 intermittent no_listener/unsupported, stopped mid-run |
| 03-07 | ⬜ Not run | |

---

## Known Issues To Fix Before Next Campaign

### 1. Listener gap between tasks (CRITICAL)
When one listener invocation ends and the watcher restarts it, there's a ~2-8s gap. Tasks sent during this gap get `no_listener`. The campaign runner retries once after 8s, but sometimes the listener is still restarting.
**Fix needed:** Increase retry wait to 15s, or retry up to 3x.

### 2. "Unsupported" actions from listener (INTERMITTENT)
Listener occasionally generates chains with action types not in background.js. Bead A confirmed background.js has all required types — so this may be the listener generating bad chains under certain conditions.
**Fix needed:** Add logging of exact chain sent when "unsupported" occurs.

### 3. No explicit tabId passed to extension (CRITICAL)
The extension targets whatever tab the Yeshie side panel is attached to. During campaign 02, the status board tab got hijacked.
**Fix needed:** campaign runner must discover YeshID tab ID at startup and pass `tabId` in every /chat POST.

### 4. Google account chooser interrupts campaigns
When YeshID session expires, Google account chooser appears. Extension hangs waiting.
**Protocol:** Always click mw@mike-wolf.com without asking. Check for this before each campaign.

---

## How To Continue

### Before running any campaign:
```bash
# 1. Check listener
curl -s http://localhost:3333/chat/status

# 2. Check YeshID tab is logged in (not on Google auth page)
# Check Chrome tabs — should have one app.yeshid.com tab

# 3. Status board in separate window
# http://localhost:3333/status-board
```

### Run next campaign (02 again, from scratch):
```bash
SESSION="rsi-02-$(date +%Y%m%d-%H%M%S)"
LOG="/tmp/yeshie-rsi/$SESSION/runner.log"
mkdir -p "/tmp/yeshie-rsi/$SESSION"
cat > /tmp/run-02.sh << RUNNER
#!/bin/bash
cd ~/Projects/yeshie
bash scripts/run-campaign.sh sites/yeshid/rsi-tasks/02-directory-groups.tasks.txt $SESSION >> $LOG 2>&1
echo "EXIT: \$?" >> $LOG
RUNNER
chmod +x /tmp/run-02.sh
nohup bash /tmp/run-02.sh > /dev/null 2>&1 &
CAMP_PID=$!
nohup bash ~/Projects/yeshie/scripts/watchdog.sh $CAMP_PID "campaign-02" $LOG 60 > /tmp/watchdog-02.log 2>&1 &
echo "PID: $CAMP_PID | Log: $LOG"
```

### Campaigns remaining:
- 02-directory-groups (rerun)
- 03-applications
- 04-access-audit
- 05-security
- 06-workflows
- 07-settings

---

## Architecture Reference

```
CD (me) — Campaign Director
  → writes /tmp/run-NN.sh, launches it
  → attaches watchdog
  → ends turn

run-campaign.sh (sequential)
  → checks listener alive
  → sends one task via POST /chat (blocks 300s)
  → logs result to status board
  → next task

watchdog.sh
  → posts heartbeat to status board every 60s
  → on completion: inject into CD

Status board: http://localhost:3333/status-board
  → POST {"text":"..."} to add message
  → GET to view (auto-refresh 10s countdown)
```

---

## Key File Paths
```
~/Projects/yeshie/
├── scripts/
│   ├── run-campaign.sh       # Sequential campaign runner
│   ├── watchdog.sh           # Job monitor + status board poster
│   ├── yeshie-listen.sh      # Listener (haiku→sonnet→opus)
│   ├── yeshie-listener-watch.sh  # Watcher/restart wrapper
│   └── rsi-drive.sh          # Old driver (replaced by run-campaign.sh)
├── sites/yeshid/rsi-tasks/   # Task files 01-07
├── packages/relay/index.js   # Relay + status board endpoint
└── prompts/base-listener.md  # Listener system prompt
```
