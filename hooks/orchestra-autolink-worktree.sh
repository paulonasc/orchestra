#!/bin/bash
# Hook: global SessionStart (installed in ~/.claude/settings.json)
# Purpose: Auto-link worktrees of already-linked repos.
# Performance: <1ms fast-path for already-linked repos.
# Safety: no set -e; every failure is a silent exit 0.

# Fast path: already linked — exit immediately
[ -f ".claude/skills/o/SKILL.md" ] && exit 0

# Must be in a git repo
git rev-parse --is-inside-work-tree &>/dev/null || exit 0

# Get main worktree path — exit if we ARE the main worktree
MAIN_WT="$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')"
[ -z "$MAIN_WT" ] && exit 0
[ "$MAIN_WT" = "$(pwd)" ] && exit 0

# Main worktree must have Orchestra linked
[ -f "$MAIN_WT/.orchestra.link" ] || exit 0

# Read Orchestra install dir from install: field
ORCHESTRA_DIR="$(grep '^install:' "$MAIN_WT/.orchestra.link" 2>/dev/null | sed 's/^install: *//' | sed "s|^~|$HOME|")"

# Fallback: parse _ORCH_DIR from main worktree's installed SKILL.md
if [ -z "$ORCHESTRA_DIR" ] || [ ! -f "$ORCHESTRA_DIR/setup" ]; then
  ORCHESTRA_DIR="$(grep '^_ORCH_DIR=' "$MAIN_WT/.claude/skills/o/SKILL.md" 2>/dev/null | head -1 | sed 's/^_ORCH_DIR="//' | sed 's/"$//')"
fi

# Validate install dir
[ -z "$ORCHESTRA_DIR" ] && exit 0
[ -f "$ORCHESTRA_DIR/setup" ] || exit 0

# Read state dir from root: field
ORCH_STATE="$(grep '^root:' "$MAIN_WT/.orchestra.link" 2>/dev/null | sed 's/^root: *//' | sed "s|^~|$HOME|")"
[ -z "$ORCH_STATE" ] && exit 0
[ -d "$ORCH_STATE" ] || exit 0

# Auto-link this worktree
BRANCH="$(git branch --show-current 2>/dev/null || echo 'detached')"
"$ORCHESTRA_DIR/setup" link "$(pwd)" "$ORCH_STATE" >/dev/null 2>&1

echo "Orchestra auto-linked worktree ($BRANCH)"
exit 0
