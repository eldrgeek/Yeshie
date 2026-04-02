#!/usr/bin/env bash
# Watches prompts/listener.md and restarts the Yeshie listener when it changes.
# Also auto-restarts if the listener crashes.
# Usage: ./scripts/yeshie-listener-watch.sh
#
# This script:
# 1. Starts yeshie-listen.sh as a child process
# 2. Watches prompts/listener.md for changes (via fswatch or polling)
# 3. When the file changes, kills the listener and restarts it
# 4. If the listener exits unexpectedly, restarts after a short delay

set -euo pipefail
cd "$(dirname "$0")/.."

LISTENER_PID=""
PROMPT_FILE="prompts/listener.md"
PROMPT_HASH=""

cleanup() {
  echo "[watcher] Shutting down..."
  if [ -n "$LISTENER_PID" ] && kill -0 "$LISTENER_PID" 2>/dev/null; then
    kill "$LISTENER_PID" 2>/dev/null || true
    wait "$LISTENER_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup INT TERM

get_hash() {
  md5 -q "$1" 2>/dev/null || md5sum "$1" 2>/dev/null | cut -d' ' -f1
}

start_listener() {
  echo "[watcher] Starting Yeshie listener..."
  PROMPT_HASH=$(get_hash "$PROMPT_FILE")

  # Run listener in background
  ./scripts/yeshie-listen.sh &
  LISTENER_PID=$!
  echo "[watcher] Listener started (PID: $LISTENER_PID)"
}

restart_listener() {
  echo "[watcher] Restarting listener (reason: $1)..."
  if [ -n "$LISTENER_PID" ] && kill -0 "$LISTENER_PID" 2>/dev/null; then
    kill "$LISTENER_PID" 2>/dev/null || true
    wait "$LISTENER_PID" 2>/dev/null || true
  fi
  sleep 2
  start_listener
}

# Verify relay is running
if ! curl -sf http://localhost:3333/status > /dev/null 2>&1; then
  echo "[watcher] Error: Yeshie relay is not running on port 3333"
  echo "Start it with: launchctl kickstart -k gui/$(id -u)/com.yeshie.relay"
  exit 1
fi

echo "[watcher] Yeshie listener watcher starting"
echo "[watcher] Watching: $PROMPT_FILE"
echo "[watcher] Press Ctrl+C to stop"
echo ""

start_listener

# Poll loop: check for file changes and listener health
while true; do
  sleep 5

  # Check if prompt file changed
  NEW_HASH=$(get_hash "$PROMPT_FILE")
  if [ "$NEW_HASH" != "$PROMPT_HASH" ]; then
    echo "[watcher] $PROMPT_FILE changed (hash: $PROMPT_HASH -> $NEW_HASH)"
    restart_listener "prompt file changed"
    continue
  fi

  # Check if listener is still running
  if ! kill -0 "$LISTENER_PID" 2>/dev/null; then
    echo "[watcher] Listener process exited unexpectedly"
    restart_listener "process exited"
    continue
  fi
done
