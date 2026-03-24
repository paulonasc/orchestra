#!/bin/bash
# Hook: session-start
# Matcher: startup|resume
# Purpose: Auto-inject Orchestra context into every new session
#
# Session-start can afford more context than post-compact because it runs
# once at the start, not in a loop. But we still avoid dumping full files
# like progress.yaml (300+ lines) — use summaries + file paths instead.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"
YESTERDAY="$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d 2>/dev/null)"

# 1. Active thread + session context (most important for orientation)
ACTIVE_THREAD="$(get_active_thread "$ORCH_ROOT")"
if [ -n "$ACTIVE_THREAD" ]; then
  echo "=== ACTIVE THREAD ==="
  echo "$ACTIVE_THREAD"
  echo ""
fi

if [ -f "$ORCH_ROOT/state/session-context.md" ]; then
  echo "=== SESSION CONTEXT ==="
  cat "$ORCH_ROOT/state/session-context.md" 2>/dev/null
  echo ""
fi

# 2. Progress — summary only, not full YAML
if [ -n "$ACTIVE_THREAD" ] && [ -f "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" ]; then
  echo "=== PROGRESS ($ACTIVE_THREAD) ==="
  # Show milestone summaries: count done/total per milestone
  awk '
    /^  - name:/ { milestone = substr($0, index($0, "name:") + 6) }
    /^    items:/ { total = 0; done = 0 }
    /^      - name:/ { total++ }
    /status: done/ { done++ }
    /^  - name:/ && milestone != "" { if (total > 0) printf "  %s: %d/%d done\n", prev_milestone, prev_done, prev_total }
    { prev_milestone = milestone; prev_done = done; prev_total = total }
    END { if (total > 0) printf "  %s: %d/%d done\n", milestone, done, total }
  ' "$ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml" 2>/dev/null
  echo "  → Full details: $ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml"
  echo ""
fi

# 3. Project memory
if [ -f "$ORCH_ROOT/MEMORY.md" ]; then
  echo "=== PROJECT MEMORY ==="
  cat "$ORCH_ROOT/MEMORY.md" 2>/dev/null
  echo ""
fi

# 4. Recent activity — today only (yesterday is less critical)
if [ -f "$ORCH_ROOT/memory/$TODAY.md" ]; then
  echo "=== TODAY'S ACTIVITY ==="
  cat "$ORCH_ROOT/memory/$TODAY.md" 2>/dev/null
  echo ""
elif [ -f "$ORCH_ROOT/memory/$YESTERDAY.md" ]; then
  echo "=== YESTERDAY'S ACTIVITY ==="
  # Just first 20 lines for yesterday
  head -20 "$ORCH_ROOT/memory/$YESTERDAY.md" 2>/dev/null
  echo ""
fi

# 5. Behavioral reminders — short, always present
echo "=== ORCHESTRA RULES (always active) ==="
echo "- When you make or accept a decision (tool, architecture, infra, approach): record it in .orchestra/decisions/ immediately"
echo "- When you discover a gotcha or workaround: add it to .orchestra/MEMORY.md immediately"
echo "- When you change behavior that's documented (API, commands, config, deploy): update the docs NOW, not later"
echo "- When the user says 'merged/shipped/deployed' or all items are done: prompt to /o close the thread"
echo ""

exit 0
