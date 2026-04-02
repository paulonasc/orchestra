# /o docs — Audit and update documentation

Scans all documentation in the repo (and linked repos) against recent changes. Finds what's stale and offers to fix it.

**IMPORTANT: Delegate to a subagent.** Doc audits read every doc file + git log + cross-reference — extremely context-heavy. Spawn an Agent with the task, let it do the reads/writes, get back a summary of what's stale and what it fixed. Only bring results back to the main context if the user needs to approve changes.

**Flow:**

1. **Discover docs** — find all documentation files in the repo:
   - `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `CLAUDE.md` at repo root
   - `docs/` directory if it exists
   - Any `.md` files in key directories that serve as documentation

2. **Gather recent changes** — read the git log since the last `/o docs` run (or last 7 days if first run):
   ```bash
   git log --since="7 days ago" --name-only --pretty=format:"%s"
   ```

3. **Cross-reference** — for each doc file, check if recent changes affect what it describes:
   - Does `README.md` reference files, APIs, commands, or patterns that changed?
   - Does `ARCHITECTURE.md` describe a structure that was reorganized?
   - Does `CLAUDE.md` list commands or patterns that were added/removed?
   - Are there new features with zero documentation?

4. **Report and fix** — render a summary:
   ```
   ## Doc audit

   README.md        ⚠ stale — mentions old API endpoint /v1/auth, now /v2/auth
   ARCHITECTURE.md  ✓ current
   CLAUDE.md        ⚠ stale — missing new BullMQ task "process-videos"
   docs/api.md      ⚠ stale — 3 new endpoints not documented

   Fix these now? (y/n)
   ```

   If the user says yes (or doesn't object), update the docs inline. Show the diff for each change.

**Key rules:**
- Don't rewrite docs from scratch — make targeted updates to stale sections
- Preserve the doc's existing style and voice
- If a doc references code, verify the references are still valid (file paths, function names, CLI commands)
- Track the last audit date in `state/sessions/{session-id}.md` so subsequent runs only check new changes

## Proactive update triggers

**Stop what you're doing and update docs when any of these happen:**

| Trigger | What to update |
|---------|---------------|
| You made an architecture or infrastructure decision | `decisions/NNN-slug.md` + `MEMORY.md` (gotchas, patterns) |
| You discovered a gotcha or workaround | `MEMORY.md` (Gotchas section) |
| You changed how something is deployed, built, or run | `README.md` or `CLAUDE.md` (commands, setup) |
| You added/changed an API endpoint, CLI command, or config | `README.md`, `CLAUDE.md`, or `docs/` |
| You hit an error and found the fix | `MEMORY.md` (so the next agent doesn't repeat it) |
| You changed file structure or renamed things | Any doc that references old paths |
| You completed a milestone item | Check all docs that reference what you just built |
| You're about to write a handoff | Update docs first — the receiving agent reads docs before handoffs |

**The rule is simple: if you just learned something or changed something that another agent or future-you would need to know, write it down NOW — not later, not at the end of the session, NOW.**

Examples of what "now" means:
- You switched ECS from x86 to ARM64 → immediately add to `decisions/` and `MEMORY.md` (platform choice, build gotcha)
- You found that a Docker build needs `--platform linux/amd64` → immediately add to `MEMORY.md` Gotchas
- You added a new BullMQ task → immediately update `CLAUDE.md` task list
- You changed the database schema → immediately update any docs referencing the old schema

### What to check

- **README.md** — commands, endpoints, file paths, patterns
- **CLAUDE.md** — architecture, patterns, workflows, task lists
- **ARCHITECTURE.md** / **CONTRIBUTING.md** — structure, conventions
- **Inline doc comments** — function behavior changes
- **`docs/` directory** — pages related to your changes
- **`MEMORY.md`** — gotchas, patterns, preferences
- **`decisions/`** — any choice that has alternatives

### When NOT to update

- Trivial internal refactors that don't change behavior
- Work-in-progress — wait until the milestone item is done
- Docs owned by another repo — flag it in the handoff instead

**If you finished significant work and docs are unchanged, something is wrong.** Ask yourself: "Would the next agent or user reading these docs be misled?" If yes, you missed a trigger above.
