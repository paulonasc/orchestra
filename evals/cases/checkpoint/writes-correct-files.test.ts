/**
 * Case 4: Checkpoint writes to the correct files.
 *
 * Scenario: Agent makes a trivial edit, then runs /o checkpoint. The checkpoint
 * should write to:
 *   - state/sessions/{id}.md (per-session file)
 *   - memory/YYYY-MM-DD.md (daily log, append-only)
 * It should write only to per-session files, not any legacy shared state.
 *
 * The coding task is intentionally trivial (add a comment). This test evaluates
 * CHECKPOINT behavior, not coding ability. Complex coding tasks cause agents to
 * spend all turns on implementation and skip bookkeeping — a pattern documented
 * across 336 sessions in Gemini CLI issue #22261:
 * https://github.com/google-gemini/gemini-cli/issues/22261
 * "Self-review step skipping (~40% of prompt-embedded checklist sessions)"
 *
 * Principle: test one behavior per eval. Separate coding from bookkeeping.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';
import { CHECKPOINT_WRITES_CORRECT_FILES } from '../helpers/prompts';

defineEvalSuite('checkpoint-writes-correct-files', [
  {
    name: 'checkpoint writes to session file and daily log',
    session: {
      prompt: CHECKPOINT_WRITES_CORRECT_FILES,
      maxTurns: 15,
      timeout: 300_000,
    },
    assert: async (ctx) => {
      // Should write to a session file under state/sessions/
      const sessionWrite = ctx.checkFile(/state\/sessions\//);
      expect(sessionWrite.written).toBe(true);

      // Should write to daily log (memory/YYYY-MM-DD.md)
      const dailyLogWrite = ctx.checkFile(/memory\/\d{4}-\d{2}-\d{2}\.md/);
      expect(dailyLogWrite.written).toBe(true);

      // session-context.md no longer exists — nothing to check for the old pattern.
    },
  },
]);
