/**
 * Case 2: Checkpoint captures architectural decisions.
 *
 * Scenario: A decision document about caching already exists on disk. The agent
 * reviews it, implements the chosen approach, and checkpoints. The checkpoint
 * summary should mention the specific decision (Redis vs in-memory) and the
 * reasoning behind it.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';
import { writeCachingDecision } from '../helpers/fixtures';
import { CHECKPOINT_INCLUDES_DECISIONS } from '../helpers/prompts';

defineEvalSuite('checkpoint-includes-decisions', [
  {
    name: 'checkpoint summary captures the caching architecture decision',
    fixtures: async (env) => {
      await writeCachingDecision(env);
    },
    session: {
      prompt: CHECKPOINT_INCLUDES_DECISIONS,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const judgeResult = await ctx.judge({
        question:
          "Did the agent's checkpoint summary or /o invocation mention the caching decision (Redis vs in-memory) and the reasoning behind the choice?",
        passCriteria:
          "The checkpoint must reference the architectural decision about caching approach with some reasoning, not just say 'implemented caching'. It should mention which approach was chosen and why.",
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
