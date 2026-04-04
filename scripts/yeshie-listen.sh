#!/usr/bin/env bash
# Start a Claude Code session as the Yeshie side panel listener.
# Usage: ./scripts/yeshie-listen.sh
# Or:    alias yeshie-listen='~/Projects/yeshie/scripts/yeshie-listen.sh'

set -euo pipefail
cd "$(dirname "$0")/.."

export HOME="${HOME:-/Users/mikewolf}"
export PATH="/Users/mikewolf/.local/bin:/Users/mikewolf/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || true)}"
if [ -z "$CLAUDE_BIN" ] && [ -x "/Users/mikewolf/.local/bin/claude" ]; then
  CLAUDE_BIN="/Users/mikewolf/.local/bin/claude"
fi

if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "Error: Claude CLI not found."
  echo "Set CLAUDE_BIN or ensure claude is installed at /Users/mikewolf/.local/bin/claude"
  exit 1
fi

# Verify relay is running
if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
  echo "Error: Yeshie relay is not running on port 3333"
  echo "Start it with: launchctl kickstart -k gui/$(id -u)/com.yeshie.relay"
  exit 1
fi

echo "Relay is running. Starting Yeshie listener (Haiku)..."
echo "The listener will wait for messages from the Chrome side panel."
echo "Press Ctrl+C to stop."
echo ""

# Compose system prompt: base-listener.md + all site context files.
# Each site file is wrapped in <site-context domain="..."> tags so the listener
# can select the right one based on currentUrl in the incoming message.
build_system_prompt() {
  cat prompts/base-listener.md
  if [ -d prompts/sites ]; then
    for f in prompts/sites/*.md; do
      [ -f "$f" ] || continue
      printf "\n\n"
      cat "$f"
    done
  fi
}

# Run one listener cycle per Claude invocation. This is more reliable under
# launchd than trying to keep one long interactive Claude session alive forever.
while true; do
  if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
    echo "Relay is unavailable. Retrying in 10s..."
    sleep 10
    continue
  fi

  if "$CLAUDE_BIN" \
    --model claude-haiku-4-5-20251001 \
    --mcp-config .mcp.json \
    --system-prompt "$(build_system_prompt)" \
    --dangerously-skip-permissions \
    --allowedTools "mcp__cc-bridge-mcp__yeshie_listen,mcp__cc-bridge-mcp__yeshie_respond,mcp__cc-bridge-mcp__yeshie_chat_status,mcp__cc-bridge-mcp__yeshie_run,mcp__cc-bridge-mcp__yeshie_status,mcp__cc-bridge-mcp__claude_code,mcp__cc-bridge-mcp__shell_exec" \
    -p "Handle exactly one Yeshie listener cycle. Call yeshie_listen(timeout_seconds=300) once. If it returns a timeout, exit with a one-line status. If it returns a chat_message, check the currentUrl field to identify which site the user is on, load the matching <site-context> block from your system prompt, process the request using that context, call yeshie_respond with your response, then exit. Do not enter your own loop — this shell script reinvokes you for the next message." \
    >> /tmp/yeshie-listener-tty.log 2>&1; then
    sleep 1
  else
    echo "Claude listener cycle failed. Retrying in 15s..."
    sleep 15
  fi
done
