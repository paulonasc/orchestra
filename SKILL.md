---
name: o
description: Multi-agent coordination through files. Memory, threads, briefings, handoffs.
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

If output shows `UPGRADE_AVAILABLE <old> <new>`: tell the user "Orchestra update available: v{old} → v{new}. Run `/o update` to upgrade." Then continue normally.

If no output, everything is current — continue silently.

# Orchestra

You are an AI agent using Orchestra — a file-based coordination system. You read from and write to `.orchestra/`. Hooks handle lifecycle capture automatically (session start/stop, daily logs). You handle the intelligence: creating threads, writing memory, generating briefings, recording decisions.

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
| `/o update` | `apt upgrade` | Pull latest Orchestra and sync all repos |

### `/o` — Executive dashboard

Read all Orchestra state files and render a **top-down** dashboard. Start high-level, then drill down. The user should understand the project in 5 seconds from the top section alone.

**Section 1 — Roadmap (where are we?)**

Read ALL `threads/*/progress.yaml` files and aggregate. Show every milestone across every thread. The user needs to see the full journey: where they are, what's ahead, and overall project completion.

```
## Roadmap  (overall: 49% — 26/53 items done)

M0  Scaffolding & CI/CD   ████████░░  87%  (26/30)  ← you are here
M1  Identity & Auth        ░░░░░░░░░░   0%  (0/8)
M2  Core Features          ░░░░░░░░░░   0%  (0/10)
M3  Integrations           ░░░░░░░░░░   0%  (0/3)
M4  Launch & Hardening     ░░░░░░░░░░   0%  (0/2)
```

**The overall percentage is critical.** Sum all items across all milestones: `done / total`. Show it in the header so the user instantly knows "we're 49% through the whole project."

If a thread's `progress.yaml` only has the current milestone defined, **flag this to the user**: "Only M0 is defined for this thread. Want me to add the remaining milestones from the plan so you can see the full roadmap?"

If milestones don't have descriptions, derive them from the thread's `plan.md` or `spec.md`.

**Section 2 — Needs your attention**

Surface only things that require the human's input or approval:

```
## Needs your attention

⚠ 2 verification items PENDING — need AWS credentials (infra terraform validate/plan)
⚠ Decision needed — CI/CD provider (GitHub Actions vs CircleCI) not yet decided
📬 3 new handoffs since last session
```

Categories: blocked items needing human action, pending verification needing manual testing or credentials, undecided decisions, unread handoffs.

**Section 3 — Recently completed**

What shipped since the user last checked. Pull from today's daily log and recent handoffs:

```
## Recently completed

- API scaffold: NestJS + Kysely + health endpoint (api)
- Frontend scaffold: Next.js + Tailwind + shadcn (frontend)
- Infra: Terraform modules for ECS, RDS, ElastiCache (infra)
```

**Section 4 — Risks**

Read `## Risks` from active thread specs. Surface any identified risks:

```
## Risks

- Terraform state drift if multiple agents run apply concurrently (infra)
- No staging environment yet — can't integration test across repos
```

If no risks section exists in any active thread, skip this section silently.

**Section 5 — Recent decisions**

Show the last 3-5 decisions from `decisions/` with their reasoning:

```
## Recent decisions

001 us-west-2 — Chose us-west-2 for all AWS services. Reason: lowest latency to west coast users, broadest service availability.
```

**Footer — self-documenting navigation + contextual hint**

The nav bar must be self-documenting — every command has a brief description so the user never has to look up docs. Then show ONE contextual hint.

Render as:

```
───
/o list (all threads)  ·  /o <thread> (deep dive)  ·  /o plan (view plan)
/o import (bring in docs)  ·  /o docs (audit docs)  ·  /o checkpoint (save)
or just ask about any milestone
💡 <contextual hint>
```

**Contextual hint** — pick ONE based on current state:

| Condition | Hint |
|-----------|------|
| Active thread has no `plan.md` | `💡 No plan yet — say "create a plan" or /o import to bring one in` |
| Active thread has a `plan.md` | `💡 /o plan to review the plan, or ask "what's left in M0?"` |
| No threads exist yet | `💡 Describe what you want to build and I'll create a thread` |
| External files mentioned in conversation | `💡 /o import — bring that doc into a thread` |
| Recent handoffs unread | `💡 New handoffs — /o <thread> to see what other agents delivered` |
| Multiple threads, none active | `💡 /o active — pick a thread to focus on` |
| Milestone items recently completed | `💡 /o docs — check if repo docs need updating after recent work` |
| Default (nothing else matches) | `💡 Ask about any milestone ("what's left in M0?") or /o import to bring in external docs` |

