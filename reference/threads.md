# Threads — Units of work

Threads are units of work. They live in `threads/NNN-slug/`. Each thread follows a lifecycle: **chat → research → plan → execute & iterate**.

### Thread lifecycle

1. **Chat** — user describes the problem. Agent creates the thread with `spec.md` and `conversation.md`.
2. **Research** — agent investigates approaches, writes `research.md`. Optional — skip for well-understood work.
3. **Plan** — agent writes `plan.md` with milestones, phases, dependencies. When the plan is committed, milestones populate the thread's `progress.yaml` with ALL milestones upfront.
4. **Execute & iterate** — agent builds, verifies (`verification.md`), writes handoffs. Plan evolves as work progresses.
5. **Close** — when all work is shipped and verified, `/o close` marks the thread `completed`. It drops out of the dashboard and session injection. Still accessible via `/o <thread>` or `/o list`.

### Creating a thread

When the user describes new work ("I want to build X", "we need to fix Y"), create a thread:

1. Look at existing directories in `threads/` to find the next sequential number
2. Zero-pad to 3 digits: `001`, `002`, `003`
3. Create `threads/NNN-slug/` with:
   - `spec.md` — what to build, acceptance criteria, alternatives considered, risks
   - `conversation.md` — design discussion log (append-only)
   - `verification.md` — test checklist and results (created when work begins)
   - `research.md` — optional, create when research is needed
   - `plan.md` — created after research, before execution (see below)
4. Update `state/active-thread.md` with the thread name

### Writing a plan

After research is done (or immediately for well-understood work), create `threads/NNN-slug/plan.md`:

1. Define the objective — one sentence on what this thread delivers
2. Break work into milestones (M0, M1, M2...) with items under each
3. List dependencies, open questions, out-of-scope items
4. **When the plan is committed, populate `threads/NNN-slug/progress.yaml` with ALL milestones** — not just the first one. The user needs to see the full roadmap from day one.

The plan is a living document. Update it as work progresses — add/remove items, reorder milestones, close open questions. But never delete history — use strikethrough for removed items so the evolution is visible.

### Working on a thread

- Set `state/active-thread.md` to the current thread when starting work
- Append design decisions and conversation to `conversation.md`
- Update `spec.md` as requirements evolve
- Update `plan.md` as milestones complete or the approach changes

### Capturing user-reported progress

**When the user tells you they did something — ran a command, completed a step, tested something, got a result — you MUST update Orchestra state immediately.** Do not just respond to what they said and move on. The user is giving you signal that progress happened outside your session.

Update these files:

1. **`verification.md`** — record the result with `**Tested by:** user (manual)`, the command they ran, and the output they shared
2. **`threads/NNN-slug/progress.yaml`** — if their action completes or unblocks a milestone item, update its status
3. **`state/sessions/{session-id}.md`** — reflect the new current state
4. **`memory/YYYY-MM-DD.md`** — log what the user did with a timestamp

Examples of user-reported progress:
- "I ran terraform plan and got 41 to add" → record in verification.md, update progress item
- "I set up the Route53 hosted zone" → mark that prerequisite as done
- "I tested the login flow and it works" → record PASS in verification.md
- "I ran the migration and it failed with X" → record FAIL with details
- "I completed steps 1-5 from the checklist" → update all 5 items

**If the user shares an error or failure, record it AND help them resolve it.** Don't just help — also capture the state so the next agent or session knows what happened.

## Research

- Write findings to `threads/NNN-slug/research.md`
- Always include `last_verified: YYYY-MM-DD` at the top of research files
- If `research.md` is older than 7 days and you are about to build from it, flag it to the user and offer to re-verify before proceeding
- Subagent research is auto-logged via the SubagentStop hook
