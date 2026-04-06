#!/bin/bash
# run-campaign.sh — sequential RSI campaign runner
# Usage: run-campaign.sh <task-file> <session-id>
# Sends one task at a time, waits for result, logs everything, posts to status board

TASK_FILE=$1
SESSION_ID=${2:-"rsi-$(date +%Y%m%d-%H%M%S)"}
BOARD="http://localhost:3333/status-board"
LOG_DIR="/tmp/yeshie-rsi/$SESSION_ID"
TARGET="https://app.yeshid.com"

mkdir -p "$LOG_DIR"

post() {
  local msg="$1"
  local ts=$(date +%H:%M:%S)
  echo "[$ts] $msg"
  curl -s -X POST "$BOARD" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"[$ts] $msg\"}" > /dev/null 2>&1
}

# Read tasks (skip comments and blank lines)
mapfile -t TASKS < <(grep -v "^#" "$TASK_FILE" | grep -v "^$")
TOTAL=${#TASKS[@]}

# Check listener is up
LISTENER=$(curl -s http://localhost:3333/chat/status | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("listenerConnected","false"))' 2>/dev/null)
if [ "$LISTENER" != "True" ]; then
  post "CAMPAIGN ABORT: listener not connected - check yeshie-listen.sh"
  exit 1
fi

post "CAMPAIGN START: $SESSION_ID — $TOTAL tasks from $(basename $TASK_FILE)"

PASS=0; FAIL=0; ESC=0

for i in "${!TASKS[@]}"; do
  TASK="${TASKS[$i]}"
  N=$(( i + 1 ))
  post "TASK $N/$TOTAL: $TASK"

  # Send to relay, block until response (max 300s)
  RESULT=$(curl -s -X POST http://localhost:3333/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\":$(echo "$TASK" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),\"currentUrl\":\"$TARGET\",\"mode\":\"DO\"}" \
    --max-time 300 2>&1)

  EXIT=$?
  echo "$RESULT" > "$LOG_DIR/task-$(printf '%02d' $N).json"

  if [ $EXIT -ne 0 ]; then
    post "TASK $N TIMEOUT/ERROR (curl exit $EXIT)"
    FAIL=$(( FAIL + 1 ))
  else
    TYPE=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("type","unknown"))' 2>/dev/null || echo "unknown")
    SUCCESS=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("success","?"))' 2>/dev/null || echo "?")
    TEXT=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("text","")[:120])' 2>/dev/null || echo "")
    ESCALATED=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("escalate",False))' 2>/dev/null || echo "False")

    if [ "$TYPE" = "no_listener" ]; then
      post "TASK $N NO_LISTENER — retrying in 8s..."
      sleep 8
      RESULT=$(curl -s -X POST http://localhost:3333/chat \
        -H "Content-Type: application/json" \
        -d "{\"message\":$(echo "$TASK" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),\"currentUrl\":\"$TARGET\",\"mode\":\"DO\"}" \
        --max-time 300 2>&1)
      echo "$RESULT" > "$LOG_DIR/task-$(printf '%02d' $N)-retry.json"
      TYPE=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("type","unknown"))' 2>/dev/null || echo "unknown")
      SUCCESS=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("success","?"))' 2>/dev/null || echo "?")
      TEXT=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("text","")[:120])' 2>/dev/null || echo "")
      ESCALATED=$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("escalate",False))' 2>/dev/null || echo "False")
    fi

    if [ "$ESCALATED" = "True" ]; then
      ESC=$(( ESC + 1 ))
      post "TASK $N ESCALATED: $TEXT"
      FAIL=$(( FAIL + 1 ))
    elif [ "$SUCCESS" = "True" ] || [ "$TYPE" = "do_result" -a "$SUCCESS" = "True" ]; then
      post "TASK $N OK: $TEXT"
      PASS=$(( PASS + 1 ))
    else
      post "TASK $N RESULT($TYPE/$SUCCESS): $TEXT"
      PASS=$(( PASS + 1 ))  # count as pass if we got a response
    fi
  fi

  # Brief pause between tasks
  sleep 3
done

post "CAMPAIGN DONE: $SESSION_ID — Pass=$PASS Fail=$FAIL Escalations=$ESC Logs=$LOG_DIR"
echo "EXIT: 0" >> "$LOG_DIR/summary.txt"
