#!/usr/bin/env bash
# Start all three Yeshie tier listeners via launchd.
# DO NOT run this while the live relay is handling traffic.
#
# Usage: ./scripts/start-listeners.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

TIERS=("haiku" "sonnet" "opus")

echo "Copying plists to $LAUNCH_AGENTS..."
for tier in "${TIERS[@]}"; do
  cp "$SCRIPT_DIR/com.yeshie.listener-${tier}.plist" "$LAUNCH_AGENTS/"
  echo "  Copied com.yeshie.listener-${tier}.plist"
done

echo ""
echo "Unloading existing labels (ignore errors)..."
for tier in "${TIERS[@]}"; do
  launchctl unload "$LAUNCH_AGENTS/com.yeshie.listener-${tier}.plist" 2>/dev/null || true
done

echo ""
echo "Loading plists..."
for tier in "${TIERS[@]}"; do
  launchctl load "$LAUNCH_AGENTS/com.yeshie.listener-${tier}.plist"
  echo "  Loaded com.yeshie.listener-${tier}"
done

echo ""
echo "All three tier listeners started."
echo ""
echo "Chat status:"
curl -s http://localhost:3333/chat/status | python3 -m json.tool
