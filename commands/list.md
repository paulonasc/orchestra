# /o list / active / plan / thread — View state

## /o list — List all threads

Scan `threads/` and render a summary table grouped by status. Read the `status` field from each thread's `progress.yaml` (default: `active` if missing).

```
## Active threads

001  honestclaw-mvp       M0 87% | M1 0%    3 repos
003  mobile-app           M0 20%             2 repos    ⚠ blocked

## Completed

002  payment-integration  M0 100% | M1 100%  1 repo     completed 2026-03-15

## Abandoned

004  old-auth-spike       M0 30%             1 repo     abandoned 2026-03-10
```

Active threads first (these are what matter). Completed threads show their `completed_at` date. Abandoned threads show date and are dimmed. If a category is empty, omit it.

## /o active — What are we working on?

Read `state/active-thread.md` and `state/sessions/{session-id}.md`. Show:

```
## Active

Thread: 001-honestclaw-mvp
Milestone: M0 — Scaffolding & CI/CD (87%)
Current focus: Building GitHub Actions CI/CD pipelines for API and frontend
Next steps: M0.27 API CI/CD, M0.28 Frontend CI/CD
```

If the session file exists and is recent, include the key context and current state from it.

## /o <thread-name> — Thread deep dive

Read the thread's `spec.md`, `plan.md`, `verification.md`, `conversation.md`, and related `handoffs/`. Render:

1. **Spec summary** — problem, approach, acceptance criteria
2. **Plan** — current phase, milestone progress, open questions (from `plan.md`)
3. **Risks** — from `## Risks` in spec
4. **Alternatives considered** — from `## Alternatives` in spec (what was rejected and why)
5. **Verification status** — automated and manual test results
6. **Progress** — milestone items for this thread with status
7. **Handoffs** — recent handoffs related to this thread
8. **Decisions** — decisions tagged with this thread

## /o plan — Show thread plan

Read the plan for the active thread (or specify a thread: `/o plan 001-slug`).

1. Read `state/active-thread.md` to find the current thread (unless thread specified)
2. Read `threads/NNN-slug/plan.md`
3. Render: objective, current phase, items with status, open questions, dependencies

If the thread has no `plan.md`, tell the user: "No plan committed for this thread yet. Want me to create one from the spec and research?"
