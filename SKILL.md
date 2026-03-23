---
name: o
description: Multi-agent coordination through files. Memory, threads, briefings, handoffs.
---

## Preamble (run first)

```bash
_UPD=$(__ORCHESTRA_BIN__/orchestra-update-check 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
```

If output shows `UPGRADE_AVAILABLE <old> <new>`: tell the user "Orchestra update available: v{old} → v{new}" and ask if they want to update now. If yes, run:

```bash
cd __ORCHESTRA_DIR__ && git pull origin main && ./setup link "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

Then tell the user "Updated to v{new}" and continue. If no, continue without updating.

If no output, Orchestra is up to date — continue silently.

# Orchestra

You are an AI agent using Orchestra — a file-based coordination system. You read from and write to `.orchestra/`. Hooks handle lifecycle capture automatically (session start/stop, daily logs). You handle the intelligence: creating threads, writing memory, generating briefings, recording decisions.

## Finding the Orchestra root

Read `.orchestra.link` in the current repo root to find the `.orchestra/` directory path.

```yaml
# .orchestra.link
root: /Users/richard/Projects/pied-piper/.orchestra
```

If `.orchestra/` exists directly in the repo root, use that. If neither `.orchestra/` nor `.orchestra.link` exists, Orchestra is not set up for this repo — tell the user.

Store the resolved path. All paths below are relative to this `.orchestra/` root.

## The /o command

When the user invokes `/o`, present a dashboard:

1. Read `state/progress.yaml` — show current milestone status (% complete, blocked items)
2. Read `state/active-thread.md` — show what's currently being worked on
3. Scan `handoffs/` for any unread handoffs (files created since last session)
4. Read `state/blocked.yaml` for blocked items
5. Present a concise status summary:

```
## Orchestra Status

**Active:** 003-compress-video-pipeline
**Progress:** MVP milestone — 4/7 done, 1 blocked
**Handoffs:** 1 new (api → frontend: new endpoints ready)
**Blocked:** frontend auth — waiting on API key rotation

Next steps:
- Read handoff from API team
- Unblock auth by...
```

Suggest concrete next steps based on what you see. If nothing is active, ask what the user wants to work on.

### Post-work audit

When the user invokes `/o` after agents have finished work (handoffs exist, progress updated), also audit Orchestra state:

1. Read all `verification.md` files for active threads — flag any with FAILs or PENDINGs
2. Check if MEMORY.md was updated with new learnings
3. Check if decisions made during work were recorded in `decisions/`
4. Check if `sessions/` has a log for significant work
5. Flag anything stale or missing and offer to update it

This is how the user keeps Orchestra honest after parallel agent runs.

## Memory

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
- NEVER edit daily logs from previous days. Append-only.
- Hooks auto-capture session boundaries. You write the substance.

Memory is auto-injected via the SessionStart hook. You do not need to read it manually — it is already in your context at session start.

## Threads

Threads are units of work. They live in `threads/NNN-slug/`.

### Creating a thread

When the user describes new work ("I want to build X", "we need to fix Y"), create a thread:

1. Look at existing directories in `threads/` to find the next sequential number
2. Zero-pad to 3 digits: `001`, `002`, `003`
3. Create `threads/NNN-slug/` with:
   - `spec.md` — what to build, acceptance criteria, constraints
   - `conversation.md` — design discussion log (append-only)
   - `verification.md` — test checklist and results (created when work begins)
   - `research.md` — optional, create when research is needed
4. Update `state/active-thread.md` with the thread name

### Working on a thread

- Set `state/active-thread.md` to the current thread when starting work
- Append design decisions and conversation to `conversation.md`
- Update `spec.md` as requirements evolve

## Research

- Write findings to `threads/NNN-slug/research.md`
- Always include `last_verified: YYYY-MM-DD` at the top of research files
- If `research.md` is older than 7 days and you are about to build from it, flag it to the user and offer to re-verify before proceeding
- Subagent research is auto-logged via the SubagentStop hook

## Verification

Every thread has a `verification.md` that tracks whether the work actually works. This is the gate between "code was written" and "done."

### Flow

1. When `spec.md` defines acceptance criteria, create `verification.md` with a checklist mirroring those criteria
2. As work is built, test each item and record the result
3. A progress item can only be marked `done` when ALL checklist items PASS
4. If an item fails, record why and how it was resolved

### Format

```markdown
# Verification: NNN-thread-name

## Checklist
- [x] Item from spec — PASS
- [ ] Another item — FAIL (see below)
- [ ] Not yet tested — PENDING

## Results

### Item from spec
**Status:** PASS
**How tested:** What command was run, what was checked
**Date:** YYYY-MM-DD

