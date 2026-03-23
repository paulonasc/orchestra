#!/bin/bash
# Hook: pre-compact
# Matcher: (empty — fires on all PreCompact events)
# Purpose: Remind agent to flush undocumented context to disk

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

TODAY="$(date +%Y-%m-%d)"

cat <<EOF
IMPORTANT: Context is about to be compacted. Before proceeding:
1. Write any undocumented decisions to .orchestra/decisions/
2. Update .orchestra/MEMORY.md with any new durable facts
3. Append a summary to .orchestra/memory/$TODAY.md
EOF

exit 0
