/**
 * Router eval: /o checkpoint dispatches to commands/checkpoint.md
 *
 * Tests the core router mechanism: when the user invokes /o checkpoint,
 * the agent should Read commands/checkpoint.md (not the full old SKILL.md).
 * Also verifies the agent reads only ONE command file, not multiple.
 *
 * This is a structural test of the split skill architecture.
 * If the router breaks, every subcommand breaks.
 *
 * @origin regression — SKILL.md split into router + command files (v0.3.0).
 *   Router must correctly dispatch to the right command file.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';

defineEvalSuite('router-dispatches-checkpoint', [
  {
    name: 'agent reads commands/checkpoint.md when asked to checkpoint',
    session: {
      prompt: 'Add a comment "// checkpoint test" to src/app.ts, then run /o checkpoint.',
      maxTurns: 15,
      timeout: 300_000,
    },
    assert: async (ctx) => {
      // Router should have caused the agent to Read commands/checkpoint.md
      const readCheck = ctx.checkRead(/commands\/checkpoint\.md/);
      expect(readCheck.read).toBe(true);

      // Agent should have read exactly ONE command file (not dashboard, not close, etc.)
      const commandReads = ctx.countCommandReads();
      expect(commandReads.count).toBe(1);
      expect(commandReads.files).toContain('checkpoint.md');
    },
  },
]);
