# /o checkpoint — Save everything to disk

**A task is NOT DONE until checkpoint is saved. This is non-negotiable.** Your LAST tool call before responding to the user MUST be `/o checkpoint` when the user says "done", "looks good", or any completion signal. If you skip checkpoint, all work from this session is PERMANENTLY LOST — the user will have to re-explain everything next session.

Force-flush all in-flight context to Orchestra files. Use before stepping away, before a long operation, or whenever you want a compaction-proof snapshot.

**Prefer delegating to a subagent** (via the Agent tool) to keep the main context lean. But if the Agent tool is not available, write the files inline directly — the checkpoint must always complete. Do not skip writes because you cannot delegate.

**Before writing, answer each category:**

- **Code:** What files did you create or edit?
- **Decisions:** What architectural, tool, or approach decisions did you make (and why)?
- **Research:** What did you investigate, compare, or evaluate?
- **Gotchas:** What surprised you or broke unexpectedly?
- **Tests:** What tests did you run? What passed? What failed? Include counts and specific failures.
- **Progress:** Which milestone items are now done, in-progress, or blocked?
- **Next:** What should happen next?

Write down your answers — they become the subagent prompt (or your own writing guide if doing it inline). Be thorough — this is what survives compaction.

**Files to write (all paths relative to `.orchestra/`), in priority order:**

Write these two FIRST — they are the minimum viable checkpoint. If you are low on turns, write only these two and skip the rest:

1. **`state/sessions/{session-id}.md`** (CRITICAL) — session state snapshot. Fill in every section: Working on, Progress updates, Decisions made, Research findings, Gotchas, Next steps. This is the single most important file — without it, the session is lost on compaction.
2. **`memory/YYYY-MM-DD.md`** (CRITICAL) — append-only daily log. Prefix each entry with `[session: {session-id}]` so concurrent sessions don't interleave ambiguously.

Then write these if turns/context allow:

3. **`threads/NNN-slug/progress.yaml`** — update item statuses to reflect reality. Mark completed items as `done`, new work as `in-progress`.
4. **`threads/NNN-slug/verification.md`** — record any test results from this session. Update PENDING items to PASS/FAIL with details.
5. **`threads/NNN-slug/conversation.md`** — append design decisions or important discussion from this session.
6. **`decisions/NNN-slug.md`** — new decision files for any decisions made this session. Use unique filenames (next available number + descriptive slug) so concurrent agents never collide.
7. **`MEMORY.md`** — durable learnings (gotchas, patterns, preferences). Append new entries; never overwrite existing ones.

After writing (or after the subagent returns), reset the edit counter and confirm to the user:
```bash
echo 0 > .orchestra/.logs/edit-count-{session-id}
```
```
Checkpoint saved:
  ✓ session file, daily log, thread files updated
  ✓ {N} decision(s) recorded (if any)
```

**This is the "save game" button.** Everything needed to resume from scratch is now on disk. If compaction happens or the session ends, nothing is lost. Other concurrent sessions will pick up your changes at their next session-start.

## Memory tiers

Checkpoint writes to multiple memory tiers. Here is how they work:

### MEMORY.md — curated long-term memory

- Lives at `.orchestra/MEMORY.md`
- Keep under 200 lines
- Write durable facts: architecture decisions, patterns, gotchas, conventions, user preferences

**YOU MUST update MEMORY.md during every session where you learn something new about the project.** This includes:
- Tech stack choices (language, framework, database, ORM, etc.)
- Architecture patterns adopted (error format, auth approach, test strategy)
- User preferences discovered (editor, region, naming conventions)
- Gotchas encountered (things that broke, things that surprised you)

Do not wait until the end of the session. Write to MEMORY.md as you go. If you finish a session and MEMORY.md is still empty, you did it wrong.

### memory/YYYY-MM-DD.md — daily append-only log

- Append timestamped entries when you complete meaningful work
- Format: `## HH:MM — Agent (worktree) — what you did`
- When appending to `conversation.md` or daily logs, prefix the block with `[session: {session-id}]` — this makes interleaved entries from concurrent sessions distinguishable
- NEVER edit daily logs from previous days. Append-only.
- Hooks auto-capture session boundaries. You write the substance.

Memory is auto-injected via the SessionStart hook. You do not need to read it manually — it is already in your context at session start.

## Decisions recording

**YOU MUST record decisions as they happen.** When the user commits to a choice — or when you recommend a change and the user accepts — create a decision file immediately. Do not wait until the end of the session. If the session involved choices and `decisions/` is still empty, you did it wrong.

**These are all decisions — record them:**
- Choosing a framework, library, or tool ("let's use X")
- Infrastructure choices (ARM vs x86, region, instance type, managed vs self-hosted)
- Architecture choices (monolith vs microservice, REST vs GraphQL, polling vs websocket)
- Data model changes (new table, schema migration, JSONB vs normalized)
- Deployment strategy (Docker build flags, CI/CD approach, environment setup)
- "Let's not do X" — rejected approaches are decisions too

1. Look at existing files in `decisions/` to find the next sequential number
2. Create `decisions/NNN-slug.md` — read `templates/decision.md` for the format

Decisions are append-only. Never edit or delete existing decision files.

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
