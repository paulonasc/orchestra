/**
 * Case: Agent updates verification.md after user reports test results.
 *
 * The user tells the agent that tests passed and asks to save progress.
 * The agent should update .orchestra/threads/<thread>/verification.md
 * with PASS markers based on the test results.
 *
 * Uses deterministic file-on-disk checks, not an LLM judge.
 */

import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineEvalSuite } from '../helpers/harness';
import { writeVerificationPending } from '../helpers/fixtures';
import { VERIFICATION_UPDATED_AFTER_TESTS } from '../helpers/prompts';

defineEvalSuite('verification-updated-after-tests', [
  {
    name: 'agent updates verification.md with PASS markers after tests pass',
    fixtures: async (env) => {
      await writeVerificationPending(env);
    },
    session: {
      prompt: VERIFICATION_UPDATED_AFTER_TESTS,
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
