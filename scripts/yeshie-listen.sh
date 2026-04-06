#!/usr/bin/env bash
# Yeshie Listener — one-shot Claude invocation per message with crash-recovery wrapper.
# The shell loop is the persistence layer. Claude handles one message per invocation.
# Gap between cycles: ~2s (Claude CLI startup + MCP handshake).
#
# Usage: ./scripts/yeshie-listen.sh
# Managed by: launchd (com.yeshie.listener via yeshie-listener-watch.sh)

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
  exit 1
fi

# Compose system prompt: base-listener.md + all site context files.
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

ALLOWED_TOOLS="mcp__cc-bridge-mcp__yeshie_listen,mcp__cc-bridge-mcp__yeshie_respond,mcp__cc-bridge-mcp__yeshie_chat_status,mcp__cc-bridge-mcp__yeshie_run,mcp__cc-bridge-mcp__yeshie_status,mcp__cc-bridge-mcp__claude_code,mcp__cc-bridge-mcp__shell_exec"

TASK_PROMPT="Handle exactly one Yeshie listener cycle. Call yeshie_listen(timeout_seconds=300) once. If timeout, exit cleanly. If chat_message, check currentUrl to identify the site, load the matching <site-context> block, process the request, call yeshie_respond, then exit. Do not loop — the wrapper script handles reinvocation."

SYSTEM_PROMPT="$(build_system_prompt)"

echo "Yeshie Listener running (one-shot per message, Haiku → Sonnet → Opus escalation)."
echo ""

# Outer loop: always running, instant restart between messages
while true; do
  if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
    echo "[wrapper] Relay unavailable. Retrying in 10s..."
    sleep 10
    continue
  fi

  MODELS=("claude-haiku-4-5-20251001" "claude-sonnet-4-6" "claude-opus-4-6")
  TIER_NAMES=("Haiku" "Sonnet" "Opus")
  TIER=0
  ESCALATION_CONTEXT=""
  RESULT_FILE="/tmp/yeshie-listener-result-$$.txt"

  while [ $TIER -lt 3 ]; do
    MODEL="${MODELS[$TIER]}"
    TIER_NAME="${TIER_NAMES[$TIER]}"

    if [ $TIER -eq 0 ]; then
      PROMPT="$TASK_PROMPT"
    else
      PROMPT="You are escalation tier $((TIER+1)) ($TIER_NAME). A previous model failed. The failure context is below. Call yeshie_listen(timeout_seconds=5) to check for a pending message (it may be dequeued — if timeout, use the failure context to try the task directly via yeshie_run). Try a different approach. Use yeshie_respond when done.

FAILURE CONTEXT FROM PREVIOUS TIER:
$ESCALATION_CONTEXT"
    fi

    "$CLAUDE_BIN" \
      --model "$MODEL" \
      --mcp-config .mcp.json \
      --system-prompt "$SYSTEM_PROMPT" \
      --dangerously-skip-permissions \
      --allowedTools "$ALLOWED_TOOLS" \
      -p "$PROMPT" \
      2>&1 | tee "$RESULT_FILE" >> /tmp/yeshie-listener-tty.log

    if grep -qE '"escalate":\s*true' "$RESULT_FILE" 2>/dev/null; then
      ESCALATION_CONTEXT=$(cat "$RESULT_FILE")
      TIER=$((TIER + 1))
      echo "[wrapper] $TIER_NAME escalated → tier $((TIER+1))"
      continue
    fi

    break
  done

  rm -f "$RESULT_FILE"
  # No sleep — restart immediately for next message
done
