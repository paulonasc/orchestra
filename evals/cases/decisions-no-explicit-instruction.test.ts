/**
 * Harder variant: agent makes decisions during implementation work and should
 * record them in .orchestra/decisions/ WITHOUT being told "record them."
 *
 * The prompt simulates a natural conversation where decisions emerge from
 * discussion — the agent should recognize them as decisions and record them
 * based on CLAUDE.md rules alone.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const IMPLICIT_DECISIONS_PROMPT = `\
I've been thinking about the verification system. Let's go with these approaches:

- For the consensus threshold, require at least 2 independent agents to agree before
  auto-updating a product field. One agent alone shouldn't be able to change data.
- For the database writes, wrap the verification upsert in a transaction so we don't
  get partial writes if the process crashes mid-update.

Makes sense? Go ahead and note these down before we start implementing.`;

defineEvalSuite('decisions-no-explicit-instruction', [
  {
    name: 'agent recognizes decisions and writes to .orchestra/decisions/ without being told',
    session: {
      prompt: IMPLICIT_DECISIONS_PROMPT,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const decisionsDir = join(ctx.env.orchestra, 'decisions');

      let decisionFiles: string[] = [];
      try {
        const entries = await readdir(decisionsDir);
        decisionFiles = entries.filter(
          (f) => f.endsWith('.md') && f !== '.gitkeep',
        );
      } catch {
        // Directory doesn't exist
      }

      // Should have at least 1 decision file
      expect(
        decisionFiles.length,
        `Expected at least 1 decision file in .orchestra/decisions/, found ${decisionFiles.length}`,
      ).toBeGreaterThanOrEqual(1);

      // Verify content mentions one of the actual decisions
      let mentionsRealDecision = false;
      for (const file of decisionFiles) {
        const content = await readFile(join(decisionsDir, file), 'utf-8');
        const lower = content.toLowerCase();
        if (
          lower.includes('quorum') ||
          lower.includes('consensus') ||
          lower.includes('transaction') ||
          lower.includes('2 agent') ||
          lower.includes('two agent')
        ) {
          mentionsRealDecision = true;
          break;
        }
      }

      expect(
        mentionsRealDecision,
        `Decision files exist but none mention the actual decisions`,
      ).toBe(true);
    },
  },
]);
