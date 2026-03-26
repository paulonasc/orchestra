/**
 * Prompt constants for eval test cases.
 *
 * Extracted from inline template literals to keep test files focused
 * on scenario setup and assertions. Each prompt is a single string
 * ready to pass to runSession.
 */

export const NUDGE_TRIGGERS_CHECKPOINT = `\
Create a simple Express API with these endpoints, each in a separate file under src/routes/:
1. GET /health — returns { status: "ok" }
2. GET /users — returns a hardcoded array of users
3. POST /users — accepts { name, email } and returns it with an id

Also create src/routes/index.ts that re-exports all route handlers.

If Orchestra nudges you about checkpointing, follow its instructions.`;

export const CHECKPOINT_INCLUDES_DECISIONS = `\
Read the decision document at .orchestra/decisions/caching-approach.md.
It contains our architectural decision about caching for this Express API.

Implement the chosen approach: add in-memory caching (using a simple Map or
node-cache) to the GET /health endpoint in src/app.ts with a 60-second TTL.

Then save your progress with /o checkpoint.`;

export const CHECKPOINT_INCLUDES_RESEARCH = `\
Read the research-notes.md file in this project.
It contains our analysis of rate limiting approaches for this Express API.

Based on those findings, implement the recommended approach (express-rate-limit)
on the existing Express app in src/app.ts.

Then save your progress with /o checkpoint.`;

export const CHECKPOINT_WRITES_CORRECT_FILES = `\
Add input validation to the POST /users endpoint using zod.
Create a validation schema that requires name (string, 2-50 chars) and email (valid email).
Return 400 with error details on validation failure.

Then run /o checkpoint to save your progress.`;

export const USER_DONE_SUGGESTS_CHECKPOINT = `\
This repo uses Orchestra for multi-agent coordination (\`/o\` for status, \`/o checkpoint\` to save progress).
You should proactively suggest /o checkpoint when the user confirms work is done.

I asked you to add a logger middleware to this Express app earlier in this session.
You created src/middleware/logger.ts and updated src/app.ts to use it.
I just tested it and the logging is working correctly.

That's working perfectly, looks good. I'm happy with it.`;

export const CHECKPOINT_UPDATES_THREAD_FILES = `\
This repo uses Orchestra for multi-agent coordination (\`/o\` for status, \`/o checkpoint\` to save progress).

You just finished implementing the auth migration feature. Here is a summary of what happened this session:
- You ran all tests and they passed (12 tests, 0 failures).
- The auth migration feature is complete: JWT token generation, bcrypt password hashing, and login endpoint are all working.
- The "Auth middleware" and "Token refresh" items from the plan are done.
- You verified the auth endpoints return correct responses.

Run /o checkpoint to save your progress now.`;

export const PLAN_WRITES_TO_ORCHESTRA = `\
I want to add a caching layer to this API. Here's what I'm thinking:
- Use Redis for the hot path (GET /products)
- TTL of 60 seconds, bust on write
- Start with a simple key-value approach, no fancy invalidation

Document this plan first. Write it up as a principal engineer would — options considered, tradeoffs, recommendation, implementation steps.`;

export const USER_SHIPPED_SUGGESTS_CLOSE = `\
This repo uses Orchestra for multi-agent coordination (\`/o\` for status, \`/o checkpoint\` to save).
The active thread is 001-test-feature. All items in the thread are done.

I just merged the PR for the rate limiting feature. It is deployed to production.
All the tests passed and it is working well in prod.`;
