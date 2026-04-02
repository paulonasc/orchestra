# Verification — The gate between "code written" and "done"

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

Read `templates/thread-verification.md` for the verification document format. Key rules:

- Checklist items map 1:1 to acceptance criteria in `spec.md`
- **Always run Phase 1 (automated) first.** Do not ask the user to manually test things you can verify yourself.
- Every FAIL must include: what happened, why, and how it was resolved
- PENDING means not yet tested — work is not done
- **Do NOT mark a progress item as `done` until all verification items PASS.**
- Receiving agents should read `verification.md` to know what's validated vs just claimed

### Rules

- Do NOT modify `.orchestra/` files that are not part of your current task
- Do NOT delete or edit daily logs from previous days
- Do NOT overwrite handoffs — they are append-only records
- Do NOT skip writing a handoff if you made changes another agent needs to know about
- Do NOT create threads, decisions, or briefings without user intent — wait for the user to describe work or request generation
