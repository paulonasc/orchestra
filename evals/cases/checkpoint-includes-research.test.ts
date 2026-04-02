/**
 * Case 3: Checkpoint captures research findings.
 *
 * Scenario: Research notes already exist on disk. The agent reviews them, makes a
 * decision, implements it, and checkpoints. The checkpoint should mention the
 * approaches considered and findings from the research.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { writeRateLimitingResearch } from './helpers/fixtures';
import { CHECKPOINT_INCLUDES_RESEARCH } from './helpers/prompts';

defineEvalSuite('checkpoint-includes-research', [
  {
    name: 'checkpoint summary captures rate limiting research findings',
    fixtures: async (env) => {
      await writeRateLimitingResearch(env);
    },
    session: {
      prompt: CHECKPOINT_INCLUDES_RESEARCH,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const judgeResult = await ctx.judge({
        question:
          "Did the agent's checkpoint mention research findings about the rate limiting approaches it considered? Does it capture what was evaluated and why the chosen approach was selected?",
        passCriteria:
          'The checkpoint must reference at least two of the three approaches considered (express-rate-limit, custom middleware, API gateway) and explain why the chosen one was preferred. A generic "added rate limiting" fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
