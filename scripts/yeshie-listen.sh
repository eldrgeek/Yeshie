#!/usr/bin/env bash
# Start a Claude Code session as the Yeshie side panel listener.
# Usage: ./scripts/yeshie-listen.sh
# Or:    alias yeshie-listen='~/Projects/yeshie/scripts/yeshie-listen.sh'

set -euo pipefail
cd "$(dirname "$0")/.."

# Verify relay is running
if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
  echo "Error: Yeshie relay is not running on port 3333"
  echo "Start it with: launchctl kickstart -k gui/$(id -u)/com.yeshie.relay"
  exit 1
fi

echo "Relay is running. Starting Yeshie listener..."
echo "The listener will wait for messages from the Chrome side panel."
echo "Press Ctrl+C to stop."
echo ""

# Run from the project root so Claude Code picks up .mcp.json
exec claude \
  --system-prompt "$(cat prompts/listener.md)" \
  --allowedTools "mcp__cc-bridge-mcp__yeshie_listen,mcp__cc-bridge-mcp__yeshie_respond,mcp__cc-bridge-mcp__yeshie_chat_status,mcp__cc-bridge-mcp__yeshie_run,mcp__cc-bridge-mcp__yeshie_status,mcp__cc-bridge-mcp__shell_exec" \
  -p "Start the Yeshie listener loop. Call yeshie_listen to wait for messages. When a message arrives, process it based on the mode (answer/do/teach) and call yeshie_respond with your response. Then call yeshie_listen again. Repeat forever. On timeout, re-listen immediately. On error, wait 5 seconds and retry."
