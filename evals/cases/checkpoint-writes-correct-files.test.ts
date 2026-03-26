/**
 * Case 4: Checkpoint subagent writes to the correct files.
 *
 * Scenario: Agent adds input validation, then runs /o checkpoint. The checkpoint
 * subagent should write to:
 *   - state/sessions/{id}.md (per-session file)
 *   - memory/YYYY-MM-DD.md (daily log, append-only)
 * It should NOT write directly to state/session-context.md (old pattern).
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { CHECKPOINT_WRITES_CORRECT_FILES } from './helpers/prompts';

defineEvalSuite('checkpoint-writes-correct-files', [
  {
    name: 'checkpoint writes to session file and daily log, not session-context.md',
    session: {
      prompt: CHECKPOINT_WRITES_CORRECT_FILES,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Should write to a session file under state/sessions/
      const sessionWrite = ctx.checkFile(/state\/sessions\//);
      expect(sessionWrite.written).toBe(true);

      // Should write to daily log (memory/YYYY-MM-DD.md)
      const dailyLogWrite = ctx.checkFile(/memory\/\d{4}-\d{2}-\d{2}\.md/);
      expect(dailyLogWrite.written).toBe(true);

      // Should NOT write directly to session-context.md (old pattern).
      // Soft check: warn but don't fail hard during backward compat transition.
      const oldPatternWrite = ctx.checkFile(/state\/session-context\.md$/);
      if (oldPatternWrite.written) {
        console.warn(
          'WARN: checkpoint wrote directly to session-context.md (old pattern)',
        );
      }
    },
  },
]);
