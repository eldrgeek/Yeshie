#!/usr/bin/env bash
# RSI Driver — sends tasks to Yeshie listener and evaluates results
# Usage: ./scripts/rsi-drive.sh <target_url> [task_file]
#
# If task_file is provided, reads tasks line-by-line.
# If omitted, uses a default admin-dashboard task sequence.
#
# The listener is a persistent Claude session (always connected).
# This script just sends tasks and evaluates responses.

set -euo pipefail
cd "$(dirname "$0")/.."

TARGET_URL="${1:?Usage: rsi-drive.sh <target_url> [task_file]}"
TASK_FILE="${2:-}"
SESSION_ID="rsi-$(date +%Y%m%d-%H%M%S)"
LOG_DIR="/tmp/yeshie-rsi/$SESSION_ID"
mkdir -p "$LOG_DIR"

echo "═══════════════════════════════════════════════"
echo "  Yeshie RSI Session: $SESSION_ID"
echo "  Target: $TARGET_URL"
echo "  Logs:   $LOG_DIR"
echo "═══════════════════════════════════════════════"

# Check relay
if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
  echo "ERROR: Relay not running on port 3333"
  exit 1
fi

# Check listener (persistent — should always be connected)
echo -n "Checking listener... "
STATUS=$(curl -sf http://localhost:3333/chat/status 2>/dev/null || echo '{}')
if echo "$STATUS" | grep -q '"listenerConnected":true'; then
  echo "connected."
else
  echo "not connected. Waiting 10s for startup..."
  sleep 10
  STATUS=$(curl -sf http://localhost:3333/chat/status 2>/dev/null || echo '{}')
  if ! echo "$STATUS" | grep -q '"listenerConnected":true'; then
    echo "ERROR: Listener still not connected. Is com.yeshie.listener running?"
    exit 1
  fi
  echo "connected."
fi

echo ""

# Default tasks for admin dashboards
DEFAULT_TASKS=(
  "Map all pages reachable from the sidebar navigation"
  "List all users on the People page"
  "Read the details of the first user in the list"
  "Navigate to the Applications page and list all connected apps"
  "Navigate to the Settings page and describe what's available"
)

# Read tasks
TASKS=()
if [ -n "$TASK_FILE" ] && [ -f "$TASK_FILE" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && [[ ! "$line" =~ ^# ]] && TASKS+=("$line")
  done < "$TASK_FILE"
  echo "Loaded ${#TASKS[@]} tasks from $TASK_FILE"
else
  TASKS=("${DEFAULT_TASKS[@]}")
  echo "Using ${#TASKS[@]} default admin-dashboard tasks"
fi

echo ""

# Drive each task
SUCCESSES=0
FAILURES=0
ESCALATIONS=0

for i in "${!TASKS[@]}"; do
  TASK="${TASKS[$i]}"
  TASK_NUM=$((i + 1))

  echo "───────────────────────────────────────────────"
  echo "Task $TASK_NUM/${#TASKS[@]}: $TASK"
  echo "───────────────────────────────────────────────"

  RESULT_FILE="$LOG_DIR/task-$(printf '%02d' $TASK_NUM).json"

  # Send task to listener via POST /chat (blocks until response)
  RESPONSE=$(curl -s -X POST http://localhost:3333/chat \
    -H "Content-Type: application/json" \
    --max-time 300 \
    -d "$(jq -n \
      --arg msg "$TASK" \
      --arg url "$TARGET_URL" \
      '{message: $msg, currentUrl: $url, mode: "answer"}')" \
    2>&1) || RESPONSE='{"type":"error","text":"curl failed or timed out"}'

  # Save response
  echo "$RESPONSE" > "$RESULT_FILE"

  # Evaluate
  RESP_TYPE=$(echo "$RESPONSE" | jq -r '.type // "unknown"' 2>/dev/null || echo "unknown")
  RESP_SUCCESS=$(echo "$RESPONSE" | jq -r '.success // "null"' 2>/dev/null || echo "null")
  RESP_TEXT=$(echo "$RESPONSE" | jq -r '.text // "(no text)"' 2>/dev/null || echo "(parse error)")
  ESCALATED=$(echo "$RESPONSE" | jq -r '.escalate // false' 2>/dev/null || echo "false")

  # Retry once if listener was restarting (rare 3s context-refresh gap)
  if [ "$RESP_TYPE" = "no_listener" ]; then
    echo "   ⏳ Listener restarting, retrying in 5s..."
    sleep 5
    RESPONSE=$(curl -s -X POST http://localhost:3333/chat \
      -H "Content-Type: application/json" \
      --max-time 300 \
      -d "$(jq -n \
        --arg msg "$TASK" \
        --arg url "$TARGET_URL" \
        '{message: $msg, currentUrl: $url, mode: "answer"}')" \
      2>&1) || RESPONSE='{"type":"error","text":"curl failed or timed out"}'
    echo "$RESPONSE" > "$RESULT_FILE"
    RESP_TYPE=$(echo "$RESPONSE" | jq -r '.type // "unknown"' 2>/dev/null || echo "unknown")
    RESP_SUCCESS=$(echo "$RESPONSE" | jq -r '.success // "null"' 2>/dev/null || echo "null")
    RESP_TEXT=$(echo "$RESPONSE" | jq -r '.text // "(no text)"' 2>/dev/null || echo "(parse error)")
    ESCALATED=$(echo "$RESPONSE" | jq -r '.escalate // false' 2>/dev/null || echo "false")
  fi

  if [ "$RESP_SUCCESS" = "true" ] || [ "$RESP_TYPE" = "answer" ] || [ "$RESP_TYPE" = "do_result" ]; then
    echo "✅ SUCCESS"
    echo "   $RESP_TEXT" | head -3
    SUCCESSES=$((SUCCESSES + 1))
  elif [ "$RESP_SUCCESS" = "false" ]; then
    echo "❌ FAILURE"
    echo "   $RESP_TEXT" | head -3
    FAILURES=$((FAILURES + 1))
  else
    echo "ℹ️  RESPONSE ($RESP_TYPE)"
    echo "   $RESP_TEXT" | head -3
    SUCCESSES=$((SUCCESSES + 1))
  fi

  if [ "$ESCALATED" = "true" ]; then
    echo "   ⬆️  Escalation was triggered"
    ESCALATIONS=$((ESCALATIONS + 1))
  fi

  echo ""
  sleep 5
done

# Summary
echo "═══════════════════════════════════════════════"
echo "  RSI Session Complete: $SESSION_ID"
echo "  Tasks: ${#TASKS[@]}  Success: $SUCCESSES  Fail: $FAILURES  Escalations: $ESCALATIONS"
echo "  Logs: $LOG_DIR"
echo "═══════════════════════════════════════════════"
