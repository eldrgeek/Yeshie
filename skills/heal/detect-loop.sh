#!/bin/bash
# Usage: detect-loop.sh <payload-file-path>
# Returns exit 1 (loop detected) if payload was healed within last 15 minutes
PAYLOAD="$1"
THRESHOLD=900  # 15 minutes in seconds

HEALED_AT=$(python3 -c "
import json, sys
try:
    data = json.load(open('$PAYLOAD'))
    print(data.get('_heal', {}).get('healedAt', ''))
except: print('')
" 2>/dev/null)

if [ -z "$HEALED_AT" ]; then exit 0; fi

# Strip milliseconds for date parsing (e.g. 2026-04-15T08:00:00.000Z → 2026-04-15T08:00:00Z)
HEALED_CLEAN=$(echo "$HEALED_AT" | sed 's/\.[0-9]*Z$/Z/')

NOW=$(date +%s)
# Use python3 for robust UTC epoch parsing (handles both macOS and Linux)
HEALED_EPOCH=$(python3 -c "
from datetime import datetime, timezone
ts = '${HEALED_CLEAN%Z}'
try:
    print(int(datetime.fromisoformat(ts + '+00:00').timestamp()))
except Exception as e:
    print('')
" 2>/dev/null)

if [ -z "$HEALED_EPOCH" ]; then
  echo "WARN: could not parse healedAt: $HEALED_AT" >&2
  exit 0
fi

DELTA=$((NOW - HEALED_EPOCH))
if [ "$DELTA" -lt "$THRESHOLD" ]; then
  echo "HEAL_LOOP_DETECTED: payload was healed ${DELTA}s ago (threshold: ${THRESHOLD}s)"
  exit 1
fi
exit 0
