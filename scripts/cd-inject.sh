#!/bin/bash
# cd-inject.sh v3 — pure AX injection via Python/PyObjC
# Usage: cd-inject.sh "SESSION_TITLE" "message"
# SESSION_TITLE is kept for API compatibility but not currently needed
# (injection always targets the active session)
MESSAGE="${2:-$1}"
if [ -z "$MESSAGE" ]; then
  echo 'Usage: cd-inject.sh [SESSION_TITLE] "message"' >&2
  exit 1
fi
python3 ~/Projects/yeshie/scripts/ax-inject.py "$MESSAGE"
