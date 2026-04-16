#!/usr/bin/env bash
# Yeshie Tier Listener — persistent single-tier listener.
# Relay handles escalation routing; this script just keeps the tier slot filled.
# Controlled by launchd plists (com.yeshie.listener-haiku/sonnet/opus).
#
# Env vars: YESHIE_TIER (haiku|sonnet|opus), YESHIE_MODEL (claude model id)
# Usage: YESHIE_TIER=haiku YESHIE_MODEL=claude-haiku-4-5-20251001 ./scripts/yeshie-listen-tier.sh

cd "$(dirname "$0")/.."

export HOME="${HOME:-/Users/mikewolf}"
export PATH="/Users/mikewolf/.local/bin:/Users/mikewolf/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

TIER="${YESHIE_TIER:-haiku}"
MODEL="${YESHIE_MODEL:-claude-haiku-4-5-20251001}"
LOG="/tmp/yeshie-listener-${TIER}.log"

CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || true)}"
if [ -z "$CLAUDE_BIN" ] && [ -x "/Users/mikewolf/.local/bin/claude" ]; then
  CLAUDE_BIN="/Users/mikewolf/.local/bin/claude"
fi

if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "Error: Claude CLI not found." >> "$LOG"
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

TASK_PROMPT="You are the ${TIER} tier listener. Your loop: call yeshie_listen(tier='${TIER}', timeout_seconds=300). If timeout, call yeshie_listen again immediately. If chat_message: identify the site from currentUrl, process the request, call yeshie_respond, then call yeshie_listen again. Do not exit voluntarily."

SYSTEM_PROMPT="$(build_system_prompt)"

echo "[${TIER}] Yeshie tier listener starting (model: ${MODEL})" >> "$LOG"

# Outer loop: restart Claude immediately on exit — no sleep
while true; do
  if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
    echo "[${TIER}] Relay unavailable. Retrying in 10s..." >> "$LOG"
    sleep 10
    continue
  fi

  "$CLAUDE_BIN" \
    --model "$MODEL" \
    --mcp-config .mcp.json \
    --system-prompt "$SYSTEM_PROMPT" \
    --dangerously-skip-permissions \
    --allowedTools "$ALLOWED_TOOLS" \
    -p "$TASK_PROMPT" \
    >> "$LOG" 2>&1

  echo "[${TIER}] Claude exited, restarting immediately..." >> "$LOG"
done
