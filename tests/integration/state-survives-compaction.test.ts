/**
 * Case 9: State survives compaction via the hook chain.
 *
 * Since we cannot trigger real compaction in `claude -p`, we test the hook
 * chain directly: run pre-compact, then post-compact, and verify that:
 *   - Pre-compact added a breadcrumb to the daily log
 *   - Post-compact output contains the thread name and progress
 *   - The session file is still intact after both hooks ran
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOKS_DIR = join(import.meta.dir, '..', '..', 'hooks');

let workDir: string | undefined;

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('state-survives-compaction', () => {
  test(
    'pre-compact + post-compact hook chain preserves state',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'orchestra-eval-compact-'));
      workDir = root;

      const orchestra = join(root, '.orchestra');
      await mkdir(join(orchestra, 'state', 'sessions'), { recursive: true });
      await mkdir(join(orchestra, 'threads', '001-test'), { recursive: true });
      await mkdir(join(orchestra, 'memory'), { recursive: true });
      await mkdir(join(orchestra, '.logs'), { recursive: true });

      // .orchestra.link
      await writeFile(join(root, '.orchestra.link'), `root: ${orchestra}\n`);

      // Active thread
      await writeFile(
        join(orchestra, 'state', 'active-thread.md'),
        '001-test\n',
      );

      // progress.yaml
      await writeFile(
        join(orchestra, 'threads', '001-test', 'progress.yaml'),
        `milestones:
  - name: M0 Setup
    items:
      - name: Project scaffold
        status: done
      - name: CI pipeline
        status: done
      - name: Dev environment
        status: in-progress
  - name: M1 Core
    items:
      - name: User API
        status: pending
`,
      );

      // Session file with real content (simulating mid-session state)
      const sessionId = `20260325-143000-${process.pid}`;
      const sessionFile = join(
        orchestra,
        'state',
        'sessions',
        `${sessionId}.md`,
      );
      const sessionContent = `# Session ${sessionId}
Started: 2026-03-25 14:30:00
PID: ${process.pid}
Repo: test-project

## Working on
Implementing user registration endpoint with email verification

## Progress updates
- Created POST /users endpoint
- Added zod validation for user input
- Set up nodemailer for verification emails

## Decisions made
- Using zod over joi for validation (better TypeScript inference)
- Email verification via signed JWT tokens, not random codes

## Research findings
- nodemailer supports connection pooling for high-volume sends
- JWT email tokens should expire in 24 hours per OWASP guidelines

## Gotchas
- nodemailer requires TLS for Gmail SMTP after May 2025

## Next steps
- Add email verification callback endpoint
- Write integration tests for registration flow
`;
      await writeFile(sessionFile, sessionContent);

      // Determine today's date using bash so it matches what the hooks produce.
      // This avoids UTC vs local timezone mismatches between JS and bash.
      const dateProc = Bun.spawnSync(['date', '+%Y-%m-%d']);
      const today = new TextDecoder().decode(dateProc.stdout).trim();
      await writeFile(
        join(orchestra, 'memory', `${today}.md`),
        `# ${today}\n\n  - Started session ${sessionId}\n`,
      );

      // git init
      Bun.spawnSync(['git', 'init'], { cwd: root });

      // --- Run pre-compact hook ---
      const hookEnv = { ...process.env, HOME: process.env.HOME || '/tmp' };
      const preCompact = Bun.spawn(
        ['bash', join(HOOKS_DIR, 'orchestra-pre-compact.sh')],
        {
          cwd: root,
          env: hookEnv,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const preOutput = await new Response(preCompact.stdout).text();
      await preCompact.exited;

      // Pre-compact should echo session context for the summarizer
      expect(preOutput).toContain('ORCHESTRA SESSION CONTEXT');
      expect(preOutput).toContain('user registration endpoint');

      // Pre-compact should have added a breadcrumb to the daily log.
      // The hook writes to its own $TODAY.md — read ALL daily log files to
      // find the breadcrumb, since timezone edge cases can cause date drift.
      const memoryFiles = await readdir(join(orchestra, 'memory'));
      let foundBreadcrumb = false;
      for (const f of memoryFiles) {
        if (!f.endsWith('.md')) continue;
        const content = await readFile(join(orchestra, 'memory', f), 'utf-8');
        if (content.includes('Context compacted at')) {
          foundBreadcrumb = true;
          break;
        }
      }
      expect(foundBreadcrumb).toBe(true);

      // --- Run post-compact hook ---
      const postCompact = Bun.spawn(
        ['bash', join(HOOKS_DIR, 'orchestra-post-compact.sh')],
        {
          cwd: root,
          env: hookEnv,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const postOutput = await new Response(postCompact.stdout).text();
      await postCompact.exited;

      // Post-compact should contain thread name
      expect(postOutput).toContain('001-test');

      // Post-compact should contain progress info
      expect(postOutput).toContain('Progress:');
      expect(postOutput).toContain('done');

      // Post-compact should reference session context
      expect(postOutput).toContain('Session:');

      // Session file should still exist and be intact
      const sessionAfter = await readFile(sessionFile, 'utf-8');
      expect(sessionAfter).toContain('user registration endpoint');
      expect(sessionAfter).toContain(
        'zod over joi for validation',
      );
      expect(sessionAfter).toContain('nodemailer');
      // Pre-compact should have appended a compaction timestamp
      expect(sessionAfter).toContain('Compacted at');
    },
    10_000,
  );
});
