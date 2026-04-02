---
name: o
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
description: |
  Multi-agent coordination through files. Memory, threads, progress, handoffs.
  Use when asked to "save progress", "checkpoint", "what's the status",
  "hand off", "what are we working on", or "close the thread".
  MANDATORY: When the user signals completion ("done", "that's working",
  "looks good", "all set", "that's all", "nice work", "ship it"), you MUST
  invoke /o checkpoint BEFORE responding. Not after. BEFORE. This is your
  LAST tool call before any text response. If you skip this, session state
  is permanently lost. Do not just acknowledge the user — save state first.
  MANDATORY: When the user says "merged", "shipped", or "deployed", invoke /o close.
  When the user says "document this", "write a plan", "plan this out", or "record
  this decision": write to .orchestra/threads/<active-thread>/plan.md for plans,
  .orchestra/decisions/NNN-slug.md for decisions, .orchestra/threads/<active-thread>/
  research.md for research. Run /o to find the active thread if unsure.
  BEFORE answering, when the user mentions test results ("tests passed", "all green",
  "0 failures", "build clean", "lint clean") or you run tests: FIRST update
  .orchestra/threads/<active-thread>/verification.md with PASS/FAIL results,
  THEN respond to the user. Do not skip the update even if the user asked a question.
---

## Preamble (run first)

```bash
# Auto-sync: if source SKILL.md is newer than installed copy, re-install
_ORCH_DIR="__ORCHESTRA_DIR__"
_SRC="$_ORCH_DIR/SKILL.md"
_DST=".claude/skills/o/SKILL.md"
if [ -f "$_SRC" ] && [ -f "$_DST" ] && [ "$_SRC" -nt "$_DST" ]; then
  sed -e "s|__ORCHESTRA_BIN__|${_ORCH_DIR}/bin|g" -e "s|__ORCHESTRA_DIR__|${_ORCH_DIR}|g" "$_SRC" > "$_DST"
  echo "SKILL_SYNCED"
fi
# Check for remote updates
_UPD=$(__ORCHESTRA_BIN__/orchestra-update-check 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
```

If output shows `SKILL_SYNCED`: tell the user "Orchestra skill updated — using latest version." **Then re-read `.claude/skills/o/SKILL.md` and follow the updated instructions for the rest of this invocation.**

If output shows `UPGRADE_AVAILABLE <old> <new>`: Use AskUserQuestion:

> Orchestra update available: v{old} → v{new}.
>
> RECOMMENDATION: Choose A to stay current.
>
> A) Update now
> B) Always auto-update
> C) Not now
> D) Never ask again

If A: run `/o update`. If B: run `__ORCHESTRA_BIN__/orchestra-config set auto_upgrade true`, then `/o update`. If C: run `__ORCHESTRA_BIN__/orchestra-update-check --snooze`. If D: run `__ORCHESTRA_BIN__/orchestra-config set update_check false`.

If output shows `JUST_UPGRADED <old> <new>`: tell the user "Running Orchestra v{new} (just updated!)" and continue.

If no output, everything is current — continue silently.

### First-run onboarding (one-time, marker-file gated)

Check these markers in order. Each step only runs once. All AskUserQuestion calls must follow the format: re-ground (project + branch), simplify (plain English), recommend, lettered options.

**Step 1 — Welcome** (if `~/.orchestra-state/.welcome-seen` does not exist):

Tell the user: "Welcome to Orchestra — the memory layer for AI agents. Key commands: `/o` (dashboard), `/o checkpoint` (save progress), `/o close` (mark done). Orchestra remembers what happened across sessions so you don't have to re-explain."

Then run: `touch ~/.orchestra-state/.welcome-seen`

**Step 2 — Proactive behavior** (if `~/.orchestra-state/.proactive-prompted` does not exist AND Step 1 marker exists):

Use AskUserQuestion:

> Orchestra can proactively suggest checkpoints when you say "done" or "looks good", and suggest closing threads when you say "shipped" or "merged."
>
> RECOMMENDATION: Choose A — it prevents lost work with zero effort.
>
> A) Keep it on (recommended)
> B) Turn it off — I'll manage state manually