**Rules:**
- Only show ONE hint — never a list. The user should read it in 1 second.
- Rotate hints across invocations. Don't show the same hint twice in a row within a session. Track the last hint shown in `state/session-context.md`.
- Keep hints under 80 characters.
- The `or just ask about any milestone` line in the nav is critical — it tells users they can use natural language.

### `/o list` — List all threads

Scan `threads/` and render a summary table:

```
## Threads

001  honestclaw-mvp      M0 87% | M1 0%    3 repos    active
002  payment-integration  planning           1 repo     paused
003  mobile-app           research            2 repos    blocked
```

Show: thread number, name, milestone progress, repos affected, current status (active/paused/blocked/done).

### `/o active` — What are we working on?

Read `state/active-thread.md` and `state/session-context.md`. Show:

```
## Active

Thread: 001-honestclaw-mvp
Milestone: M0 — Scaffolding & CI/CD (87%)
Current focus: Building GitHub Actions CI/CD pipelines for API and frontend
Next steps: M0.27 API CI/CD, M0.28 Frontend CI/CD
```

If `session-context.md` exists and is recent, include the key context and current state from it.

### `/o <thread-name>` — Thread deep dive

Read the thread's `spec.md`, `plan.md`, `verification.md`, `conversation.md`, and related `handoffs/`. Render:

1. **Spec summary** — problem, approach, acceptance criteria
2. **Plan** — current phase, milestone progress, open questions (from `plan.md`)
3. **Risks** — from `## Risks` in spec
4. **Alternatives considered** — from `## Alternatives` in spec (what was rejected and why)
5. **Verification status** — automated and manual test results
6. **Progress** — milestone items for this thread with status
7. **Handoffs** — recent handoffs related to this thread
8. **Decisions** — decisions tagged with this thread

### `/o plan` — Show thread plan

Read the plan for the active thread (or specify a thread: `/o plan 001-slug`).

1. Read `state/active-thread.md` to find the current thread (unless thread specified)
2. Read `threads/NNN-slug/plan.md`
3. Render: objective, current phase, items with status, open questions, dependencies

If the thread has no `plan.md`, tell the user: "No plan committed for this thread yet. Want me to create one from the spec and research?"

### `/o import` — Import external context into a thread

Users often create plans, research docs, or specs outside Orchestra (in other tools, other repos, standalone files). This command brings that context into Orchestra's thread structure.

**Flow — interactive, guided by the agent:**

**Step 1 — What are you importing?**

Ask: *"What do you want to import? Give me a file path, paste the content, or point me to it."*

Read the content. If it's a file path, read the file. If pasted, use the pasted content. Identify the content type automatically:
- **Plan** — has milestones, phases, or a structured breakdown of work → `plan.md`
- **Research** — findings, comparisons, evaluations, investigation notes → `research.md`
- **Spec** — requirements, acceptance criteria, problem statement → `spec.md`
- **General context** — anything else (notes, meeting summaries, braindumps) → `conversation.md` (appended)

Tell the user what you detected: *"This looks like a plan with 4 milestones. Importing as plan.md."*

If ambiguous, ask: *"This could be a spec or a plan. Which fits better?"*

**Step 2 — Where does it go?**

Ask: *"Import into an existing thread or create a new one?"*

If **existing thread**:
1. List threads (same as `/o list` but compact — number, name, status)
2. User picks one by number or name
3. Check if the target file already exists (e.g., `plan.md` already in the thread)
   - If yes: *"This thread already has a plan.md. Replace it, or append to conversation.md instead?"*
   - If no: proceed

If **new thread**:
1. Ask: *"What's this thread about? One line."*
2. Create the thread directory with the next sequential number
3. If the import is a spec → write as `spec.md`, auto-generate a stub `conversation.md`
4. If the import is a plan → write as `plan.md`, also ask *"Want me to generate a spec from this plan?"*
5. If research → write as `research.md`
6. Update `state/active-thread.md`

**Step 3 — Normalize and enrich**

