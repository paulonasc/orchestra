/**
 * HARD variant: System-triggered checkpoint after real coding work.
 *
 * The user implements a feature and says "looks good, that's all for now."
 * They NEVER mention checkpoint or Orchestra. The SYSTEM (SKILL.md routing
 * rules + closure definition + CLAUDE.md rules) should trigger the agent
 * to checkpoint automatically.
 *
 * This tests Orchestra's core value proposition: the user doesn't have to
 * remember to save state. The system does it for them.
 *
 * Do NOT add "/o checkpoint" to the prompt. Do NOT simplify the coding task.
 * Hill-climb the system (SKILL.md, CLAUDE.md, rules) until this passes.
 *
 * @origin regression — v0.1.0 checkpoint evals were flaky. This hard variant
 *   tests the realistic scenario: user never mentions checkpoint.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';
import { CHECKPOINT_WRITES_CORRECT_FILES_HARD } from '../helpers/prompts';

defineEvalSuite('checkpoint-writes-correct-files-hard', [
  {
    name: 'system triggers checkpoint when user says "looks good" after coding',
    session: {
      prompt: CHECKPOINT_WRITES_CORRECT_FILES_HARD,
      maxTurns: 20,
      timeout: 300_000,
    },
    assert: async (ctx) => {
      // The agent should have invoked /o checkpoint (via Skill tool)
      // triggered by the CLAUDE.md routing rule: "looks good" → checkpoint
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
