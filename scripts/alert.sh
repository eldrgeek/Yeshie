#!/bin/bash
# alert.sh — macOS dialog for blocked/escalated HUD jobs
# Usage: alert.sh <SESSION_TITLE> <MESSAGE> <JOB_ID>
SESSION_TITLE="${1:-unknown session}"
MESSAGE="${2:-Job needs your attention}"
JOB_ID="${3:-unknown}"

afplay /System/Library/Sounds/Sosumi.aiff 2>/dev/null &

RESULT=$(osascript 2>/dev/null <<APPLESCRIPT
tell application "System Events"
  activate
  set btn to button returned of (display dialog "⚠️ BLOCKED — needs your input

Job: ${JOB_ID}
Session: ${SESSION_TITLE}

${MESSAGE}" with title "Claude Needs You" buttons {"Dismiss", "Snooze 5 min", "Open Session"} default button "Open Session" giving up after 0)
end tell
btn
APPLESCRIPT
)

case "$RESULT" in
  "Open Session")
    ~/Projects/yeshie/scripts/cd-inject.sh "$SESSION_TITLE" "I'm here — resuming job ${JOB_ID}. What do you need?"
    curl -s -X POST http://localhost:3333/job/ack \
      -H "Content-Type: application/json" \
      -d "{\"job_id\":\"${JOB_ID}\"}" > /dev/null 2>&1
    ;;
  "Snooze 5 min"|"Dismiss"|"") ;;
esac