Don't just copy-paste. Adapt the content to Orchestra's format:
- If importing a plan: ensure milestones follow `M0, M1, M2...` convention. Extract items. **Populate the thread's `progress.yaml` with ALL milestones.**
- If importing a spec: ensure it has `## Acceptance Criteria`, `## Risks`, `## Alternatives considered` sections. If missing, ask the user or flag: *"Your spec doesn't have a Risks section. Want me to add one?"*
- If importing research: add `last_verified: YYYY-MM-DD` header.
- Always: strip artifacts from external tools (Notion metadata, Google Docs formatting, etc.)

**Step 4 — Verification check**

After importing, **always** check the verification state:

1. Does the thread have a `verification.md`? If not, create one.
2. Are any items marked `done` in the thread's `progress.yaml`? If so, check if they have corresponding PASS entries in `verification.md`. **Items without verified tests are not truly done.**
3. Scan the repo for existing tests: `npm test --listTests 2>/dev/null`, `find . -name "*test*" -o -name "*spec*"`, or equivalent. Report what exists.
4. If tests exist but haven't been run against the imported work, flag it:

   > "24 items marked done but nothing verified yet. Found 12 test files in the repo. Want me to run them and create a verification plan for what's not covered?"

5. If no tests exist, propose a strategy:

   > "No tests found. Here's a verification plan based on the acceptance criteria: [list]. Want me to create verification.md with this?"

**Never mark items as `done` in the thread's progress.yaml if verification hasn't passed.** If importing a plan where work was done outside Orchestra, mark items as `in_progress` (code written but unverified) rather than `done`. Only mark `done` after verification passes.

**Step 5 — Confirm**

Show a summary:
```
Imported plan.md → threads/003-payment-integration/
  4 milestones extracted (M0–M3, 23 items total)
  threads/003-payment-integration/progress.yaml updated with all milestones
  ⚠ 18 items marked in_progress (code exists, verification pending)
  verification.md created with 23 checklist items
  Active thread set to 003-payment-integration

  Next: run /o checkpoint after verifying, or ask "run the tests"
```

**Key DX principles:**
- Never make the user copy-paste into specific files manually
- Never ask more than one question at a time
- Default to the smart choice, confirm only when ambiguous
- If the user says "import my plan from /path/to/file into the auth thread" — skip the interactive flow entirely, just do it
- **Never assume work is verified just because a plan says it's done** — always check

### `/o docs` — Audit and update documentation

Scans all documentation in the repo (and linked repos) against recent changes. Finds what's stale and offers to fix it.

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
- Track the last audit date in `state/session-context.md` so subsequent runs only check new changes

### `/o checkpoint` — Save everything to disk

Force-flush all in-flight context to Orchestra files. Use before stepping away, before a long operation, or whenever you want a compaction-proof snapshot.

**Write ALL of these:**

1. **`state/session-context.md`** — full snapshot of current state: what you're working on, key context, decisions made, current progress, next steps
2. **`threads/NNN-slug/progress.yaml`** — ensure all item statuses reflect reality right now
3. **`verification.md`** — record any test results from this session not yet captured
4. **`conversation.md`** — append any design decisions or important discussion from this session
5. **`memory/YYYY-MM-DD.md`** — log what was accomplished so far today
6. **`MEMORY.md`** — if you learned anything durable this session (patterns, gotchas, preferences), write it now

After writing, confirm:
```
Checkpoint saved:
  ✓ session-context.md — working on M0.11, terraform plan passed, Route53 blocker
  ✓ progress.yaml — M0.8 done, M0.11 blocked (thread 001)
  ✓ verification.md — 2 new results recorded
  ✓ daily log — 3 entries added
  ✓ MEMORY.md — added AWS region preference
```

**This is the "save game" button.** Everything needed to resume from scratch is now on disk. If compaction happens or the session ends, nothing is lost.

### `/o update` — Upgrade Orchestra

First, read `.orchestra.link` to get the `.orchestra/` root path. Then run:

```bash
_ORCH_ROOT=$(grep "^root:" .orchestra.link 2>/dev/null | sed 's/^root: *//')
cd __ORCHESTRA_DIR__ && git pull origin main && ./setup sync "$_ORCH_ROOT"
```

This passes the project's `.orchestra/` path to sync so it can find the linked-repos manifest. Reports version change.

### Post-work audit

