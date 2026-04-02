/**
 * Harder variant: Agent proactively updates verification.md when test results
 * are mentioned in passing, without being asked to record them.
 *
 * The user reports test results as context while asking what to work on next.
 * The agent should recognize these as verification results and update
 * .orchestra/threads/<thread>/verification.md based on CLAUDE.md rules alone.
 *
 * Uses deterministic file-on-disk checks, not an LLM judge.
 */

import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineEvalSuite } from '../helpers/harness';
import { writeVerificationPending } from '../helpers/fixtures';
import { VERIFICATION_NO_EXPLICIT_INSTRUCTION } from '../helpers/prompts';

defineEvalSuite('verification-no-explicit-instruction', [
  {
    name: 'agent proactively updates verification.md when test results are mentioned',
    fixtures: async (env) => {
      await writeVerificationPending(env);
    },
    session: {
      prompt: VERIFICATION_NO_EXPLICIT_INSTRUCTION,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const threadDir = join(ctx.env.orchestra, 'threads', '001-test-feature');
      const verificationPath = join(threadDir, 'verification.md');

      const content = await readFile(verificationPath, 'utf-8');

      // The agent should have updated at least some PENDING items to PASS
      const hasPassMarkers =
        /\[x\]|PASS|pass(ed)?|done|complete|✓|✅/i.test(content);
      expect(
        hasPassMarkers,
        `Expected verification.md to contain PASS markers, got:\n${content}`,
      ).toBe(true);

      // There should be fewer PENDING items than we started with (we had 4)
      const pendingCount = (content.match(/PENDING/g) || []).length;
      expect(
        pendingCount,
        `Expected fewer than 4 PENDING items, found ${pendingCount}`,
      ).toBeLessThan(4);
    },
    timeout: 180_000,
  },
]);
