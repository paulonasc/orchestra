/**
 * HARD variant: Checkpoint writes to correct files after real coding work.
 *
 * Unlike the baseline test (which uses a trivial 1-line edit), this test asks
 * the agent to implement zod validation — a real coding task that takes 5-10
 * turns. The agent must then checkpoint, writing to state/sessions/ and
 * memory/YYYY-MM-DD.md.
 *
 * This is ASPIRATIONAL — it may fail due to:
 * - Agent spending all turns on coding and not reaching checkpoint
 * - Agent attempting to delegate checkpoint to Agent tool (not available in evals)
 * - Non-deterministic turn allocation between coding and bookkeeping
 *
 * Do NOT simplify this test to make it pass. The point is to hill-climb the
 * system (prompts, SKILL.md, checkpoint instructions) until this passes reliably.
 *
 * @origin regression — v0.1.0 checkpoint evals were flaky because the coding
 *   task consumed all turns. Baseline test was simplified; this hard variant
 *   preserves the original realistic scenario.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { CHECKPOINT_WRITES_CORRECT_FILES_HARD } from './helpers/prompts';

defineEvalSuite('checkpoint-writes-correct-files-hard', [
  {
    name: 'checkpoint writes to session file and daily log after real coding work',
    session: {
      prompt: CHECKPOINT_WRITES_CORRECT_FILES_HARD,
      maxTurns: 20,
      timeout: 300_000,
    },
    assert: async (ctx) => {
      // Should write to a session file under state/sessions/
      const sessionWrite = ctx.checkFile(/state\/sessions\//);
      expect(sessionWrite.written).toBe(true);

      // Should write to daily log (memory/YYYY-MM-DD.md)
      const dailyLogWrite = ctx.checkFile(/memory\/\d{4}-\d{2}-\d{2}\.md/);
      expect(dailyLogWrite.written).toBe(true);
    },
  },
]);