When `/o` detects that agents have finished work (new handoffs exist, progress was updated since last session), also audit Orchestra state:

1. Read all `verification.md` files for active threads — flag any with FAILs or PENDINGs
2. Check if MEMORY.md was updated with new learnings
3. Check if decisions made during work were recorded in `decisions/`
4. Check if `sessions/` has a log for significant work
5. Check if repo docs (README, CLAUDE.md, etc.) may be stale given recent changes — flag with a suggestion to run `/o docs`
6. Flag anything stale or missing and offer to update it

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

Threads are units of work. They live in `threads/NNN-slug/`. Each thread follows a lifecycle: **chat → research → plan → execute & iterate**.

### Thread lifecycle

1. **Chat** — user describes the problem. Agent creates the thread with `spec.md` and `conversation.md`.
2. **Research** — agent investigates approaches, writes `research.md`. Optional — skip for well-understood work.
3. **Plan** — agent writes `plan.md` with milestones, phases, dependencies. When the plan is committed, milestones populate the thread's `progress.yaml` with ALL milestones upfront.
4. **Execute & iterate** — agent builds, verifies (`verification.md`), writes handoffs. Plan evolves as work progresses.

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
3. **`state/session-context.md`** — reflect the new current state
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

## Verification

Every thread has a `verification.md` that tracks whether the work actually works. This is the gate between "code was written" and "done."

### Test discovery (proactive)

**When starting work on a thread — or when a thread's status changes to mostly complete — proactively check the testing landscape:**

1. **Scan for existing tests** — look for test files in the repo (`__tests__/`, `*.test.*`, `*.spec.*`, `test/`, `cypress/`, etc.)
2. **Check test infrastructure** — does the repo have test commands configured? (`npm test`, `pytest`, `go test`, test scripts in package.json)
3. **Assess coverage** — do existing tests cover the areas affected by this thread's work?

Based on what you find, tell the user:

- **Tests exist and cover the work:** *"Found 15 test files, 3 cover the areas we changed. Running them now."*
- **Tests exist but don't cover new work:** *"Found 12 test files but none cover [new feature]. Want me to write tests for it, or create a manual verification plan?"*
- **No tests exist:** *"No test infrastructure found. Here's a verification strategy: [automated checks we can do] + [manual checks for the user]. Want me to create verification.md with this?"*

**Do not wait for the user to ask about testing.** If you just imported a plan, finished building, or marked items done — check tests proactively.

### Flow

1. When `spec.md` defines acceptance criteria, create `verification.md` with a checklist mirroring those criteria
2. **Phase 1 — Automated:** Run everything you can test yourself (see below)
3. **Phase 2 — Human-assisted:** Ask the user if they want to do manual testing for what you can't verify alone
4. A progress item can only be marked `done` when ALL checklist items PASS
5. If an item fails, record why and how it was resolved

### Phase 1: Automated verification

**YOU MUST run automated tests before marking anything as done.** After building, immediately:

1. **Run existing test suites** — unit tests, integration tests, whatever the repo has (`npm test`, `pytest`, `go test`, etc.). Record pass/fail counts.
2. **Run type checking and linting** — `npm run typecheck`, `npm run lint`, or equivalent. These catch entire categories of bugs.
3. **Run the code** — if you built an API endpoint, call it. If you built a CLI command, execute it. If you built a function, write a quick smoke test.
4. **Use browser tools if available** — if the repo has QA/browse skills (`/qa`, `/browse`, Playwright, Cypress), use them to verify UI changes. Navigate to the page, check the element renders, click the button, verify the result.
5. **Check logs and output** — if the work involves background jobs or async processes, check that they complete without errors.

**IMMEDIATELY after each test/check runs, update `verification.md`.** Do not batch updates. Do not wait until all tests are done. Do not just report results in conversation without writing them to the file. The sequence is: run test → update `verification.md` → move to next test. Every single time.

This applies whether you run the test yourself or the user runs it and tells you the result. If the user says "lint passed" and you respond "great" but don't update the file, you did it wrong.

### Phase 2: Human-assisted verification

