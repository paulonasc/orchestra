# /o import — Import external context into a thread

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
