/**
 * Case 1: Agent responds to checkpoint nudge by invoking /o checkpoint.
 *
 * The prompt includes a simulated nudge message ("Orchestra: 12 edits since
 * last checkpoint. Run /o checkpoint to save progress."). The agent should
 * respond by invoking the Skill tool with /o checkpoint.
 *
 * Note: We inject the nudge directly in the prompt rather than relying on
 * the PostToolUse hook firing, because the Agent SDK may not execute Claude
 * Code hooks from settings.json. This eval tests the agent's RESPONSE to
 * a nudge, not whether the hook infrastructure works.
 *
 * @origin external — Gemini CLI issue #22261 showed agents skip bookkeeping
 *   ~40% of the time when combined with complex coding tasks. We simplified
 *   the coding task and inject the nudge directly.
 *   https://github.com/google-gemini/gemini-cli/issues/22261
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { NUDGE_TRIGGERS_CHECKPOINT } from './helpers/prompts';

defineEvalSuite('nudge-triggers-checkpoint', [
  {
    name: 'agent calls /o checkpoint after nudge message',
    session: {
      prompt: NUDGE_TRIGGERS_CHECKPOINT,
      maxTurns: 10,
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
