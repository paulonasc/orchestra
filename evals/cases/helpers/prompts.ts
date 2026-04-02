/**
 * Prompt constants for eval test cases.
 *
 * Extracted from inline template literals to keep test files focused
 * on scenario setup and assertions. Each prompt is a single string
 * ready to pass to runSession.
 */

export const NUDGE_TRIGGERS_CHECKPOINT = `\
Add a comment "// health endpoint" to the top of src/app.ts.

You just received this message from Orchestra's monitoring system:
"Orchestra: 12 edits since last checkpoint. Run /o checkpoint to save progress."

Follow this instruction — run /o checkpoint now to save your progress.`;

// Hard variant: realistic scenario where the user asks for coding work and
// never mentions checkpoint or Orchestra. The SYSTEM should trigger checkpoint
// via routing rules ("looks good" → checkpoint) or the SKILL.md closure definition.
// Do NOT add "/o checkpoint" or nudge text to this prompt. That defeats the purpose.
export const NUDGE_TRIGGERS_CHECKPOINT_HARD = `\
Create a simple Express API with these endpoints, each in a separate file under src/routes/:
1. GET /health — returns { status: "ok" }
2. GET /users — returns a hardcoded array of users
3. POST /users — accepts { name, email } and returns it with an id

Also create src/routes/index.ts that re-exports all route handlers.

Done, that's looking good. Nice work.`;

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
Add a comment to the top of src/app.ts: "// TODO: add input validation".

Then run /o checkpoint to save your progress.`;

// Hard variant: realistic scenario where the user NEVER mentions checkpoint.
// The SYSTEM (SKILL.md routing rules, closure definition, CLAUDE.md) should
// make the agent checkpoint automatically when the user signals completion.
// This tests Orchestra's value proposition, not the agent's instruction-following.
// Do NOT add "/o checkpoint" to this prompt. That defeats the purpose.
export const CHECKPOINT_WRITES_CORRECT_FILES_HARD = `\
Add input validation to the POST /users endpoint using zod.
Create a validation schema that requires name (string, 2-50 chars) and email (valid email).
Return 400 with error details on validation failure.

I tested it and it's working. Looks good, that's all for now.`;

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

export const DECISIONS_RECORDED_AFTER_REVIEW = `\
We just finished reviewing the products API. Here are the decisions we made:

1. Consensus quorum: require >= 2 agents agreeing before auto-updating a product field
2. Use database transactions for verification upserts to prevent partial writes
3. Use CREATE INDEX CONCURRENTLY instead of plain CREATE INDEX to avoid write locks

These are architectural decisions that affect how the system works. Record them properly.`;

export const VERIFICATION_UPDATED_AFTER_TESTS = `\
I just ran the tests and they all passed — 12 tests, 0 failures. The auth endpoints are working correctly. Save this progress.`;

export const VERIFICATION_NO_EXPLICIT_INSTRUCTION = `\
All 15 integration tests pass. The login endpoint returns proper JWT tokens and the refresh flow works. Build is clean, lint is clean.`;

export const USER_SHIPPED_SUGGESTS_CLOSE = `\
This repo uses Orchestra for multi-agent coordination (\`/o\` for status, \`/o checkpoint\` to save).
The active thread is 001-test-feature. All items in the thread are done.

I just merged the PR for the rate limiting feature. It is deployed to production.
All the tests passed and it is working well in prod.`;

export const ROUTING_LOOKS_GOOD_CHECKPOINTS = `\
I asked you to add request logging to this Express app. You added it and I tested it — looks good.`;

export const ROUTING_SHIPPED_CLOSES = `\
The rate limiting feature is shipped. Merged the PR, deployed to production. All tests passing.`;

export const STATS_SHOWS_TELEMETRY = `\
Show me Orchestra usage stats for this project.`;

// Tests that the agent knows what Orchestra is and how to check for updates.
// @origin real-user — Paulo tested on second computer, agent confused Orchestra with gstack.
export const AGENT_KNOWS_ORCHESTRA = `\
What is Orchestra and how do I update it?`;
