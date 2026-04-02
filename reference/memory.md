# Memory — Two-tier knowledge system

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
