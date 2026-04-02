#!/bin/bash
# Hook: session-start
# Matcher: startup|resume
# Purpose: Auto-inject Orchestra context into every new session
#
# Session-start can afford more context than post-compact because it runs
# once at the start, not in a loop. But we still keep output under ~50 lines
# to avoid context bloat. Use summaries + file paths instead of full dumps.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ORCH_ROOT="$(find_orchestra_root)" || exit 0

# Current repo name for filtering
CURRENT_REPO="$(basename "$(pwd)")"

# Generate session ID and set up session file
SESSION_ID="$(generate_session_id)"
mkdir -p "$ORCH_ROOT/state/sessions"
cleanup_stale_sessions "$ORCH_ROOT"

# Detect concurrent sessions
OTHER_SESSIONS=""
while IFS= read -r sid; do
  [ -z "$sid" ] && continue
  [ "$sid" = "$SESSION_ID" ] && continue
  OTHER_SESSIONS="${OTHER_SESSIONS}  - ${sid}\n"
done <<< "$(list_active_sessions "$ORCH_ROOT")"

if [ -n "$OTHER_SESSIONS" ]; then
  echo "=== CONCURRENT SESSIONS ==="
  echo "Other active sessions detected:"
  printf "$OTHER_SESSIONS"
  echo "Your session: $SESSION_ID"
  echo "Each session has its own context file in state/sessions/"
  echo ""
fi

# Create session-scoped context file with expanded format
cat > "$ORCH_ROOT/state/sessions/${SESSION_ID}.md" << SESSEOF
# Session $SESSION_ID
Started: $(date '+%Y-%m-%d %H:%M:%S')
PID: $$
Repo: $CURRENT_REPO

## Working on
(filled by checkpoint)

## Progress updates
(filled by checkpoint)

## Decisions made
(filled by checkpoint)

## Research findings
(filled by checkpoint)

## Gotchas
(filled by checkpoint)

## Next steps
(filled by checkpoint)
SESSEOF

