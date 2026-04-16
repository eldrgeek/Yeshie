#!/bin/bash
# wait-for-claude-idle.sh
# Polls Screenpipe until Claude's "Stop response" button disappears from recent frames.
# Usage: wait-for-claude-idle.sh [max_wait_seconds]
# Exit 0 = Claude is idle. Exit 1 = timed out.

MAX_WAIT="${1:-120}"
POLL_INTERVAL=3
WINDOW=8   # seconds of recency to check for Stop response
elapsed=0

echo "Waiting for Claude to become idle (max ${MAX_WAIT}s)..."

while [ $elapsed -lt $MAX_WAIT ]; do
  RECENT=$(date -u -v-${WINDOW}S '+%Y-%m-%dT%H:%M:%SZ')
  TOTAL=$(curl -s "http://localhost:3030/elements?app_name=Claude&q=Stop+response&start_time=${RECENT}&limit=1" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pagination',{}).get('total',0))" 2>/dev/null)

  if [ "${TOTAL}" = "0" ]; then
    echo "Claude is idle after ${elapsed}s"
    exit 0
  fi

  echo "  Claude busy (${elapsed}s elapsed)..."
  sleep $POLL_INTERVAL
  elapsed=$((elapsed + POLL_INTERVAL))
done

echo "Timed out after ${MAX_WAIT}s — Claude still busy"
exit 1
