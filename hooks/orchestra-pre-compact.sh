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

# Echo session context so the compaction summarizer preserves it
if [ -f "$ORCH_ROOT/state/session-context.md" ]; then
  echo "=== ORCHESTRA SESSION CONTEXT (preserve in summary) ==="
  cat "$ORCH_ROOT/state/session-context.md" 2>/dev/null
fi

exit 0
