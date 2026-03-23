#!/bin/bash
# Shared utilities for Orchestra hooks

find_orchestra_root() {
  local dir
  dir="$(pwd)"

  while [ "$dir" != "/" ]; do
    if [ -f "$dir/.orchestra.link" ]; then
      grep "^root:" "$dir/.orchestra.link" 2>/dev/null | sed 's/^root: *//' | sed "s|^~|$HOME|"
      return 0
    fi
    dir="$(dirname "$dir")"
  done

  return 1
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
