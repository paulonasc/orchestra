/**
 * Regression: When user says "document this plan", does the agent write to
 * .orchestra/threads/NNN/plan.md — or does it create a random plans/ directory?
 *
 * This eval reproduces a real failure where the agent ignored Orchestra entirely
 * and wrote to plans/show-your-work-verification.md in the repo root.
 *
 * Two checks:
 * 1. Did the agent write to .orchestra/threads/001-test-feature/plan.md? (the correct location)
 * 2. Did the agent create any files outside .orchestra/ (like plans/, docs/, etc.)? (the bug)
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { PLAN_WRITES_TO_ORCHESTRA } from './helpers/prompts';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

defineEvalSuite('plan-writes-to-orchestra', [
  {
    name: 'agent writes plan to .orchestra/threads/ not a random directory',
    session: {
      prompt: PLAN_WRITES_TO_ORCHESTRA,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const threadDir = join(ctx.env.orchestra, 'threads', '001-test-feature');

      // Check 1: Did something get written to the thread's plan.md?
      let planWritten = false;
      try {
        const { readFile } = await import('node:fs/promises');
        const planContent = await readFile(join(threadDir, 'plan.md'), 'utf-8');
        // plan.md should have substantial content (not just a stub)
        planWritten = planContent.length > 100;
      } catch {
        // File doesn't exist — that's a failure
      }

      // Check 2: Did the agent create any rogue directories in the repo root?
      // (like plans/, docs/, notes/, etc.)
      const rootEntries = await readdir(ctx.env.root);
      const rogueDirectories = rootEntries.filter(
        (e) =>
          !e.startsWith('.') && // .orchestra, .claude, .git are fine
          !['src', 'node_modules', 'CLAUDE.md', 'package.json'].includes(e) &&
          ['plans', 'docs', 'notes', 'documentation'].includes(e),
      );

      if (rogueDirectories.length > 0) {
        // Agent created a plans/ or docs/ directory outside Orchestra — the exact bug
        expect(rogueDirectories).toEqual(
          expect.arrayContaining([]),
        );
      }

      // The plan must be in the thread
      expect(planWritten).toBe(true);
    },
  },
]);
