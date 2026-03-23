#!/bin/bash
# Hook: post-compact
# Matcher: compact
# Purpose: Re-inject critical context after conversation compaction
#
# Injection order (deliberate — matches agent cognitive flow):
#   1. Session context — what you were doing RIGHT NOW (most critical after compaction)
#   2. Memory          — what I know about this project
#   3. Activity        — what happened recently
#   4. Thread          — what I'm working on
#   5. Progress        — where that work stands
#   6. Backlog         — background reference

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"
YESTERDAY="$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d 2>/dev/null)"

echo "=== ORCHESTRA CONTEXT RESTORED AFTER COMPACTION ==="
echo ""

# 1. Session context (most critical — this is what the agent was doing)
if [ -f "$ORCH_ROOT/state/session-context.md" ]; then
  echo "=== SESSION CONTEXT (what you were working on) ==="
  cat "$ORCH_ROOT/state/session-context.md" 2>/dev/null
  echo ""
fi

# 2. Project memory
if [ -f "$ORCH_ROOT/MEMORY.md" ]; then
  echo "=== PROJECT MEMORY ==="
  cat "$ORCH_ROOT/MEMORY.md" 2>/dev/null
  echo ""
fi

# 3. Recent activity
if [ -f "$ORCH_ROOT/memory/$TODAY.md" ] || [ -f "$ORCH_ROOT/memory/$YESTERDAY.md" ]; then
  echo "=== RECENT ACTIVITY ==="
  cat "$ORCH_ROOT/memory/$TODAY.md" 2>/dev/null
  cat "$ORCH_ROOT/memory/$YESTERDAY.md" 2>/dev/null
  echo ""
fi

# 4. Active thread
if [ -f "$ORCH_ROOT/state/active-thread.md" ]; then
  echo "=== ACTIVE THREAD ==="
  cat "$ORCH_ROOT/state/active-thread.md" 2>/dev/null
  echo ""
fi

# 5. Progress — active thread only (per-thread progress.yaml)
ACTIVE_THREAD="$(get_active_thread "$ORCH_ROOT")"
if [ -n "$ACTIVE_THREAD" ] && [ -f "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" ]; then
  echo "=== PROGRESS ($ACTIVE_THREAD) ==="
  cat "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" 2>/dev/null
  echo ""
elif [ -f "$ORCH_ROOT/state/progress.yaml" ]; then
  echo "=== PROGRESS (legacy — run /o to migrate) ==="
  cat "$ORCH_ROOT/state/progress.yaml" 2>/dev/null
  echo ""
fi

# 6. Backlog — background reference, injected last
if [ -f "$ORCH_ROOT/BACKLOG.md" ]; then
  BACKLOG_ITEMS="$(grep -c '^- ' "$ORCH_ROOT/BACKLOG.md" 2>/dev/null || echo 0)"
  if [ "$BACKLOG_ITEMS" -gt 0 ]; then
    echo "=== BACKLOG ($BACKLOG_ITEMS items) ==="
    cat "$ORCH_ROOT/BACKLOG.md" 2>/dev/null
    echo ""
  fi
fi

exit 0
