/**
 * Test fixture functions for populating working directories.
 *
 * Each function writes the scenario-specific files needed by a test case.
 * The base orchestra structure (threads, state, SKILL.md, hooks) is already
 * created by createTestWorkDir in setup.ts — these functions add only the
 * files unique to each scenario.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestWorkDir } from './setup';

/**
 * Nudge test: pre-seed the edit counter close to the threshold so a few
 * file creates are enough to trigger the nudge.
 */
export async function seedEditCounter(env: TestWorkDir, count: number = 8): Promise<void> {
  await mkdir(join(env.orchestra, '.logs'), { recursive: true });
  await writeFile(join(env.orchestra, '.logs', 'edit-count-default'), String(count));
}

/**
 * Checkpoint-decisions test: write a caching architecture decision document.
 */
export async function writeCachingDecision(env: TestWorkDir): Promise<void> {
  await mkdir(join(env.orchestra, 'decisions'), { recursive: true });
  await writeFile(
    join(env.orchestra, 'decisions', 'caching-approach.md'),
    `# Decision: Caching Approach

## Context
Small Express API with ~100 concurrent users, deployed to a single server.
Need to cache the GET /health endpoint to reduce unnecessary computation.

## Options Considered

### Redis
- Pros: Shared cache across processes, TTL support, persistence
- Cons: Requires running a Redis server, adds operational complexity, network latency for cache hits
- Our assessment: Overkill for a single-server deployment with 100 users

### In-memory caching (node-cache or simple Map)
- Pros: Zero infrastructure, sub-millisecond lookups, trivial to implement
- Cons: Cache lost on restart, per-process only (no sharing)
- Our assessment: Perfect fit for our single-server, low-traffic use case

## Decision
Use in-memory caching with node-cache. TTL of 60 seconds for the health endpoint.
Revisit if we scale to multiple servers or need cache persistence.
`,
  );
}

/**
 * Checkpoint-research test: write rate limiting research notes.
 */
export async function writeRateLimitingResearch(env: TestWorkDir): Promise<void> {
  await writeFile(
    join(env.root, 'research-notes.md'),
    `# Rate Limiting Research

## Context
Single Express server, ~100 req/s, needs rate limiting on public endpoints.

## Options Evaluated

### 1. express-rate-limit package
- Pros: Simple to integrate, well-maintained (1M+ weekly downloads), configurable per-route
- Cons: In-memory store only works for single-server, no distributed support out of the box
- Verdict: Best fit for our single-server setup

### 2. Custom middleware with token bucket algorithm
- Pros: Full control over algorithm, no dependencies
- Cons: Reinventing the wheel, higher maintenance burden, edge cases around timer cleanup
- Verdict: Over-engineered for our needs

### 3. API gateway-level rate limiting (e.g., Kong, AWS API Gateway)
- Pros: Handles rate limiting before traffic hits Express, works at scale
- Cons: Adds infrastructure complexity, overkill for single server at 100 req/s
- Verdict: Would consider if we move to multi-server deployment

## Recommendation
Use express-rate-limit with the default in-memory store. Set 100 requests per 15-minute window per IP on public routes. Revisit if we scale to multiple servers.
`,
  );
}

/**
 * Checkpoint-thread-files test: set up a thread with in-progress items
 * and pending verification entries, plus a MEMORY.md file. The checkpoint
 * should update all of these.
 */
export async function writeAuthMigrationThread(env: TestWorkDir): Promise<void> {
  const threadDir = join(env.orchestra, 'threads', '001-test-feature');

  // Overwrite progress.yaml with auth migration items in-progress
  await writeFile(
    join(threadDir, 'progress.yaml'),
    `milestones:
  - name: M0 Setup
    items:
      - name: Project scaffold
        status: done
      - name: CI/CD pipeline
        status: done
  - name: M1 Auth
    items:
      - name: Auth middleware
        status: in-progress
      - name: Token refresh
        status: in-progress
      - name: Rate limiting
        status: pending
`,
  );

  // Create verification.md with pending test results
  await writeFile(
    join(threadDir, 'verification.md'),
    `# Verification: 001-test-feature

## Auth middleware
- [ ] PENDING — Unit tests for JWT generation
- [ ] PENDING — Integration test for login endpoint

## Token refresh
- [ ] PENDING — Refresh token rotation test

## Rate limiting
- [ ] PENDING — Rate limit threshold test
`,
  );

  // Create a MEMORY.md at the orchestra root with existing learnings
  await writeFile(
    join(env.orchestra, '..', 'MEMORY.md'),
    `# MEMORY

## Patterns
- Use zod for validation in all API endpoints
`,
  );
}

/**
 * User-done test: pre-populate logger middleware and session context
 * to simulate prior work the agent supposedly completed earlier.
 */
export async function writeLoggerMiddlewareFixture(env: TestWorkDir): Promise<void> {
  // Logger middleware file
  await mkdir(join(env.root, 'src', 'middleware'), { recursive: true });
  await writeFile(
    join(env.root, 'src', 'middleware', 'logger.ts'),
    `import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, _res: Response, next: NextFunction) {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.url}\`);
  next();
}
`,
  );

  // Updated app.ts showing the middleware is already wired in
  await writeFile(
    join(env.root, 'src', 'app.ts'),
    `import express from 'express';
import { logger } from './middleware/logger';

const app = express();
app.use(express.json());
app.use(logger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
`,
  );

  // Session context file showing prior work
  await writeFile(
    join(env.orchestra, 'state', 'sessions', 'eval-session.md'),
    `# Session: eval-session

## Work completed this session
- Created src/middleware/logger.ts — request logging middleware
- Updated src/app.ts — wired logger middleware into Express pipeline
- Tested manually — middleware logs all incoming requests correctly

## Status
Waiting for user confirmation.
`,
  );
}
