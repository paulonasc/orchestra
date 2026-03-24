#!/bin/bash
# Shared utilities for Orchestra hooks

find_orchestra_root() {
  local dir
  dir="$(pwd)"

  # Check current repo and parents for .orchestra.link
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/.orchestra.link" ]; then
      grep "^root:" "$dir/.orchestra.link" 2>/dev/null | sed 's/^root: *//' | sed "s|^~|$HOME|"
      return 0
    fi
    dir="$(dirname "$dir")"
  done

  # Worktree fallback — check main worktree
  local main_wt
  main_wt="$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')"
  if [ -n "$main_wt" ] && [ "$main_wt" != "$(pwd)" ] && [ -f "$main_wt/.orchestra.link" ]; then
    grep "^root:" "$main_wt/.orchestra.link" 2>/dev/null | sed 's/^root: *//' | sed "s|^~|$HOME|"
    return 0
  fi

  return 1
}

# Get the active thread name (reads state/active-thread.md)
get_active_thread() {
  local orch_root="$1"
  if [ -f "$orch_root/state/active-thread.md" ]; then
    head -1 "$orch_root/state/active-thread.md" 2>/dev/null | tr -d '[:space:]'
  fi
}

# Generate a unique session ID: YYYYMMDD-HHMMSS-PID
generate_session_id() {
  echo "$(date +%Y%m%d-%H%M%S)-$$"
}

# List active session IDs from state/sessions/
list_active_sessions() {
  local orch_root="$1"
  local sessions_dir="$orch_root/state/sessions"
  if [ -d "$sessions_dir" ]; then
    for f in "$sessions_dir"/*.md; do
      [ -f "$f" ] || continue
      basename "$f" .md
    done
  fi
}

# Remove session files older than 24 hours
cleanup_stale_sessions() {
  local orch_root="$1"
  local sessions_dir="$orch_root/state/sessions"
  [ -d "$sessions_dir" ] || return 0
  find "$sessions_dir" -name "*.md" -mmin +1440 -delete 2>/dev/null || true
}

ensure_daily_log() {
  local orch_root="$1"
  local today="$2"
  local log_file="$orch_root/memory/$today.md"

  mkdir -p "$orch_root/memory"
  if [ ! -f "$log_file" ]; then
    echo "# $today" > "$log_file"
  fi
}
