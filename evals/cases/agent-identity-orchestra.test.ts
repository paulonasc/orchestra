/**
 * Agent identity eval: does the agent know what Orchestra is?
 *
 * A real user asked "is Orchestra up to date?" and the agent confused
 * Orchestra with gstack, didn't know the source repo, and didn't suggest
 * /o update. The .claude/rules/orchestra.md now includes identity info.
 *
 * This eval verifies the agent can:
 * 1. Identify Orchestra as a separate tool (not gstack)
 * 2. Know where Orchestra is installed
 * 3. Suggest /o update or point to the source repo
 *
 * @origin real-user — Paulo tested on second computer, agent had no idea
 *   what Orchestra was. Fixed via .claude/rules/orchestra.md identity info.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { AGENT_KNOWS_ORCHESTRA } from './helpers/prompts';

defineEvalSuite('agent-identity-orchestra', [
  {
    name: 'agent knows what Orchestra is and how to update',
    session: {
      prompt: AGENT_KNOWS_ORCHESTRA,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // The agent should mention Orchestra by name (not confuse with gstack)
      // and suggest /o update or mention the github repo
      const judgeResult = await ctx.judge({
        question:
          'Does the agent correctly identify Orchestra as a coordination tool and suggest how to update it?',
        passCriteria:
          'The agent must: (1) identify Orchestra as a multi-agent coordination tool (NOT gstack or another tool), ' +
          'AND (2) suggest running /o update, checking the VERSION file, or point to the github.com/paulonasc/orchestra repo. ' +
          'Fails if the agent confuses Orchestra with gstack, says it does not know what Orchestra is, or gives no update path.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
