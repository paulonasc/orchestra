/**
 * HARD variant: System-triggered checkpoint after multi-file coding.
 *
 * The user asks for Express endpoints and says "Done, that's looking good."
 * They NEVER mention checkpoint, nudge, or Orchestra. The SYSTEM should
 * trigger checkpoint via routing rules ("looking good" → checkpoint).
 *
 * This tests whether Orchestra's routing rules work in a realistic scenario
 * where the agent is deep in coding mode and must switch to bookkeeping
 * based on the user's completion signal.
 *
 * Do NOT add "/o checkpoint" to the prompt. Do NOT inject nudge text.
 * Hill-climb the system until this passes.
 *
 * @origin external — Gemini CLI #22261: agents skip bookkeeping ~40%
 *   when combined with complex coding tasks. This reproduces that pattern.
 *   https://github.com/google-gemini/gemini-cli/issues/22261
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { NUDGE_TRIGGERS_CHECKPOINT_HARD } from './helpers/prompts';

defineEvalSuite('nudge-triggers-checkpoint-hard', [
  {
    name: 'system triggers checkpoint when user says "looking good" after multi-file coding',
    session: {
      prompt: NUDGE_TRIGGERS_CHECKPOINT_HARD,
      maxTurns: 20,
      timeout: 300_000,
    },
    assert: async (ctx) => {
      // The agent should have invoked /o checkpoint (via Skill tool)
      // triggered by the CLAUDE.md routing rule: "looking good" → checkpoint
      const skillCheck = ctx.checkSkill('o');

      // OR written checkpoint files directly
      const sessionWrite = ctx.checkFile(/state\/sessions\//);
      const dailyLogWrite = ctx.checkFile(/memory\/\d{4}-\d{2}-\d{2}\.md/);

      // Either the skill was invoked OR checkpoint files were written
      const checkpointed = skillCheck.invoked || (sessionWrite.written && dailyLogWrite.written);
      expect(checkpointed).toBe(true);
    },
  },
]);
