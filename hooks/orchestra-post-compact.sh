#!/bin/bash
# Hook: post-compact
# Matcher: compact
# Purpose: Re-inject critical context after conversation compaction

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"
YESTERDAY="$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d 2>/dev/null)"

echo "=== ORCHESTRA CONTEXT RESTORED AFTER COMPACTION ==="
echo ""

# Session context (most critical — this is what the agent was doing)
if [ -f "$ORCH_ROOT/state/session-context.md" ]; then
  echo "=== SESSION CONTEXT (what you were working on) ==="
  cat "$ORCH_ROOT/state/session-context.md" 2>/dev/null
  echo ""
fi

# Project memory
if [ -f "$ORCH_ROOT/MEMORY.md" ]; then
  echo "=== PROJECT MEMORY ==="
  cat "$ORCH_ROOT/MEMORY.md" 2>/dev/null
  echo ""
fi

# Recent activity
if [ -f "$ORCH_ROOT/memory/$TODAY.md" ] || [ -f "$ORCH_ROOT/memory/$YESTERDAY.md" ]; then
  echo "=== RECENT ACTIVITY ==="
  cat "$ORCH_ROOT/memory/$TODAY.md" 2>/dev/null
  cat "$ORCH_ROOT/memory/$YESTERDAY.md" 2>/dev/null
  echo ""
fi

# Active thread
if [ -f "$ORCH_ROOT/state/active-thread.md" ]; then
  echo "=== ACTIVE THREAD ==="
  cat "$ORCH_ROOT/state/active-thread.md" 2>/dev/null
  echo ""
fi

# Progress — active thread only (per-thread progress.yaml)
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

exit 0
