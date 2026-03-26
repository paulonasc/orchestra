#!/bin/bash
# Hook: pre-compact
# Matcher: (empty — fires on all PreCompact events)
# Purpose: Echo session context into the compaction input so the LLM
#          summarizer preserves it in the compressed conversation.
#
# NOTE: PreCompact has no decision control — the agent cannot act on this
# output before compaction proceeds. We print context here so the summarizer
# sees it and includes it in the compressed output. The real protection is
# the PostCompact hook which re-injects from disk.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

# --- Safety net: breadcrumb + session snapshot before compaction ---

# Find current session file by PID match
SESSION_FILE=""
SESSION_ID=""
if [ -d "$ORCH_ROOT/state/sessions" ]; then
  for f in "$ORCH_ROOT/state/sessions"/*-$$.md "$ORCH_ROOT/state/sessions"/*-$PPID.md; do
    if [ -f "$f" ]; then
      SESSION_FILE="$f"
      SESSION_ID="$(basename "$f" .md)"
      break
    fi
  done
fi
SESSION_ID="${SESSION_ID:-unknown}"

# 1. Append breadcrumb to daily log so compaction leaves a trace
TODAY="$(date +%Y-%m-%d)"
ensure_daily_log "$ORCH_ROOT" "$TODAY"
echo "  · [auto] Context compacted at $(date +%H:%M) (session: $SESSION_ID)" >> "$ORCH_ROOT/memory/$TODAY.md" 2>/dev/null || true

# 2. Stamp the session file so post-compact knows when last compaction happened
if [ -n "$SESSION_FILE" ] && [ -f "$SESSION_FILE" ]; then
  echo "" >> "$SESSION_FILE"
  echo "## Compacted at $(date +%H:%M)" >> "$SESSION_FILE"
fi

# --- End safety net ---

# Echo session context so the compaction summarizer preserves it
if [ -f "$ORCH_ROOT/state/session-context.md" ]; then
  echo "=== ORCHESTRA SESSION CONTEXT (preserve in summary) ==="
  cat "$ORCH_ROOT/state/session-context.md" 2>/dev/null
fi

exit 0
