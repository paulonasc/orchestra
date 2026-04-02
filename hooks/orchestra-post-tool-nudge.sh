#!/bin/bash
# Hook: post-tool-nudge
# Matcher: Edit|Write
# Purpose: Count code edits per session, nudge agent to checkpoint at threshold

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

# Get session ID from environment or generate one
SESSION_ID="$(get_session_id)"

# Counter file per session
COUNTER_FILE="$ORCH_ROOT/.logs/edit-count-${SESSION_ID}"
mkdir -p "$ORCH_ROOT/.logs"

COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

THRESHOLD=10
if [ "$COUNT" -ge "$THRESHOLD" ]; then
  echo "Orchestra: $COUNT edits since last checkpoint. Run /o checkpoint to save progress."
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"nudge_fired\",\"edit_count\":$COUNT}" >> "$ORCH_ROOT/.logs/telemetry.jsonl" 2>/dev/null || true
fi

exit 0
