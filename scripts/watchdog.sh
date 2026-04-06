#!/bin/bash
# watchdog.sh — monitors a background job
# Usage: watchdog.sh <PID> <job_name> <result_file> <interval_seconds>

PID=$1
JOB_NAME=$2
RESULT_FILE=$3
INTERVAL=${4:-60}
START_TIME=$(date +%s)
BOARD="http://localhost:3333/status-board"

post_status() {
  local msg="$1"
  curl -s -X POST "$BOARD" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$msg\"}" > /dev/null 2>&1
}

inject_cd() {
  local msg="$1"
  osascript \
    -e "tell application \"Claude\" to activate" \
    -e "delay 0.5" \
    -e "tell application \"System Events\"" \
    -e "tell process \"Claude\"" \
    -e "set frontmost to true" \
    -e "delay 0.5" \
    -e "keystroke \"$msg\"" \
    -e "delay 0.3" \
    -e "keystroke return" \
    -e "end tell" \
    -e "end tell" 2>/dev/null
}

get_api_active() {
  local child=$(pgrep -P "$PID" 2>/dev/null | head -1)
  [ -n "$child" ] && lsof -p "$child" 2>/dev/null | grep -q "ESTABLISHED" && echo "yes" || echo "no"
}

TS=$(date +%H:%M:%S)
post_status "[$TS] WATCHDOG $JOB_NAME: started, monitoring PID $PID"
echo "watchdog started: PID=$PID JOB=$JOB_NAME"

while kill -0 "$PID" 2>/dev/null; do
  sleep "$INTERVAL"
  kill -0 "$PID" 2>/dev/null || break

  ELAPSED=$(( $(date +%s) - START_TIME ))
  MINS=$(( ELAPSED / 60 ))
  LINES=$(wc -l < "$RESULT_FILE" 2>/dev/null | tr -d ' ')
  API=$(get_api_active)
  TS=$(date +%H:%M:%S)

  if [ "$API" = "yes" ]; then
    post_status "[$TS] WATCHDOG $JOB_NAME: ${MINS}m elapsed, API active, $LINES lines"
  else
    post_status "[$TS] WATCHDOG $JOB_NAME: ${MINS}m elapsed, $LINES lines, no API call"
  fi
done

# Finished — post to board AND inject into CD
ELAPSED=$(( $(date +%s) - START_TIME ))
MINS=$(( ELAPSED / 60 ))
SECS=$(( ELAPSED % 60 ))
TS=$(date +%H:%M:%S)
EXIT_CODE=$(grep "^EXIT:" "$RESULT_FILE" 2>/dev/null | tail -1 | grep -o '[0-9]*' | head -1)
EXIT_CODE=${EXIT_CODE:-unknown}
LINES=$(wc -l < "$RESULT_FILE" 2>/dev/null | tr -d ' ')

if [ "$EXIT_CODE" = "0" ]; then
  MSG="[$TS] DONE $JOB_NAME: ${MINS}m${SECS}s exit=0 lines=$LINES"
else
  MSG="[$TS] FAILED $JOB_NAME: ${MINS}m${SECS}s exit=$EXIT_CODE"
fi

post_status "$MSG"
sleep 2  # let CD finish its current turn before injecting
inject_cd "$MSG log=$RESULT_FILE"
echo "watchdog done: $MSG"