# ─── Telemetry: session start ─────────────────────────────────
_TEL_DIR="$ORCH_ROOT/.logs"
mkdir -p "$_TEL_DIR" 2>/dev/null || true
_SESSION_COUNT=$(ls "$ORCH_ROOT/state/sessions/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"session_start\",\"sessions\":$_SESSION_COUNT}" >> "$_TEL_DIR/telemetry.jsonl" 2>/dev/null || true

TODAY="$(date +%Y-%m-%d)"
YESTERDAY="$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d 2>/dev/null)"

# 1. Active thread (most important for orientation)
ACTIVE_THREAD="$(get_active_thread "$ORCH_ROOT")"
if [ -n "$ACTIVE_THREAD" ]; then
  echo "=== ACTIVE THREAD ==="
  echo "$ACTIVE_THREAD"
  echo ""
fi

# 2. Aggregate context from ALL active session files
#    Each session's state is summarized in 2-3 lines
SESSIONS_DIR="$ORCH_ROOT/state/sessions"
SESSION_COUNT=0
SESSION_CONTEXT=""

if [ -d "$SESSIONS_DIR" ]; then
  for sf in "$SESSIONS_DIR"/*.md; do
    [ -f "$sf" ] || continue
    sf_id="$(basename "$sf" .md)"
    [ "$sf_id" = "$SESSION_ID" ] && continue  # skip our own (just created, empty)

    # Extract key sections: Working on, Progress updates, Decisions, Gotchas
    working_on=""
    progress=""
    decisions=""
    gotchas=""
    current_section=""

    while IFS= read -r line; do
      case "$line" in
        "## Working on") current_section="working" ;;
        "## Progress updates") current_section="progress" ;;
        "## Decisions made") current_section="decisions" ;;
        "## Gotchas") current_section="gotchas" ;;
        "## Research findings"|"## Next steps"|"# Session"*) current_section="" ;;
        *)
          # Skip placeholder text and blank lines
          [ "$line" = "(filled by checkpoint)" ] && continue
          [ -z "$line" ] && continue
          case "$current_section" in
            working) working_on="$line" ;;
            progress) [ -z "$progress" ] && progress="$line" ;;
            decisions) [ -z "$decisions" ] && decisions="$line" ;;
            gotchas) [ -z "$gotchas" ] && gotchas="$line" ;;
          esac
          ;;
      esac
    done < "$sf"

    # Only include sessions that have actual content (not just placeholders)
    if [ -n "$working_on" ] || [ -n "$progress" ]; then
      SESSION_COUNT=$((SESSION_COUNT + 1))
      SESSION_CONTEXT="${SESSION_CONTEXT}  [$sf_id] "
      [ -n "$working_on" ] && SESSION_CONTEXT="${SESSION_CONTEXT}${working_on}. "
      [ -n "$progress" ] && SESSION_CONTEXT="${SESSION_CONTEXT}Progress: ${progress}. "
      [ -n "$decisions" ] && SESSION_CONTEXT="${SESSION_CONTEXT}Decided: ${decisions}. "
      [ -n "$gotchas" ] && SESSION_CONTEXT="${SESSION_CONTEXT}Gotcha: ${gotchas}."
      SESSION_CONTEXT="${SESSION_CONTEXT}\n"
    fi
  done
fi

if [ -n "$SESSION_CONTEXT" ]; then
  echo "=== SESSION CONTEXT (from $SESSION_COUNT active session(s)) ==="
  printf "$SESSION_CONTEXT"
  echo ""
fi

# 3. Progress — summary only, not full YAML
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
  echo "  -> Full details: $ORCH_ROOT/threads/$ACTIVE_THREAD/progress.yaml"
  echo ""
fi

# 4. Project memory — filtered by current repo
if [ -f "$ORCH_ROOT/MEMORY.md" ]; then
  # Include lines that are tagged with current repo, are untagged (no [repo: ...] prefix),
  # or are headers/blank lines (structural)
  FILTERED_MEMORY="$(awk -v repo="$CURRENT_REPO" '
    /^#/ { print; next }
    /^\s*$/ { print; next }
    /\[repo:/ {
      # Tagged line: only include if it matches current repo
      if (index($0, "[repo: " repo "]") > 0) print
      next
    }
    # Untagged line: always include (global entry)
    { print }
  ' "$ORCH_ROOT/MEMORY.md" 2>/dev/null)"

  # Only print if there's actual content (not just headers)
  if echo "$FILTERED_MEMORY" | grep -qv '^#\|^$'; then
    echo "=== PROJECT MEMORY ==="
    echo "$FILTERED_MEMORY"
    echo ""
  fi
fi

# 5. Recent activity — filtered by current repo/session
if [ -f "$ORCH_ROOT/memory/$TODAY.md" ]; then
  echo "=== TODAY'S ACTIVITY ==="
  # Show entries for current repo or current session, plus headers
  awk -v repo="$CURRENT_REPO" -v sid="$SESSION_ID" '
    /^#/ { print; next }
    /^\s*$/ { next }
    # Include if it mentions the current repo basename or is from any session in this repo
    index($0, repo) > 0 || index($0, sid) > 0 || !/\[session:/ { print }
  ' "$ORCH_ROOT/memory/$TODAY.md" 2>/dev/null
  echo ""
elif [ -f "$ORCH_ROOT/memory/$YESTERDAY.md" ]; then
  echo "=== YESTERDAY'S ACTIVITY ==="
  # Just first 15 lines for yesterday, filtered similarly
  awk -v repo="$CURRENT_REPO" '
    NR > 15 { exit }
    /^#/ { print; next }
    /^\s*$/ { next }
    index($0, repo) > 0 || (!/\[repo:/ && !/\[session:/) { print }
  ' "$ORCH_ROOT/memory/$YESTERDAY.md" 2>/dev/null
  echo ""
fi

# 6. Behavioral reminders — short, always present
echo "=== ORCHESTRA RULES (always active) ==="
echo "- Your session ID: $SESSION_ID (context file: state/sessions/${SESSION_ID}.md)"
echo "- BEFORE coding: save your research/plan to .orchestra/ thread files first. No code before the plan is written."
echo "- AFTER researching: write findings to your session file. Research that isn't saved dies at compaction."
echo "- When you make or accept a decision (tool, architecture, infra, approach): record it in .orchestra/decisions/ immediately"
echo "- When you discover a gotcha or workaround: add it to your session file's Gotchas section immediately"
echo "- When you change behavior that's documented (API, commands, config, deploy): update the docs NOW, not later"
echo "- When the user says 'merged/shipped/deployed' or all items are done: prompt to /o close the thread"
echo ""

exit 0
