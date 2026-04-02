# /o close — Mark thread as completed

Marks the active thread (or a specified thread) as shipped. This removes it from dashboard aggregation and session-start injection.

**Usage:**
- `/o close` — close the active thread as `completed`
- `/o close --abandoned` — close the active thread as `abandoned` (work was killed, not shipped)
- `/o close 003-slug` — close a specific thread by name

**What it does:**

1. Read the thread's `progress.yaml`
2. Set `status: completed` (or `status: abandoned` with `--abandoned`)
3. Set `completed_at: YYYY-MM-DD`
4. If closing the active thread, clear `state/active-thread.md`
5. Confirm:

```
Thread 001-instagram-integration closed as completed (2026-03-23).
  24/24 items done, all verification PASS.
  Cleared active thread — run /o list to pick the next one.
```

**Safety checks:**
- If closing as `completed` but the thread has items not marked `done`, warn: *"3 items are still in_progress. Close anyway?"*
- If closing as `completed` but `verification.md` has FAIL or PENDING items, warn: *"2 verification items haven't passed. Close anyway?"*
- These are warnings, not blocks — the user might have good reasons (scope cut, moved to another thread, etc.)

## Proactive close detection

**You don't wait for the user to remember `/o close`.** Watch for these signals during normal conversation and prompt the user:

**Signals that a thread is done:**
- User says "merged", "PR merged", "landed", "shipped", "deployed", "this is done", "we're good", "all set"
- You check a PR status (via `gh pr view`, `gh pr status`, etc.) and it shows `MERGED`
- All items in the active thread's `progress.yaml` are `done` AND all `verification.md` items are `PASS`
- User asks to start a new thread or switches context to different work

**When you detect a signal**, use AskUserQuestion once — don't nag:

> {thread-name} looks complete. Closing removes it from the dashboard — you can always reopen with `/o reopen`.
>
> RECOMMENDATION: Choose A if all work is merged and verified.
>
> A) Close it — mark as completed
> B) Not yet — still verifying

If A: run the `/o close` flow. If B: drop it — don't ask again in the same session.

**Rules:**
- Only prompt for the **active thread**. Don't prompt about threads the user isn't currently working on.
- Only prompt **once per session** per thread. Track in `state/sessions/{session-id}.md` if you already asked.
- If verification has FAILs or PENDINGs, include that in the prompt: *"2 verification items are still pending — close anyway?"*
- If the user merged a PR but there's still work on the thread (e.g., multi-PR thread), don't prompt — a single PR merge doesn't mean the thread is done.

## /o reopen — Reopen a closed thread

Reopens a completed or abandoned thread, setting it back to active.

**Usage:**
- `/o reopen 001-slug` — reopen a specific thread

**What it does:**

1. Read the thread's `progress.yaml`
2. Set `status: active`
3. Remove `completed_at`
4. Optionally set `state/active-thread.md` to this thread
5. Confirm:

```
Thread 001-instagram-integration reopened.
  Set as active thread.
```
