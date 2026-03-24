#!/bin/bash
# Hook: post-compact
# Matcher: compact
# Purpose: Re-inject MINIMAL context after conversation compaction
#
# CRITICAL: This hook must be LIGHTWEIGHT. Every line of output consumes
# context window. If this hook dumps too much, it pushes context right
# back to the compaction threshold, creating a compaction loop.
#
# Strategy: Show file PATHS and one-line summaries, NOT full file contents.
# The agent can read files if it needs details.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

echo "=== ORCHESTRA CONTEXT (post-compaction) ==="
echo ""

# 1. Session context — just the "Working on" and "Next steps" lines
if [ -f "$ORCH_ROOT/state/session-context.md" ]; then
  echo "Session: $(grep -A1 '## Working on' "$ORCH_ROOT/state/session-context.md" 2>/dev/null | tail -1)"
  NEXT=$(grep -A1 '## Next steps' "$ORCH_ROOT/state/session-context.md" 2>/dev/null | tail -1)
  [ -n "$NEXT" ] && echo "Next: $NEXT"
  echo "  → Read $ORCH_ROOT/state/session-context.md for full context"
fi

# 2. Active thread — just the thread name
ACTIVE_THREAD="$(get_active_thread "$ORCH_ROOT")"
if [ -n "$ACTIVE_THREAD" ]; then
  echo "Thread: $ACTIVE_THREAD"
  # Show progress percentage, not full YAML
  if [ -f "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" ]; then
    TOTAL=$(grep -c '^ *- name:' "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" 2>/dev/null || echo 0)
    DONE=$(grep -c 'status: done' "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" 2>/dev/null || echo 0)
    echo "Progress: $DONE/$TOTAL items done"
    echo "  → Read $ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml for details"
  fi
fi

echo ""
echo "=== RULES ==="
echo "- Do NOT run /o heartbeat (cron is still running)"
echo "- Do NOT create new cron jobs"
echo "- Read .orchestra/ files only when you need specific details"
echo "- Record decisions, update docs, log to daily file as you work"
echo ""

exit 0
