/**
 * Regression: After making architectural decisions during a code review,
 * the agent should record them in .orchestra/decisions/ — not just mention
 * them in conversation or write them to gstack/TODOS/random locations.
 *
 * Real failure: Agent made 6 decisions during an eng review (consensus quorum,
 * transaction upserts, SSRF fix, CONCURRENTLY index, divergent guard, infra TODO)
 * and recorded zero of them in .orchestra/decisions/.
 *
 * Tests with and without explicit Orchestra mention in the prompt.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { DECISIONS_RECORDED_AFTER_REVIEW } from './helpers/prompts';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

defineEvalSuite('decisions-recorded-after-review', [
  {
    name: 'agent records architectural decisions in .orchestra/decisions/',
    session: {
      prompt: DECISIONS_RECORDED_AFTER_REVIEW,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const decisionsDir = join(ctx.env.orchestra, 'decisions');

      // Check: were any new decision files created?
      let decisionFiles: string[] = [];
      try {
        const entries = await readdir(decisionsDir);
        decisionFiles = entries.filter(
          (f) => f.endsWith('.md') && f !== '.gitkeep',
        );
      } catch {
        // Directory doesn't exist or can't be read
      }

      // Should have at least 1 decision file (ideally 3, one per decision)
      expect(
        decisionFiles.length,
        `Expected at least 1 decision file in .orchestra/decisions/, found ${decisionFiles.length}: ${decisionFiles.join(', ') || 'none'}`,
      ).toBeGreaterThanOrEqual(1);

      // Check that at least one decision file mentions one of the actual decisions
      let mentionsRealDecision = false;
      for (const file of decisionFiles) {
        const content = await readFile(join(decisionsDir, file), 'utf-8');
        const lower = content.toLowerCase();
        if (
          lower.includes('quorum') ||
          lower.includes('consensus') ||
          lower.includes('transaction') ||
          lower.includes('concurrently') ||
          lower.includes('index')
        ) {
          mentionsRealDecision = true;
          break;
        }
      }

      expect(
        mentionsRealDecision,
        `Decision files exist but none mention the actual decisions (quorum, transaction, concurrently)`,
      ).toBe(true);
    },
  },
]);