If A: run `__ORCHESTRA_BIN__/orchestra-config set proactive true`
If B: run `__ORCHESTRA_BIN__/orchestra-config set proactive false`
Always run: `touch ~/.orchestra-state/.proactive-prompted`

**Step 3 — Heartbeat** (if `~/.orchestra-state/.heartbeat-prompted` does not exist AND Step 2 marker exists):

Use AskUserQuestion:

> Orchestra can auto-schedule state checks every 30 minutes to catch drift.
>
> RECOMMENDATION: Choose A — catches forgotten state updates automatically.
>
> A) Yes, auto-schedule (recommended)
> B) No, I'll run `/o heartbeat` manually when needed

If A: run `__ORCHESTRA_BIN__/orchestra-config set heartbeat_auto true`
If B: run `__ORCHESTRA_BIN__/orchestra-config set heartbeat_auto false`
Always run: `touch ~/.orchestra-state/.heartbeat-prompted`

**Step 4 — Telemetry** (if `~/.orchestra-state/.telemetry-prompted` does not exist AND Step 3 marker exists):

Use AskUserQuestion:

> Help Orchestra get better! Community mode shares anonymous usage data (which commands you use, how often) with a stable device ID so we can track trends and fix bugs.
> No code, file paths, or repo names are ever sent. Change anytime with `orchestra-config set telemetry off`.
>
> RECOMMENDATION: Choose A — helps us improve Orchestra for everyone.
>
> A) Community — usage data + device ID (recommended)
> B) Anonymous — counters only, no device ID
> C) No thanks — fully off

If A: run `__ORCHESTRA_BIN__/orchestra-config set telemetry community`
If B: run `__ORCHESTRA_BIN__/orchestra-config set telemetry anonymous`
If C: run `__ORCHESTRA_BIN__/orchestra-config set telemetry off`
Always run: `touch ~/.orchestra-state/.telemetry-prompted`

After onboarding completes (or if all markers exist), continue to the requested `/o` subcommand.

# Orchestra

You are an AI agent using Orchestra — a file-based coordination system. You read from and write to `.orchestra/`. Hooks handle lifecycle capture automatically (session start/stop, daily logs). You handle the intelligence: creating threads, writing memory, generating briefings, recording decisions.

## Context budget — delegate heavy writes to subagents

Orchestra state updates (checkpoint, docs audit, daily logs, MEMORY.md, progress.yaml, conversation.md, verification.md) are expensive: they read multiple files, write multiple files, and generate verbose output — all of which consumes the main context window. Over a session, this overhead compounds and accelerates compaction.

**Rule: When an Orchestra operation needs to read/write 3+ files, prefer delegating to a background subagent via the Agent tool.** If the Agent tool is not available, write the files inline directly — never skip writes because delegation is unavailable.

When delegation is available, the subagent gets a focused prompt, does all the file I/O in its own context, and returns a one-line summary. The main context only sees the summary — not the file contents, not the diffs, not the intermediate reads.

**Pattern:**

```
Agent(
  description: "Orchestra checkpoint",
  prompt: "You are updating Orchestra state files. The .orchestra/ root is at <ORCH_ROOT>.

Context from the main agent (what happened this session):
- <bullet list of what was done, decisions made, current state, blockers>

Update ALL of these files:
1. state/sessions/{session-id}.md — <what to write>
2. threads/<thread>/progress.yaml — <which items changed status>
3. threads/<thread>/conversation.md — <append what was discussed/decided>
4. threads/<thread>/verification.md — <append test results if any>
5. memory/YYYY-MM-DD.md — <append daily log entries>
6. MEMORY.md — <add durable learnings if any>

After writing, output a single summary line listing what you updated.",
  run_in_background: true,
  mode: "bypassPermissions"
)
```

**What to pass to the subagent:** The main agent must include all relevant context in the prompt — what was done, what decisions were made, what the current state is. The subagent has no conversation memory. Give it everything it needs to write accurate files without guessing.

**Where results are logged:** The subagent writes directly to `.orchestra/` files. Those files ARE the log. When the subagent returns, its one-line summary appears in the main context. If the main agent needs to verify, it can read the files later — but usually the summary is enough.

**When to use this:**
- `/o checkpoint` — always (it writes 6+ files)
- `/o docs` — always (it reads all docs + git log + writes updates)
- Heartbeat audit when it has work to do (writes 2+ files) — but NOT on the no-op fast path
- Post-work audit — always
- Any time you need to update daily log + session file + progress together

