/**
 * Case: Checkpoint updates thread files (progress.yaml, verification.md) and MEMORY.md.
 *
 * Regression test for the v2 checkpoint rewrite that accidentally stopped writing
 * to thread files. The checkpoint subagent should update:
 *   - threads/NNN-slug/progress.yaml — mark completed items as done
 *   - threads/NNN-slug/verification.md — record test results (PASS/FAIL)
 *   - state/sessions/{id}.md — session state (this always worked)
 *
 * Uses deterministic file-on-disk checks, not an LLM judge.
 */

import { expect } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineEvalSuite } from './helpers/harness';
import { writeAuthMigrationThread } from './helpers/fixtures';
import { CHECKPOINT_UPDATES_THREAD_FILES } from './helpers/prompts';

defineEvalSuite('checkpoint-updates-thread-files', [
  {
    name: 'checkpoint writes to progress.yaml, verification.md, and session file',
    fixtures: async (env) => {
      await writeAuthMigrationThread(env);
    },
    session: {
      prompt: CHECKPOINT_UPDATES_THREAD_FILES,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const orchestra = ctx.env.orchestra;
      const threadDir = join(orchestra, 'threads', '001-test-feature');

      // --- Check 1: session file was written (this works today) ---
      const sessionsDir = join(orchestra, 'state', 'sessions');
      const sessionFiles = await readdir(sessionsDir);
      const mdFiles = sessionFiles.filter((f) => f.endsWith('.md'));
      expect(mdFiles.length).toBeGreaterThanOrEqual(1);

      // --- Check 2: progress.yaml has items marked done (REGRESSION) ---
      const progressContent = await readFile(
        join(threadDir, 'progress.yaml'),
        'utf-8',
      );
      // The auth middleware and token refresh items were in-progress;
      // after checkpoint they should be marked done
      const doneCount = (progressContent.match(/status:\s*done/g) || []).length;
      // We started with 2 done items (scaffold, CI/CD) + the agent should
      // mark at least auth middleware and token refresh as done = 4+ total
      expect(doneCount).toBeGreaterThanOrEqual(4);

      // The in-progress items for auth should no longer be in-progress
      // (they should have been flipped to done)
      const lines = progressContent.split('\n');
      let authMiddlewareStatus = '';
      let tokenRefreshStatus = '';
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Auth middleware')) {
          const statusLine = lines.find(
            (l, j) => j > i && j <= i + 2 && l.includes('status:'),
          );
          if (statusLine) authMiddlewareStatus = statusLine.trim();
        }
        if (lines[i].includes('Token refresh')) {
          const statusLine = lines.find(
            (l, j) => j > i && j <= i + 2 && l.includes('status:'),
          );
          if (statusLine) tokenRefreshStatus = statusLine.trim();
        }
      }
      expect(authMiddlewareStatus).toContain('done');
      expect(tokenRefreshStatus).toContain('done');

      // --- Check 3: verification.md has PASS entries (REGRESSION) ---
      const verificationContent = await readFile(
        join(threadDir, 'verification.md'),
        'utf-8',
      );
      // The checkpoint should have updated at least some PENDING items
      // to reflect that tests passed. We look for common pass markers:
      // [x], PASS, pass, passed, check marks, etc.
      const hasPassMarkers =
        /\[x\]|PASS|pass(ed)?|done|complete/i.test(verificationContent);
      expect(hasPassMarkers).toBe(true);

      // There should be fewer PENDING items than we started with (we had 4)
      const pendingCount = (
        verificationContent.match(/PENDING/g) || []
      ).length;
      expect(pendingCount).toBeLessThan(4);
    },
    timeout: 180_000,
  },
]);
