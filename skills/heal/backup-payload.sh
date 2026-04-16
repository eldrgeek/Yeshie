#!/bin/bash
# Usage: backup-payload.sh <payload-file-path>
# Creates a .bak file before HEAL patches a payload
PAYLOAD="$1"
if [ -z "$PAYLOAD" ]; then echo "Usage: backup-payload.sh <path>"; exit 1; fi
if [ ! -f "$PAYLOAD" ]; then echo "File not found: $PAYLOAD"; exit 1; fi
BAK="${PAYLOAD%.json}.$(date +%s).bak.json"
cp "$PAYLOAD" "$BAK"
# Update the payload's metadata with last backup reference
TMP=$(mktemp)
python3 -c "
import json, sys
data = json.load(open('$PAYLOAD'))
data.setdefault('_heal', {})['lastBackup'] = '$BAK'
data['_heal']['backedUpAt'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
json.dump(data, open('$TMP', 'w'), indent=2)
"
mv "$TMP" "$PAYLOAD"
echo "Backed up to: $BAK"
