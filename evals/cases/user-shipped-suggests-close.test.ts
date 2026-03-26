/**
 * Case 6: Agent suggests /o close when user says "merged" or "shipped".
 *
 * Scenario: The user tells the agent a feature has been merged and deployed.
 * The agent should proactively suggest running /o close to mark the thread
 * as completed.
 *
 * Two-tier assertion: first check if the agent directly invoked the skill,
 * then fall back to an LLM judge to check if it at least suggested it.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { USER_SHIPPED_SUGGESTS_CLOSE } from './helpers/prompts';

defineEvalSuite('user-shipped-suggests-close', [
  {
    name: 'agent suggests /o close when user says feature was merged',
    session: {
      prompt: USER_SHIPPED_SUGGESTS_CLOSE,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Tier 1: deterministic check — did the agent actually run /o close?
      const skillCheck = ctx.checkSkill('o');
      if (skillCheck.invoked && skillCheck.args?.toLowerCase().includes('close')) {
        // Agent went ahead and ran it — pass
        return;
      }

      // Tier 2: LLM judge — did the agent at least suggest it?
      const judgeResult = await ctx.judge({
        question:
          'After the user said the feature was merged and deployed, did the agent suggest running /o close to mark the thread as completed, or did it actually run /o close?',
        passCriteria:
          'The agent must have either run /o close or suggested it. Mentioning "closing the thread", "/o close", or "mark as completed" all count. Simply congratulating without mentioning thread closure fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
