# /o heartbeat — Periodic state audit

Lightweight check that audits whether Orchestra state is current and fixes gaps.

**How it gets triggered:** The agent runs `/o heartbeat` on the first `/o` invocation in a session (see dashboard section). Hooks do NOT trigger heartbeat — this prevents compaction loops.

**Usage:**
- `/o heartbeat` — audit now + auto-schedule recurring checks every 30 minutes
- `/o heartbeat stop` — cancel the recurring schedule

**The main agent does exactly this (in order):**

**Step 1 — Quick mental check (NO tool calls):** Did I do anything noteworthy since the last heartbeat? If no → output `Heartbeat: all current.` and **stop**. Zero tool calls. Done. This is the common case.

**Step 2 — Schedule cron (first invocation only, 3 tool calls in main context):**

Cron scheduling MUST happen in the main agent, not a subagent. Subagents can't reliably construct the exact cron prompt — they tend to simplify it to `/o heartbeat`, creating the recursive loop this system is designed to prevent.

```
# 1. List existing cron jobs
CronList()

# 2. Delete ALL existing cron jobs (prevents duplicates after compaction)
CronDelete(<each job id>)

# 3. Create new cron with INLINE prompt (NEVER "/o heartbeat")
CronCreate(
  cron: "*/30 * * * *",
  prompt: "Quick mental check: did I make commits, decisions, or progress since my last check? If yes, update .orchestra/state/sessions/{session-id}.md briefly. If no, do nothing and say nothing. Do NOT run /o heartbeat. Do NOT create cron jobs. Do NOT read files unless you need to write. Maximum 1 tool call.",
  recurring: true
)
```

**CRITICAL: The cron prompt must NEVER be `/o heartbeat` or invoke any skill.** It is a minimal inline instruction. If the cron invokes the skill, it creates a recursive scheduling bomb that consumes the entire context window.

Store in `state/sessions/{session-id}.md`: `heartbeat_scheduled: true`, `heartbeat_job_id: <id>`, `heartbeat_created_at: <ISO timestamp>`

**Step 3 — State audit (subagent, only if noteworthy work happened):**

If you did something worth recording, spawn a background subagent for the file writes:

```
Agent(
  description: "Heartbeat state update",
  prompt: "Update Orchestra state at <ORCH_ROOT>. Active thread: <THREAD>.

What happened since last heartbeat:
<bullet list: commits, decisions, progress, blockers, current state>

Update ONLY files that need changes:
- state/sessions/{session-id}.md — current working state
- memory/YYYY-MM-DD.md — append daily log entry
- threads/<thread>/progress.yaml — mark items done if applicable

Do NOT create cron jobs. Do NOT run /o heartbeat. Do NOT invoke skills.
Return a single summary line of what you updated.",
  run_in_background: true,
  mode: "bypassPermissions"
)
```

**Step 4 — Output:** One line to the user. Either `Heartbeat: all current.` or `Heartbeat: [what the subagent updated]. Scheduled every 30 min.`

**`/o heartbeat stop`** — inline: `CronList` → `CronDelete` each → remove heartbeat fields from session file. Confirm: `Heartbeat cancelled.`

**Rules:**
- The no-op case (nothing happened) = ZERO tool calls. Just one line of text.
- Cron scheduling = main agent only (3 tool calls, deterministic).
- State audit file I/O = subagent only (background, returns one line).
- Hooks NEVER trigger `/o heartbeat`. Only the first `/o` invocation and manual user runs do.
- After compaction, do NOT re-run heartbeat. The cron is still alive.

## Agent Awareness — Staying Current Mid-Session

The biggest failure mode in multi-agent work is **mid-session drift** — the agent gets deep into coding and forgets to update Orchestra state. Decisions go unrecorded, progress isn't tracked, docs go stale. The user has to manually remind the agent "use Orchestra."

Orchestra solves this with three layers, from most portable to most powerful:

### Layer 1 — Instruction file rules (all agents)

During `setup link`, Orchestra injects trigger-action rules into the repo's instruction file (CLAUDE.md, AGENTS.md, .cursor/rules). These are specific: "after you commit code, update your session file and daily log." Not "remember Orchestra" — that's too vague.

These rules are always in the agent's system prompt. They survive compaction. They work across all agents.

### Layer 2 — `/o heartbeat` with auto-schedule (Claude Code)

Run `/o heartbeat` once — it audits state AND auto-schedules a lightweight cron to recur every 30 minutes. No manual `/loop` commands needed.

The cron uses an **inline audit prompt** (NOT `/o heartbeat`) to avoid recursive scheduling and context bloat. Every 30 minutes, the agent silently checks if it made progress and updates the session file if needed — zero tool calls on the fast path.

**Deduplication is mandatory:** before creating any cron, call `CronList` + `CronDelete` on all existing jobs. Cron jobs survive compaction but the agent's memory of them doesn't — without dedup, every compaction adds another concurrent heartbeat until the context window is consumed.

The `/o` dashboard proactively suggests heartbeat when it detects stale state. One command, auto-recurring, self-managing.

### Layer 3 — Channels heartbeat (Claude Code, experimental)

Claude Code Channels (v2.1.80+, research preview) allow MCP servers to push events into a running session. An Orchestra Channel server could watch for git events and push state-update reminders automatically — a true daemon heartbeat.

**Status:** Prototype only. Channels has known bugs (notifications not delivered, GitHub issues #36827, #37440). Do not recommend to users until stable. When stable, this replaces `/loop` as the recommended approach because it's event-driven (fires on git commit) rather than time-based (fires every N minutes).
