#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PATH="/Users/mikewolf/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

CODEX_BIN="${CODEX_BIN:-$(command -v codex || true)}"
if [[ -z "$CODEX_BIN" || ! -x "$CODEX_BIN" ]]; then
  echo "codex CLI not found. Set CODEX_BIN or add codex to PATH." >&2
  exit 1
fi

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "This script must run inside a git repository." >&2
  exit 1
fi

RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
RUN_ROOT="${RUN_ROOT:-/tmp/yeshie-codex-review-${RUN_ID}}"
WORKTREE_DIR="${WORKTREE_DIR:-${RUN_ROOT}/worktree}"
LOG_DIR="${LOG_DIR:-${RUN_ROOT}/logs}"
PROMPT_FILE="${RUN_ROOT}/prompt.md"
LAUNCH_SCRIPT="${RUN_ROOT}/launch.sh"
REPORT_BASENAME="${REPORT_BASENAME:-CODEX-VISION-REVIEW-${RUN_ID}.md}"
REPORT_PATH_REL="reviews/${REPORT_BASENAME}"
FINAL_MESSAGE_FILE="${RUN_ROOT}/final-message.txt"
JSONL_FILE="${RUN_ROOT}/events.jsonl"
STDOUT_LOG="${LOG_DIR}/stdout.log"
PID_FILE="${RUN_ROOT}/pid"
MODE="${CODEX_EXECUTION_MODE:-danger}"
MODEL="${CODEX_MODEL:-gpt-5.4}"

mkdir -p "$WORKTREE_DIR" "$LOG_DIR"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "Review process is still running: $pid"
      echo "Logs: $STDOUT_LOG"
      echo "Worktree: $WORKTREE_DIR"
    fi
  fi
}
trap cleanup EXIT

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "HEAD" ]]; then
  CURRENT_BRANCH="detached-head"
fi

if [[ ! -d "${WORKTREE_DIR}/.git" ]]; then
  git worktree add --detach "$WORKTREE_DIR" HEAD >/dev/null
fi

if [[ -d "${REPO_ROOT}/node_modules" && ! -e "${WORKTREE_DIR}/node_modules" ]]; then
  ln -s "${REPO_ROOT}/node_modules" "${WORKTREE_DIR}/node_modules"
fi

case "$MODE" in
  danger)
    APPROVAL_FLAGS=(--dangerously-bypass-approvals-and-sandbox)
    ;;
  full-auto)
    APPROVAL_FLAGS=(--full-auto)
    ;;
  *)
    echo "Unsupported CODEX_EXECUTION_MODE: $MODE" >&2
    echo "Use CODEX_EXECUTION_MODE=danger or CODEX_EXECUTION_MODE=full-auto" >&2
    exit 1
    ;;
esac

cat > "$PROMPT_FILE" <<EOF
Perform a detailed review of this repository against the north-star in VISION.md.

Start by reading:
- AGENTS.md
- docs/silicon/overview.md
- docs/silicon/state.md
- VISION.md

Then inspect the implementation under src/, packages/, sites/, tests/, models/, and any other files needed to understand the current system.

Objectives:
1. Evaluate how far the current codebase is from the architecture and behavior described in VISION.md.
2. Identify the highest-severity bugs, architectural risks, scalability blockers, and missing capabilities that materially prevent the vision.
3. Distinguish clearly between:
   - already implemented and production-ready
   - partially implemented but fragile
   - only described in docs / not implemented
4. Call out any contradictions between docs and code that will mislead future work.
5. Propose a prioritized implementation roadmap to move from current state toward the vision.

Review requirements:
- Findings first, ordered by severity.
- Use concrete file references and explain why each issue matters.
- Focus on behavior, architecture, correctness, and feasibility, not style nitpicks.
- Run relevant local checks where useful, including npm test if it helps validate assumptions.
- Do not modify source code.
- You may create one review artifact only: ${REPORT_PATH_REL}

Required report structure:
1. Executive summary
2. Findings
3. Vision gap analysis
4. Roadmap
5. Verification notes

At the end:
- Write the full report to ${REPORT_PATH_REL}
- In your final message, print only:
  - the report path
  - whether tests were run
  - the top 3 blockers
EOF

cat > "$LAUNCH_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$WORKTREE_DIR"
exec "$CODEX_BIN" exec \
  --model "$MODEL" \
  --sandbox workspace-write \
  --cd "$WORKTREE_DIR" \
  --output-last-message "$FINAL_MESSAGE_FILE" \
  --json \
  "${APPROVAL_FLAGS[@]}" \
  - < "$PROMPT_FILE"
EOF

chmod +x "$LAUNCH_SCRIPT"

nohup "$LAUNCH_SCRIPT" > "$JSONL_FILE" 2> "$STDOUT_LOG" &
PID="$!"
echo "$PID" > "$PID_FILE"

cat <<EOF
Started Codex vision review.

PID: $PID
Mode: $MODE
Model: $MODEL
Source branch: $CURRENT_BRANCH
Worktree: $WORKTREE_DIR
Report target: ${WORKTREE_DIR}/${REPORT_PATH_REL}
Final message: $FINAL_MESSAGE_FILE
Event log: $JSONL_FILE
Stderr log: $STDOUT_LOG

Useful commands:
  tail -f "$STDOUT_LOG"
  tail -f "$JSONL_FILE"
  cat "$FINAL_MESSAGE_FILE"
  pkill -P "$PID" || true; kill "$PID"
EOF