After automated tests pass (or for items that can't be automated), ask the user:

> "I've verified X, Y, Z automatically. There are N items I can't fully verify on my own:
> - [item]: [why it needs human eyes — e.g., "visual layout", "requires real credentials", "needs production-like data"]
>
> Want to do manual testing? If yes, here's what to focus on:
> 1. [specific thing to check] — look for [specific expected behavior]
> 2. [specific thing to check] — try [specific user action]
>
> When done, tell me what you found. Paste any error logs, screenshots, or unexpected behavior and I'll update verification.md."

**Key rules for human-assisted verification:**
- Tell the user exactly what to test — don't say "check if it works," say "navigate to /settings, click Edit Profile, change the name, click Save, and verify the toast says 'Profile updated'"
- Tell them what context to feed back — logs, screenshots, error messages, network tab output
- **Update `verification.md` after EACH test result — not after all tests are done.** Same rule as Phase 1: observe result → write to file → next test. If you say "Profile scrape: PASS" in conversation but don't update the file before moving to the next test, you did it wrong.
- When the user reports results, record them in `verification.md` with `**Tested by:** user (manual)`
- If the user reports a failure, fix it, then re-run both automated and manual verification for that item

### Format

```markdown
# Verification: NNN-thread-name

## Checklist
- [x] Item from spec — PASS (automated)
- [x] Visual layout correct — PASS (manual)
- [ ] Another item — FAIL (see below)
- [ ] Not yet tested — PENDING

## Automated test results
- `npm test`: 42 passed, 0 failed
- `npm run typecheck`: clean
- `npm run lint`: clean
- API smoke test: POST /api/v1/compress → 200, job_id returned

## Results

### Item from spec
**Status:** PASS
**Method:** automated
**How tested:** What command was run, what was checked
**Date:** YYYY-MM-DD

### Visual layout correct
**Status:** PASS
**Method:** manual
**Tested by:** user
**How tested:** User navigated to /compress, uploaded a file, confirmed progress bar renders
**Date:** YYYY-MM-DD

### Another item
**Status:** FAIL
**Method:** automated
**How tested:** What was attempted
**Failure:** What went wrong and why
**Resolution:** How it was fixed (commit, file, change)
**Retested:** PASS (YYYY-MM-DD)
```

### Rules

- Checklist items map 1:1 to acceptance criteria in `spec.md`
- **Always run Phase 1 (automated) first.** Do not ask the user to manually test things you can verify yourself.
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
**Alternatives:** What else was considered and why it was rejected
**Reason:** Why this option over the alternatives
**Risks:** Tradeoffs or risks of this choice
**Affects:** What parts of the system this impacts
```

Decisions are append-only. Never edit or delete existing decision files.

## Briefings

Generate briefings when the user says "let's build it", "spawn agents", "generate briefings", or similar.

### How to generate

1. Read the active thread's `spec.md` and `plan.md`
2. Read relevant `handoffs/`
3. Read `MEMORY.md` for project context
4. Read the thread's `progress.yaml` for current status
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
Automated: test commands to run (unit tests, typecheck, lint, API smoke tests, browser QA).
Manual: what the user should check and what context to report back.

## When done
- Update `verification.md` with test results — all items must PASS
- Write handoff to `handoffs/`
- Update the thread's `progress.yaml`
- Update repo docs if your changes affect them (see Documentation below)
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

Progress is **per-thread**, not global. Each thread has its own `threads/NNN-slug/progress.yaml`.

```yaml
# threads/001-honestclaw-mvp/progress.yaml
milestones:
  - name: M0
    description: Scaffolding & CI/CD
    items:
      - name: API scaffold
        status: done
        repo: api
      - name: Frontend scaffold
        status: done
        repo: frontend
      - name: CI/CD pipelines
        status: todo
        repo: all
  - name: M1
    description: Core Features
    items:
      - name: Auth token rotation
        status: blocked
        repo: api
        blocked_by: infrastructure team
        reason: Waiting on new KMS key provisioning
      - name: Integration tests
        status: todo
        repo: all
```

Each milestone has a `name`, `description` (human-readable). Each item has a `status`, `repo`, and optional `blocked_by`/`reason`.

Valid statuses: `todo`, `in_progress`, `done`, `blocked`. Blocked items must include `blocked_by` and `reason`.

### Why per-thread?

- **Smaller context:** SessionStart hook injects only the active thread's progress — agents don't carry the weight of every thread
- **No conflicts:** parallel agents working on different threads can't collide on the same file
- **Clean separation:** each thread is self-contained (spec, plan, progress, verification)

### `/o` dashboard aggregation

The `/o` dashboard reads ALL `threads/*/progress.yaml` files and aggregates them for the full roadmap. This is a read-time computation, not stored anywhere. Each thread contributes its milestones to the overall percentage.

### Legacy migration

If `state/progress.yaml` exists (from before per-thread progress), migrate it:

1. Read `state/progress.yaml`
2. Group milestones by their `thread` field
3. Write each group to `threads/NNN-slug/progress.yaml`
4. Rename `state/progress.yaml` to `state/progress.yaml.migrated` (keep as backup)
5. Tell the user: *"Migrated progress from global file to per-thread. Backup at state/progress.yaml.migrated."*

If milestones don't have a `thread` field, ask the user which thread they belong to.

## Session context (compaction survival)

`state/session-context.md` is a volatile scratchpad that preserves your working context across compaction. **YOU MUST keep this file current throughout the session** — not at the end, not before compaction, but continuously as you work.

**Update `state/session-context.md` after every significant action:** completing a task, making a decision, discovering something important, changing direction. This takes seconds and saves everything if compaction hits.

### Format

```markdown
# Session Context

## Working on
003-compress-video-pipeline — building ffmpeg transcode config

## Key context
- User wants 3 output resolutions: 1080p, 720p, 480p
- Decided to use fluent-ffmpeg over raw child_process (decision 004)
- API endpoint accepts multipart, returns job_id UUID

## Current state
- API route done, transcoder WIP — 720p/480p flags not added yet
- verification.md: 1/3 PASS, 2 PENDING

## Next steps
- Add resolution array to transcode config
- Test all 3 outputs
- Write handoff to frontend
```

### Rules

- **Overwrite the entire file each time** — this is not a log, it's a snapshot of right now
- Keep it under 50 lines — just enough to resume without loss
- The PostCompact hook re-injects this file automatically after compaction
- When the session ends, this file becomes stale — the session log and daily log are the durable records

### What triggers an update

- You completed a subtask or milestone item
- You made or learned about a decision
- You changed approach or direction
- You discovered a gotcha or blocker
- You're about to spawn subagents or do parallel work

If compaction happens and `state/session-context.md` is empty or stale, you will lose context. Keep it current.

## Sessions

- The Stop hook auto-captures session end times to the daily log
- Before ending a session, write a substantive work summary to `memory/YYYY-MM-DD.md`
- **YOU MUST write a session log to `sessions/YYYY-MM-DD-slug.md`** when significant work was done: feature built, major refactor, architecture change, multi-repo scaffold, milestone completed. A session log is a curated narrative — what was built, why, what decisions were made, what's next. If you scaffolded an entire milestone and `sessions/` is empty, you did it wrong.

## Documentation

**YOU MUST keep repo documentation in sync with your changes.** When you complete work that affects documented behavior, update the docs before writing a handoff. This is not optional cleanup — stale docs mislead the next agent and the user.

### What to check after completing work

- **README.md** — does it reference commands, endpoints, file paths, or patterns you changed?
- **CLAUDE.md** — does it describe architecture, patterns, or workflows you modified?
- **ARCHITECTURE.md** / **CONTRIBUTING.md** — same check
- **Inline doc comments** — did you change a function's behavior but leave the old docstring?
- **`docs/` directory** — if the repo has one, scan for pages related to your changes

### When to update

- **Every time you mark a milestone item as `done`** — check if docs reference anything you just built or changed
- **When you add a new feature** — if it's user-facing or agent-facing, it should be documented
- **When you change an API, CLI command, config format, or file structure** — anything that other code or agents depend on
- **When writing a handoff** — if the receiving agent would be confused by stale docs, fix them first

### When NOT to update

- Trivial internal refactors that don't change behavior
- Work-in-progress — wait until the milestone item is done
- Docs owned by another repo — flag it in the handoff instead

**If you finished significant work and docs are unchanged, ask yourself: "Would the next agent or user reading these docs be misled?" If yes, update them.**

## Rules

- Do NOT modify `.orchestra/` files that are not part of your current task
- Do NOT delete or edit daily logs from previous days
- Do NOT overwrite handoffs — they are append-only records
- Do NOT skip writing a handoff if you made changes another agent needs to know about
- Do NOT create threads, decisions, or briefings without user intent — wait for the user to describe work or request generation
