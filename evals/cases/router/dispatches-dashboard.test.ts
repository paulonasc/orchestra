/**
 * Router eval: /o (no args) dispatches to commands/dashboard.md
 *
 * Tests that the default /o invocation reads the dashboard command file.
 * The dashboard is the most common entry point — if this breaks, the
 * first thing every user sees is broken.
 *
 * @origin regression — SKILL.md split into router + command files (v0.3.0).
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';

defineEvalSuite('router-dispatches-dashboard', [
  {
    name: 'agent reads commands/dashboard.md for /o with no subcommand',
    session: {
      prompt: 'Run /o to show the Orchestra dashboard.',
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Router should dispatch to dashboard
      const readCheck = ctx.checkRead(/commands\/dashboard\.md/);
      expect(readCheck.read).toBe(true);

      // Should read exactly one command file
      const commandReads = ctx.countCommandReads();
      expect(commandReads.count).toBe(1);
      expect(commandReads.files).toContain('dashboard.md');
    },
  },
]);