### Another item
**Status:** FAIL
**How tested:** What was attempted
**Failure:** What went wrong and why
**Resolution:** How it was fixed (commit, file, change)
**Retested:** PASS (YYYY-MM-DD)
```

### Rules

- Checklist items map 1:1 to acceptance criteria in `spec.md`
- Every FAIL must include: what happened, why, and how it was resolved
- PENDING means not yet tested — work is not done
- **Do NOT mark a progress item as `done` until all verification items PASS.** If you write a handoff saying "done" but `verification.md` has FAILs or PENDINGs, you did it wrong.
- Receiving agents should read `verification.md` to know what's validated vs just claimed

## Decisions

**YOU MUST record decisions as they happen.** When the user commits to a choice — "let's use X", "we decided Y", choosing a framework, picking a region, selecting an approach over alternatives — create a decision file immediately. Do not wait until the end of the session. If the session involved choices and `decisions/` is still empty, you did it wrong.

1. Look at existing files in `decisions/` to find the next sequential number
2. Create `decisions/NNN-slug.md` with this format:

```markdown
# NNN: Decision Title

**Date:** YYYY-MM-DD
**Context:** Why this decision was needed
**Decision:** What was decided
**Reason:** Why this option was chosen over alternatives
**Affects:** What parts of the system this impacts
```

Decisions are append-only. Never edit or delete existing decision files.

## Briefings

Generate briefings when the user says "let's build it", "spawn agents", "generate briefings", or similar.

### How to generate

1. Read the active thread's `spec.md`
2. Read relevant `handoffs/`
3. Read `MEMORY.md` for project context
4. Read `state/progress.yaml` for current status
5. Write one briefing per repo (multi-repo) or one per task (monorepo)

### Where to write

`briefings/NNN-slug-repo.md` — e.g., `briefings/003-compress-video-pipeline-api.md`

### What each briefing must contain

Each briefing must be fully self-contained. The receiving agent reads only this file.

```markdown
# Task: [title]

**Thread:** NNN-slug
**Repo:** repo-name
**Priority:** high/medium/low

## Context
What this is about and why it matters. Include relevant architecture decisions.

## What to build
Specific deliverables. Be precise about files, functions, interfaces.

## Files to read first
List the exact files the agent should read before starting.

## Constraints
- Performance requirements
- Compatibility requirements
- Patterns to follow

## Tests required
What tests to write. Specific scenarios to cover.

## Verification
How to test each acceptance criterion. Specific commands, expected outputs.

## When done
- Update `verification.md` with test results — all items must PASS
- Write handoff to `handoffs/`
- Update `state/progress.yaml`
```

## Handoffs

When you complete a significant chunk of work that another agent (or future session) needs to know about, write a handoff.

### Where to write

`handoffs/YYYY-MM-DD-from-to--slug.md` — e.g., `handoffs/2026-03-22-api-to-frontend--new-endpoints.md`

### Format

```markdown
---
from: repo-or-agent-name
to: repo-or-agent-name
thread: NNN-slug
date: YYYY-MM-DD
---

## What I built
Concrete summary of changes. Files modified, APIs added, schemas changed.

## What the next agent needs to know
Breaking changes, new dependencies, updated interfaces, migration steps.

## Decisions made
Choices made during implementation and why.

## Known issues
Bugs, TODOs, shortcuts taken, things that need follow-up.
```

Handoffs are append-only records. Never overwrite or delete them. Do not skip writing a handoff if you made changes another agent needs to know about.

## Progress tracking

Update `state/progress.yaml` when items are completed or blocked.

```yaml
milestone: MVP
items:
  - name: API compression endpoint
    status: done
  - name: Frontend upload UI
    status: in_progress
  - name: Auth token rotation
    status: blocked
    blocked_by: infrastructure team
    reason: Waiting on new KMS key provisioning
  - name: Integration tests
    status: todo
```

Valid statuses: `todo`, `in_progress`, `done`, `blocked`. Blocked items must include `blocked_by` and `reason`.

## Sessions

- The Stop hook auto-captures session end times to the daily log
- Before ending a session, write a substantive work summary to `memory/YYYY-MM-DD.md`
- **YOU MUST write a session log to `sessions/YYYY-MM-DD-slug.md`** when significant work was done: feature built, major refactor, architecture change, multi-repo scaffold, milestone completed. A session log is a curated narrative — what was built, why, what decisions were made, what's next. If you scaffolded an entire milestone and `sessions/` is empty, you did it wrong.

## Rules

- Do NOT modify `.orchestra/` files that are not part of your current task
- Do NOT delete or edit daily logs from previous days
- Do NOT overwrite handoffs — they are append-only records
- Do NOT skip writing a handoff if you made changes another agent needs to know about
- Do NOT create threads, decisions, or briefings without user intent — wait for the user to describe work or request generation
