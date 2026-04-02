#!/bin/bash
# Hook: subagent-stop
# Matcher: (empty — fires on all SubagentStop events)
# Purpose: Log subagent completion to daily log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Read stdin (receives JSON with agent_type)
INPUT="$(cat 2>/dev/null)"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"

ensure_daily_log "$ORCH_ROOT" "$TODAY"

# Extract agent_type from JSON input
AGENT_TYPE="$(echo "$INPUT" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//;s/"//')"
AGENT_TYPE="${AGENT_TYPE:-unknown}"

# Read active thread name
THREAD_NAME=""
if [ -f "$ORCH_ROOT/state/active-thread.md" ]; then
  # Use first heading or first non-empty line as thread name
  THREAD_NAME="$(grep -m1 '^#' "$ORCH_ROOT/state/active-thread.md" 2>/dev/null | sed 's/^#* *//')"
fi
THREAD_NAME="${THREAD_NAME:-no active thread}"

echo "  · Subagent ($AGENT_TYPE) completed for thread: $THREAD_NAME" >> "$ORCH_ROOT/memory/$TODAY.md"

echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"hook_subagent_stop\"}" >> "$ORCH_ROOT/.logs/telemetry.jsonl" 2>/dev/null || true

exit 0
