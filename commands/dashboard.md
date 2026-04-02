# /o — Executive dashboard

Read all Orchestra state files and render a **top-down** dashboard. Start high-level, then drill down. The user should understand the project in 5 seconds from the top section alone.

**Before rendering:** If heartbeat is not yet scheduled this session (check `state/sessions/{session-id}.md` for `heartbeat_scheduled: true` — but remember this flag may be stale from a prior session), run `/o heartbeat` silently first. This is the ONLY place that triggers heartbeat setup — hooks do NOT trigger it.

**Concurrent sessions check:** Before rendering, check `state/sessions/` for multiple active session files. If multiple files exist, add an "Active sessions" section after Section 0:

```
## Active sessions (2)

20260324-143022-12345  Working on: 001-honestclaw-mvp — API scaffold
20260324-144510-67890  Working on: 003-compress-pipeline — ffmpeg config
```

Show each session's ID and the first line of "Working on" from its file. If only one session file (or none), skip this section entirely.

**Section 0 — Thread health (one line)**

Count threads by status. Show at the top so the user instantly sees scope:

```
🔥 2 active     📦 8 completed     🗑️ 1 abandoned
```

Only show categories that have items. If all threads are active, just show `🔥 3 active`.

**Section 1 — Roadmap (where are we?)**

Read `threads/*/progress.yaml` files and aggregate — **but only `active` threads.** Completed and abandoned threads are done; don't include them in the roadmap percentage. Show every milestone across active threads. The user needs to see the full journey of what's in flight: where they are, what's ahead, and overall completion of active work.

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
/o import (bring in docs)  ·  /o docs (audit docs)  ·  /o checkpoint (save)  ·  /o close (ship it)
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
| State drift detected (stale session file, missing decisions, daily log gaps) and no heartbeat scheduled | `💡 State drift detected — run /o heartbeat to enable automatic checks` |
| Milestone items recently completed | `💡 /o docs — check if repo docs need updating after recent work` |
| Active thread is 100% done + verified | `💡 /o close — mark this thread as completed to keep the dashboard clean` |
| Default (nothing else matches) | `💡 Ask about any milestone ("what's left in M0?") or /o import to bring in external docs` |

**Rules:**
- Only show ONE hint — never a list. The user should read it in 1 second.
- Rotate hints across invocations. Don't show the same hint twice in a row within a session. Track the last hint shown in `state/sessions/{session-id}.md`.
- Keep hints under 80 characters.
- The `or just ask about any milestone` line in the nav is critical — it tells users they can use natural language.

## `/o` dashboard aggregation

The `/o` dashboard reads `threads/*/progress.yaml` files and aggregates them for the roadmap — **but only threads with `status: active`** (or missing status, which defaults to active). Completed and abandoned threads are excluded. This is a read-time computation, not stored anywhere. Each active thread contributes its milestones to the overall percentage.

To check status efficiently: read the first few lines of each `progress.yaml` for the `status:` field. If `completed` or `abandoned`, skip the file entirely — don't parse milestones or items.

## Post-work audit

When `/o` detects that agents have finished work (new handoffs exist, progress was updated since last session), also audit Orchestra state.

**IMPORTANT: Delegate to a subagent.** Post-work audits read many files across threads. Spawn a background Agent to do the audit and return a summary of what's stale/missing.

The subagent checks:
1. All `verification.md` files for active threads — flag any with FAILs or PENDINGs
2. Whether MEMORY.md was updated with new learnings
3. Whether decisions made during work were recorded in `decisions/`
4. Whether `sessions/` has a log for significant work
5. Whether repo docs (README, CLAUDE.md, etc.) may be stale — flag with a suggestion to run `/o docs`
6. Whether any active threads are 100% done — suggest `/o close`
7. Flag anything stale or missing

The main agent receives the summary and presents action items to the user.
