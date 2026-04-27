#!/bin/bash
# cd-inject.sh v4 — posts to relay job system + macOS notification fallback
# Usage: cd-inject.sh "SESSION_TITLE" "message"
SESSION="${1:-}"
MESSAGE="${2:-$1}"

if [ -z "$MESSAGE" ]; then
  echo 'Usage: cd-inject.sh [SESSION_TITLE] "message"' >&2
  exit 1
fi

RELAY="http://localhost:3333"

# 1. Post completion to relay (relay handles HUD show + inject attempt)
JOB_ID="cd-$(date +%s)-$$"
curl -s -X POST "$RELAY/job-update" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$JOB_ID\",\"title\":\"$SESSION\",\"status\":\"done\",\"result\":\"$MESSAGE\",\"notify_message\":\"$MESSAGE\",\"session_title\":\"$SESSION\"}" \
  > /dev/null 2>&1

# 2. Show HUD immediately
curl -s -X POST "http://localhost:3334/show" > /dev/null 2>&1

# 3. macOS notification as reliable always-visible fallback
SHORT_MSG=$(echo "$MESSAGE" | head -c 80)
osascript -e "display notification \"$SHORT_MSG\" with title \"Yeshie Job Done\" subtitle \"$SESSION\" sound name \"Glass\"" 2>/dev/null || true

# 4. Try ax-inject as bonus (may or may not work)
python3 ~/Projects/yeshie/scripts/ax-inject.py "$MESSAGE" 2>/dev/null || true

echo "Notified: $SESSION → $MESSAGE"
