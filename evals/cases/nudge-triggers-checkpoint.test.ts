/**
 * Case 1: PostToolUse nudge fires after 10+ edits, agent responds with /o checkpoint.
 *
 * Scenario: Agent is asked to create multiple files (Express API with 3 endpoints
 * in separate files). The PostToolUse hook counts edits and nudges at threshold 10.
 * After receiving the nudge, the agent should invoke the /o skill with "checkpoint".
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { seedEditCounter } from './helpers/fixtures';
import { NUDGE_TRIGGERS_CHECKPOINT } from './helpers/prompts';

defineEvalSuite('nudge-triggers-checkpoint', [
  {
    name: 'agent calls /o checkpoint after PostToolUse nudge fires',
    fixtures: async (env) => {
      // Pre-seed the edit counter close to threshold so a couple of
      // file creates push it over (avoids needing 10 actual writes).
      await seedEditCounter(env, 8);
    },
    session: {
      prompt: NUDGE_TRIGGERS_CHECKPOINT,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const skillCheck = ctx.checkSkill('o');
      expect(skillCheck.invoked).toBe(true);

      if (skillCheck.args) {
        expect(skillCheck.args.toLowerCase()).toContain('checkpoint');
      }
    },
  },
]);
