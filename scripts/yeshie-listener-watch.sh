#!/usr/bin/env bash
# Watches prompt files and restarts the Yeshie listener when they change.
# Also auto-restarts if the listener crashes or the relay loses the long-poll.
# Usage: ./scripts/yeshie-listener-watch.sh   (managed by launchd: com.yeshie.listener)
#
# This script:
# 1. Starts yeshie-listen.sh as a child process (own process group, via set -m)
# 2. Watches prompts/base-listener.md + prompts/sites/*.md for changes (5s poll)
# 3. When a prompt file changes, kills the listener process GROUP and restarts it
# 4. If the listener exits unexpectedly, restarts after a backoff delay
# 5. If the relay reports no active listener AND no in-flight message for
#    24 consecutive checks (120s), restarts the listener group
#
# 2026-07-03 hardening (WQ-30 — listener/relay registration disagreement):
# - Process-GROUP kill on restart. The old script killed only the wrapper bash;
#   the in-flight `claude` (+ tee + MCP servers) survived as orphans. Repeated
#   restarts during an API stall leaked processes until `fork: Resource
#   temporarily unavailable` took down the watcher itself (exit 128, Jul 2).
# - Busy-aware healthcheck: `pendingResponses > 0` on /chat/status means claude
#   is mid-task (dispatched a message, not yet responded) — that is NOT a dead
#   listener; don't count it as a miss, and never kill it mid-task.
# - Relay-unreachable is not the listener's fault: don't count those checks
#   toward the restart threshold (restarting the listener can't fix the relay).
# - Restart backoff (5s..30s within a 5-min window) so an upstream outage
#   can't drive a restart storm.
# - Wait for the relay at startup instead of exit 1 (KeepAlive respawn churn).
# - Timestamps on every log line (the Jul 2 incident log had none).

set -euo pipefail
set -m  # job control: background jobs become process-group leaders
cd "$(dirname "$0")/.."

LISTENER_PID=""
PROMPT_HASH=""
MISSED_HEALTHCHECKS=0
MAX_MISSED_HEALTHCHECKS=24  # 24 * 5s = 120s of relay-reported absence before forced restart
RESTART_COUNT=0
LAST_RESTART_AT=0

log() { echo "[watcher $(date '+%Y-%m-%dT%H:%M:%S')] $*"; }

kill_listener_group() {
  # Kill the listener's entire process group: yeshie-listen.sh + claude + tee + MCP servers.
  [ -n "$LISTENER_PID" ] || return 0
  if kill -0 "$LISTENER_PID" 2>/dev/null; then
    kill -TERM -- "-$LISTENER_PID" 2>/dev/null || kill -TERM "$LISTENER_PID" 2>/dev/null || true
    local i
    for i in 1 2 3 4 5; do
      kill -0 "$LISTENER_PID" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$LISTENER_PID" 2>/dev/null; then
      log "Listener group $LISTENER_PID ignored TERM; escalating to KILL"
      kill -KILL -- "-$LISTENER_PID" 2>/dev/null || kill -KILL "$LISTENER_PID" 2>/dev/null || true
    fi
  fi
  wait "$LISTENER_PID" 2>/dev/null || true
  LISTENER_PID=""
}

cleanup() {
  log "Shutting down..."
  kill_listener_group
  exit 0
}

trap cleanup INT TERM

get_prompt_hash() {
  # Hash of all files that make up the system prompt: base + all site files
  cat prompts/base-listener.md prompts/sites/*.md 2>/dev/null | md5 -q 2>/dev/null || \
  cat prompts/base-listener.md prompts/sites/*.md 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1
}

reap_orphans() {
  # Failsafe: kill listener wrappers this watcher doesn't own (crash leftovers),
  # and orphaned (PPID 1) one-shot claude listeners still holding /chat/listen.
  local pid
  for pid in $(pgrep -f 'scripts/yeshie-listen\.sh' 2>/dev/null || true); do
    [ "$pid" = "${LISTENER_PID:-none}" ] && continue
    log "Reaping orphaned listener wrapper PID $pid"
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in $(ps ax -o pid=,ppid=,command= | awk '$2==1 && /--system-prompt # Yeshie/ && /claude/ {print $1}' || true); do
    log "Reaping orphaned claude listener PID $pid"
    kill -TERM "$pid" 2>/dev/null || true
  done
}

start_listener() {
  reap_orphans
  log "Starting Yeshie listener..."
  PROMPT_HASH=$(get_prompt_hash)
  MISSED_HEALTHCHECKS=0

  # Run listener in background — with set -m it leads its own process group
  ./scripts/yeshie-listen.sh &
  LISTENER_PID=$!
  log "Listener started (PID/PGID: $LISTENER_PID)"
}

restart_listener() {
  log "Restarting listener (reason: $1)..."
  kill_listener_group

  # Backoff: rapid successive restarts (within 5 min of the last) back off up to 30s
  local now gap delay
  now=$(date +%s)
  gap=$((now - LAST_RESTART_AT))
  if [ "$gap" -lt 300 ]; then
    RESTART_COUNT=$((RESTART_COUNT + 1))
  else
    RESTART_COUNT=1
  fi
  LAST_RESTART_AT=$now
  delay=$((RESTART_COUNT * 5))
  [ "$delay" -gt 30 ] && delay=30
  [ "$delay" -lt 2 ] && delay=2
  [ "$RESTART_COUNT" -gt 1 ] && log "Restart #$RESTART_COUNT in window; backing off ${delay}s"
  sleep "$delay"
  start_listener
}

# Wait for the relay instead of exiting (exit 1 + KeepAlive = respawn churn;
# at login the relay may come up after us).
until curl -sf --max-time 4 http://localhost:3333/status > /dev/null 2>&1; do
  log "Relay not reachable on :3333; waiting 10s (start it with: launchctl kickstart -k gui/$(id -u)/com.yeshie.relay)"
  sleep 10
done

log "Yeshie listener watcher starting"
log "Watching: prompts/base-listener.md + prompts/sites/*.md"

start_listener

# Poll loop: check for file changes and listener health
while true; do
  sleep 5

  # Check if any prompt file changed
  NEW_HASH=$(get_prompt_hash)
  if [ "$NEW_HASH" != "$PROMPT_HASH" ]; then
    log "Prompt files changed (hash: $PROMPT_HASH -> $NEW_HASH)"
    restart_listener "prompt file changed"
    continue
  fi

  # Check if listener is still running
  if ! kill -0 "$LISTENER_PID" 2>/dev/null; then
    log "Listener process exited unexpectedly"
    restart_listener "process exited"
    continue
  fi

  # Relay's view: healthy if a long-poll is registered OR a message is in flight
  # (pendingResponses > 0 — claude is busy processing, not dead).
  CHAT_STATUS=$(curl -sf --max-time 4 http://localhost:3333/chat/status 2>/dev/null || true)
  if [ -z "$CHAT_STATUS" ]; then
    log "Relay unreachable on healthcheck — not counting against the listener"
    continue
  fi

  if echo "$CHAT_STATUS" | grep -qE '"listenerConnected":true|"pendingResponses":[1-9]'; then
    MISSED_HEALTHCHECKS=0
  else
    MISSED_HEALTHCHECKS=$((MISSED_HEALTHCHECKS + 1))
    log "Relay reports no active listener ($MISSED_HEALTHCHECKS/$MAX_MISSED_HEALTHCHECKS)"
    if [ "$MISSED_HEALTHCHECKS" -ge "$MAX_MISSED_HEALTHCHECKS" ]; then
      restart_listener "relay reports listener offline"
      continue
    fi
  fi
done