**When NOT to use this:**
- Single-file writes (recording one decision, one MEMORY.md entry) — just do it inline
- The heartbeat no-op fast path (zero tool calls, one-line output)
- When the user is actively watching and expects interactive feedback on what was written

## Finding the Orchestra root

Resolve the `.orchestra/` path using this fallback chain:

1. **`.orchestra/`** exists in the current repo root → use it directly
2. **`.orchestra.link`** exists in the current repo root → read the `root:` path
3. **Worktree fallback** — if neither exists, check if you're in a git worktree:
   ```bash
   _MAIN_WT=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')
   ```
   If `_MAIN_WT` differs from the current directory, check `$_MAIN_WT/.orchestra.link`. This means worktrees get full Orchestra context with zero setup.
4. If all three fail, Orchestra is not set up for this repo — tell the user.

```yaml
# .orchestra.link
root: /Users/richard/Projects/pied-piper/.orchestra
```

Store the resolved path. All paths below are relative to this `.orchestra/` root.

## The /o command

`/o` is the executive dashboard. It answers: "Where are we? What's at risk? What needs my attention?" — in 5 seconds.

### Subcommands

| Command | Like | What it does |
|---------|------|-------------|
| `/o` | — | Executive dashboard (default) |
| `/o list` | `ls` | List all threads with status and progress |
| `/o active` | `pwd` | Show what the agent thinks we're working on right now |
| `/o <thread>` | `cd` + `ls` | Deep dive into a specific thread/workstream |
| `/o plan` | `cat plan` | Show the plan for the active thread |
| `/o import` | `cp` | Import external docs (plans, research, specs) into a thread |
| `/o docs` | `lint` | Audit repo docs against recent changes, fix what's stale |
| `/o checkpoint` | `save` | Flush all context to disk — compaction-proof snapshot |
| `/o close` | `git merge` | Mark active thread as completed (shipped) |
| `/o reopen` | `revert` | Reopen a completed or abandoned thread |
| `/o heartbeat` | `cron` | Audit state + auto-schedule every 30 min. `/o heartbeat stop` to cancel. |
| `/o update` | `apt upgrade` | Pull latest Orchestra and sync all repos |
| `/o stats` | `top` | Show local usage analytics (sessions, checkpoints, nudge effectiveness) |
| `/o release` | `npm version` | Bump version, generate changelog, commit + tag (maintainer only) |


## Subcommand routing

Parse the user's `/o` invocation and read ONLY the relevant command file. The command files are in the same directory as this SKILL.md (`.claude/skills/o/commands/`).

**Read ONE command file, then follow its instructions. Do not read multiple command files.**

| Subcommand | File to read | When |
|------------|-------------|------|
| `/o` (no args) | `commands/dashboard.md` | User asks for status, dashboard, overview |
| `/o checkpoint` | `commands/checkpoint.md` | User says "done", "looks good", "checkpoint", or completion signal |
| `/o close` or `/o reopen` | `commands/close.md` | User says "shipped", "merged", "deployed" or asks to close/reopen |
| `/o import` | `commands/import.md` | User wants to import external docs into a thread |
| `/o docs` | `commands/docs.md` | User asks to audit or update documentation |
| `/o heartbeat` | `commands/heartbeat.md` | First `/o` invocation per session, or manual heartbeat request |
| `/o list`, `/o active`, `/o plan`, `/o <thread>` | `commands/list.md` | User asks to see threads, active work, or plans |
| `/o update`, `/o stats`, `/o release` | `commands/update.md` | User asks to update Orchestra, view stats, or release |

After reading the command file, follow its instructions completely. The command file is self-contained.

For reference material (memory tiers, thread lifecycle, verification workflow, format specs), command files will tell you when to read from `reference/`.

## General rules

- Do NOT modify `.orchestra/` files that are not part of your current task
- Do NOT delete or edit daily logs from previous days
- Do NOT overwrite handoffs — they are append-only records
- Do NOT skip writing a handoff if you made changes another agent needs to know about
- Do NOT create threads, decisions, or briefings without user intent — wait for the user to describe work or request generation
