/**
 * HARD variant: Agent responds to hook-generated nudge during real coding work.
 *
 * Unlike the baseline test (which injects the nudge in the prompt), this test
 * relies on the PostToolUse hook actually firing after 10+ file edits. The agent
 * must create multiple files AND respond to the ambient nudge by checkpointing.
 *
 * This is ASPIRATIONAL — it may fail due to:
 * - Agent SDK not executing Claude Code hooks
 * - Agent prioritizing coding over bookkeeping (Gemini CLI #22261 pattern)
 * - Non-deterministic agent behavior under turn pressure
 *
 * Do NOT simplify this test to make it pass. The point is to hill-climb the
 * system (prompts, SKILL.md, hooks) until this passes reliably.
 *
 * @origin external — Gemini CLI #22261: agents skip bookkeeping ~40% of the
 *   time when combined with complex coding tasks. This test intentionally
 *   reproduces that pattern to measure our system's resilience.
 *   https://github.com/google-gemini/gemini-cli/issues/22261
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { seedEditCounter } from './helpers/fixtures';
import { NUDGE_TRIGGERS_CHECKPOINT_HARD } from './helpers/prompts';

defineEvalSuite('nudge-triggers-checkpoint-hard', [
  {
    name: 'agent calls /o checkpoint after hook-generated nudge during real coding',
    fixtures: async (env) => {
      await seedEditCounter(env, 8);
    },
    session: {
      prompt: NUDGE_TRIGGERS_CHECKPOINT_HARD,
      maxTurns: 15,
      timeout: 300_000,
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
