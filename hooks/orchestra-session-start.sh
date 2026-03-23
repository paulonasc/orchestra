#!/bin/bash
# Hook: session-start
# Matcher: startup|resume
# Purpose: Auto-inject Orchestra context into every new session
#
# Injection order (deliberate — matches agent cognitive flow):
#   1. Memory     — what I know about this project
#   2. Activity   — what happened recently
#   3. Thread     — what I'm working on right now
#   4. Progress   — where that work stands
#   5. Backlog    — background reference (not active context)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"
YESTERDAY="$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d 2>/dev/null)"

# 1. Project memory
if [ -f "$ORCH_ROOT/MEMORY.md" ]; then
  echo "=== ORCHESTRA PROJECT MEMORY ==="
  cat "$ORCH_ROOT/MEMORY.md" 2>/dev/null
  echo ""
fi

# 2. Recent activity
HAVE_ACTIVITY=false
if [ -f "$ORCH_ROOT/memory/$TODAY.md" ] || [ -f "$ORCH_ROOT/memory/$YESTERDAY.md" ]; then
  HAVE_ACTIVITY=true
fi

if $HAVE_ACTIVITY; then
  echo "=== RECENT ACTIVITY ==="
  cat "$ORCH_ROOT/memory/$TODAY.md" 2>/dev/null
  cat "$ORCH_ROOT/memory/$YESTERDAY.md" 2>/dev/null
  echo ""
fi

# 3. Active thread
if [ -f "$ORCH_ROOT/state/active-thread.md" ]; then
  echo "=== ACTIVE THREAD ==="
  cat "$ORCH_ROOT/state/active-thread.md" 2>/dev/null
  echo ""
fi

# 4. Progress — active thread only (per-thread progress.yaml)
ACTIVE_THREAD="$(get_active_thread "$ORCH_ROOT")"
if [ -n "$ACTIVE_THREAD" ] && [ -f "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" ]; then
  echo "=== PROGRESS ($ACTIVE_THREAD) ==="
  cat "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" 2>/dev/null
  echo ""
elif [ -f "$ORCH_ROOT/state/progress.yaml" ]; then
  # Legacy fallback — single progress.yaml (pre-migration)
  echo "=== PROGRESS (legacy — run /o to migrate) ==="
  cat "$ORCH_ROOT/state/progress.yaml" 2>/dev/null
  echo ""
fi

# 5. Backlog — background reference, injected last
if [ -f "$ORCH_ROOT/BACKLOG.md" ]; then
  BACKLOG_ITEMS="$(grep -c '^- ' "$ORCH_ROOT/BACKLOG.md" 2>/dev/null || echo 0)"
  if [ "$BACKLOG_ITEMS" -gt 0 ]; then
    echo "=== BACKLOG ($BACKLOG_ITEMS items) ==="
    cat "$ORCH_ROOT/BACKLOG.md" 2>/dev/null
    echo ""
  fi
fi

# 6. Behavioral reminders — short, always present, keeps agents honest
echo "=== ORCHESTRA RULES (always active) ==="
echo "- When you make or accept a decision (tool, architecture, infra, approach): record it in .orchestra/decisions/ immediately"
echo "- When you discover a gotcha or workaround: add it to .orchestra/MEMORY.md immediately"
echo "- When you change behavior that's documented (API, commands, config, deploy): update the docs NOW, not later"
echo "- When the user says 'merged/shipped/deployed' or all items are done: prompt to /o close the thread"
echo ""

exit 0
