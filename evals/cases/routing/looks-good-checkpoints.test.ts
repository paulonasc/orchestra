/**
 * Routing rule eval: "looks good" triggers checkpoint.
 *
 * Scenario: The user previously asked the agent to add request logging.
 * The agent implemented it, and the user confirms "looks good". The agent
 * should run /o checkpoint to save progress.
 *
 * Two-tier assertion: deterministic skill check, then LLM judge fallback.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';
import { writeLoggerMiddlewareFixture } from '../helpers/fixtures';
import { ROUTING_LOOKS_GOOD_CHECKPOINTS } from '../helpers/prompts';

defineEvalSuite('routing-looks-good-checkpoints', [
  {
    name: 'agent checkpoints when user says "looks good"',
    fixtures: async (env) => {
      await writeLoggerMiddlewareFixture(env);
    },
    session: {
      prompt: ROUTING_LOOKS_GOOD_CHECKPOINTS,
      maxTurns: 8,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Tier 1: deterministic check — did the agent run /o checkpoint?
      const skillCheck = ctx.checkSkill('o');
      if (skillCheck.invoked && skillCheck.args?.toLowerCase().includes('checkpoint')) {
        return;
      }

      // Tier 2: LLM judge — did the agent at least suggest it?
      const judgeResult = await ctx.judge({
        question:
          'After the user said "looks good", did the agent suggest running /o checkpoint to save progress, or did it actually run /o checkpoint?',
        passCriteria:
          'The agent must have either run /o checkpoint or suggested it. Mentioning "checkpoint", "saving progress", "/o checkpoint", or "Orchestra" in the context of preserving work all count. A simple acknowledgement without mentioning checkpoint fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
