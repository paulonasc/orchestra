/**
 * Router eval: /o close dispatches to commands/close.md
 *
 * Tests routing for thread closure. Also verifies that the "shipped"
 * routing rule (from CLAUDE.md) correctly triggers /o close which
 * then reads the close command file.
 *
 * @origin regression — SKILL.md split into router + command files (v0.3.0).
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';

defineEvalSuite('router-dispatches-close', [
  {
    name: 'agent reads commands/close.md when asked to close a thread',
    session: {
      prompt: 'Run /o close to mark the current thread as completed.',
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Router should dispatch to close
      const readCheck = ctx.checkRead(/commands\/close\.md/);
      expect(readCheck.read).toBe(true);

      // Should read exactly one command file
      const commandReads = ctx.countCommandReads();
      expect(commandReads.count).toBe(1);
      expect(commandReads.files).toContain('close.md');
    },
  },
]);
