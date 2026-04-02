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

# ─── Telemetry: session end ──────────────────────────────────
if [ -n "$ORCH_ROOT" ]; then
  _FINAL_EDITS=$(cat "$ORCH_ROOT/.logs/edit-count-$(get_session_id)" 2>/dev/null || echo "0")
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"hook_stop\",\"edit_count\":$_FINAL_EDITS}" >> "$ORCH_ROOT/.logs/telemetry.jsonl" 2>/dev/null || true
fi

# ─── Trigger background telemetry sync ──────────────────────────
_TEL_TIER=$("$SCRIPT_DIR/../bin/orchestra-config" get telemetry 2>/dev/null || echo "off")
if [ "$_TEL_TIER" != "off" ] && [ -n "$_TEL_TIER" ]; then
  "$SCRIPT_DIR/../bin/orchestra-telemetry-sync" 2>/dev/null &
fi

# Clean up session file for this process (match by PID suffix)
if [ -d "$ORCH_ROOT/state/sessions" ]; then
  for f in "$ORCH_ROOT/state/sessions"/*-$$.md "$ORCH_ROOT/state/sessions"/*-$PPID.md; do
    [ -f "$f" ] && rm -f "$f"
  done
fi

exit 0
