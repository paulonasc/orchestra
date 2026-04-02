# Formats — Progress, sessions, and backlog

## Progress tracking

Progress is **per-thread**, not global. Each thread has its own `threads/NNN-slug/progress.yaml`.

### Thread status

Every `progress.yaml` has a `status` field at the top level:

```yaml
status: active          # active | completed | abandoned
completed_at:           # ISO date, set when status changes to completed/abandoned
```

- `active` — work in progress, included in `/o` dashboard aggregation and session-start injection
- `completed` — shipped/merged, excluded from dashboard aggregation, still readable via `/o <thread>`
- `abandoned` — killed (scope cut, wrong approach, deprioritized), excluded from everything

**Default:** if the `status` field is missing, treat as `active`. This makes the feature backward compatible — existing threads work without migration.

### Format

YAML with milestones and items. Valid statuses: `todo`, `in_progress`, `done`, `blocked`. Blocked items must include `blocked_by` and `reason`. Each milestone has `name`, `description`. Each item has `status`, `repo`.

### Why per-thread?

- **Smaller context:** SessionStart hook injects only the active thread's progress — agents don't carry the weight of every thread
- **No conflicts:** parallel agents working on different threads can't collide on the same file
- **Clean separation:** each thread is self-contained (spec, plan, progress, verification)

### `/o` dashboard aggregation

The `/o` dashboard reads `threads/*/progress.yaml` files and aggregates them for the roadmap — **but only threads with `status: active`** (or missing status, which defaults to active). Completed and abandoned threads are excluded. This is a read-time computation, not stored anywhere. Each active thread contributes its milestones to the overall percentage.

To check status efficiently: read the first few lines of each `progress.yaml` for the `status:` field. If `completed` or `abandoned`, skip the file entirely — don't parse milestones or items.

### Legacy migration

If `state/progress.yaml` exists (from before per-thread progress), migrate it:

1. Read `state/progress.yaml`
2. Group milestones by their `thread` field
3. Write each group to `threads/NNN-slug/progress.yaml`
4. Rename `state/progress.yaml` to `state/progress.yaml.migrated` (keep as backup)
5. Tell the user: *"Migrated progress from global file to per-thread. Backup at state/progress.yaml.migrated."*

If milestones don't have a `thread` field, ask the user which thread they belong to.

## Session context (compaction survival)

Session context is now **per-session**. Each session gets its own file at `state/sessions/{session-id}.md` (format: `YYYYMMDD-HHMMSS-PID`). The session ID is provided by the session-start hook — store it and use it for all writes.

**YOU MUST keep your session file current throughout the session** — not at the end, not before compaction, but continuously as you work.

**Update your session file after every significant action:** completing a task, making a decision, discovering something important, changing direction. This takes seconds and saves everything if compaction hits.

If you see a **CONCURRENT SESSIONS** warning at session start, be aware other agents are active. Your session file is isolated — no collision.

### Format

Read `templates/session.md` for the session context format. Sections: Working on, Key context, Current state, Next steps.

- **Overwrite YOUR session file each time** — this is not a log, it's a snapshot of right now
- Keep it under 50 lines — just enough to resume without loss
- The PostCompact hook re-injects this file automatically after compaction

### What triggers an update

- You completed a subtask or milestone item
- You made or learned about a decision
- You changed approach or direction
- You discovered a gotcha or blocker
- You're about to spawn subagents or do parallel work

If compaction happens and your session file is empty or stale, you will lose context. Keep it current.

## Sessions

- The Stop hook auto-captures session end times to the daily log
- Before ending a session, write a substantive work summary to `memory/YYYY-MM-DD.md`
- **YOU MUST write a session log to `sessions/YYYY-MM-DD-slug.md`** when significant work was done: feature built, major refactor, architecture change, multi-repo scaffold, milestone completed. A session log is a curated narrative — what was built, why, what decisions were made, what's next. If you scaffolded an entire milestone and `sessions/` is empty, you did it wrong.

## Backlog

`BACKLOG.md` lives at the `.orchestra/` root. It's the project-wide list of future work, tech debt, and things to revisit. Every agent sees it at session start. Thread-local notes get buried — the backlog doesn't.

### When to add to the backlog

**Any time you or the user identifies something as "do later", "investigate", "tech debt", "future improvement", or "revisit" — add it to `BACKLOG.md` immediately.** Don't only write it in the thread's conversation.md or spec.md. Those are invisible to agents working on other threads.

### Format

Read `templates/backlog.md` for the format. Three categories: Future improvements, Tech debt, Investigate.

- **One line per item** — title, brief context, thread reference, priority
- **Keep it under 50 items.** If growing past that, items should become threads.
- **Remove items when they become threads.** Don't track in both places.
- The `/o` dashboard shows a backlog count in the footer when items exist.
