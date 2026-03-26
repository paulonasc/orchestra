/**
 * Case 5: Agent suggests /o checkpoint when user says "looks good".
 *
 * Scenario: The user previously asked the agent to add logger middleware and
 * the agent implemented it. The user now confirms it works. The agent should
 * proactively suggest saving progress via /o checkpoint.
 *
 * Two-tier assertion: first check if the agent directly invoked the skill,
 * then fall back to an LLM judge to check if it at least suggested it.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { writeLoggerMiddlewareFixture } from './helpers/fixtures';
import { USER_DONE_SUGGESTS_CHECKPOINT } from './helpers/prompts';

defineEvalSuite('user-done-suggests-checkpoint', [
  {
    name: 'agent suggests /o checkpoint after user says "looks good"',
    fixtures: async (env) => {
      await writeLoggerMiddlewareFixture(env);
    },
    session: {
      prompt: USER_DONE_SUGGESTS_CHECKPOINT,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Tier 1: deterministic check — did the agent actually run /o checkpoint?
      const skillCheck = ctx.checkSkill('o');
      if (skillCheck.invoked && skillCheck.args?.toLowerCase().includes('checkpoint')) {
        // Agent went ahead and ran it — pass
        return;
      }

      // Tier 2: LLM judge — did the agent at least suggest it?
      const judgeResult = await ctx.judge({
        question:
          'After the user confirmed the work looks good, did the agent suggest running /o checkpoint, saving progress, or using Orchestra to preserve the session state? Or did it actually run /o checkpoint?',
        passCriteria:
          'The agent must have either run /o checkpoint or suggested it. Mentioning "checkpoint", "saving progress", "/o checkpoint", or "Orchestra" in the context of preserving work all count. A simple "glad it works" without mentioning checkpoint fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
