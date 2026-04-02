/**
 * Routing rule eval: "shipped" triggers close.
 *
 * Scenario: The user tells the agent the feature is shipped — merged the PR,
 * deployed to production. The agent should suggest or run /o close to mark
 * the thread as completed.
 *
 * Two-tier assertion: deterministic skill check, then LLM judge fallback.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { ROUTING_SHIPPED_CLOSES } from './helpers/prompts';

defineEvalSuite('routing-shipped-closes', [
  {
    name: 'agent suggests /o close when user says "shipped"',
    session: {
      prompt: ROUTING_SHIPPED_CLOSES,
      maxTurns: 8,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Tier 1: deterministic check — did the agent run /o close?
      const skillCheck = ctx.checkSkill('o');
      if (skillCheck.invoked && skillCheck.args?.toLowerCase().includes('close')) {
        return;
      }

      // Tier 2: LLM judge — did the agent at least suggest closing?
      const judgeResult = await ctx.judge({
        question:
          'After the user said the feature is shipped and deployed, did the agent suggest running /o close to mark the thread as completed, or did it actually run /o close?',
        passCriteria:
          'The agent must have either run /o close or suggested it. Mentioning "closing the thread", "/o close", or "mark as completed" all count. Simply congratulating without mentioning thread closure fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
