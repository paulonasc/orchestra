#!/bin/bash
# Hook: stop
# Matcher: (empty — fires on all Stop events)
# Purpose: Auto-capture session end to daily log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Read stdin (Stop hooks receive JSON)
INPUT="$(cat 2>/dev/null)"

# Prevent recursion
if echo "$INPUT" | grep -q '"stop_hook_active"' 2>/dev/null; then
  exit 0
fi

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"
TIME="$(date +%H:%M)"

ensure_daily_log "$ORCH_ROOT" "$TODAY"

# Derive worktree name from current directory
WORKTREE_NAME="$(basename "$(pwd)")"

echo "" >> "$ORCH_ROOT/memory/$TODAY.md"
echo "## $TIME — Session ended ($WORKTREE_NAME)" >> "$ORCH_ROOT/memory/$TODAY.md"

# Clean up session file for this process (match by PID suffix)
if [ -d "$ORCH_ROOT/state/sessions" ]; then
  for f in "$ORCH_ROOT/state/sessions"/*-$$.md "$ORCH_ROOT/state/sessions"/*-$PPID.md; do
    [ -f "$f" ] && rm -f "$f"
  done
fi

exit 0
