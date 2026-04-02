/**
 * Case 7: Session-start hook only injects context relevant to current repo.
 *
 * This is a deterministic hook unit test — no LLM needed. We set up an .orchestra/
 * directory with MEMORY.md entries tagged for different repos and verify that the
 * session-start hook filters correctly when run from a "frontend" repo context.
 *
 * Strategy: Create a temp parent dir, then a "frontend/" subdirectory inside it
 * that acts as the repo root. The .orchestra/ data lives inside "frontend/" and
 * is referenced via .orchestra.link. This way `basename $(pwd)` returns "frontend".
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { rm, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOKS_DIR = join(import.meta.dir, '..', '..', '..', 'hooks');

let parentDir: string | undefined;

afterAll(async () => {
  if (parentDir) await rm(parentDir, { recursive: true, force: true });
});

describe('session-start-relevant-context', () => {
  test(
    'hook output includes frontend entries but excludes api-only entries',
    async () => {
      // Create parent, then a "frontend" subdirectory so basename(pwd) = "frontend"
      parentDir = await mkdtemp(join(tmpdir(), 'orchestra-eval-ctx-'));
      const frontendRepo = join(parentDir, 'frontend');
      await mkdir(frontendRepo, { recursive: true });

      // The .orchestra/ state lives alongside the repo (shared location)
      const orchestra = join(parentDir, 'shared-orchestra');
      await mkdir(join(orchestra, 'state', 'sessions'), { recursive: true });
      await mkdir(join(orchestra, 'threads', '001-test'), { recursive: true });
      await mkdir(join(orchestra, 'memory'), { recursive: true });
      await mkdir(join(orchestra, '.logs'), { recursive: true });

      // .orchestra.link inside the frontend repo points to the shared state
      await writeFile(
        join(frontendRepo, '.orchestra.link'),
        `root: ${orchestra}\n`,
      );

      // Active thread
      await writeFile(
        join(orchestra, 'state', 'active-thread.md'),
        '001-test\n',
      );

      // progress.yaml (minimal)
      await writeFile(
        join(orchestra, 'threads', '001-test', 'progress.yaml'),
        `milestones:
  - name: M0 Setup
    items:
      - name: Scaffold
        status: done
`,
      );

      // MEMORY.md with mixed repo tags
      await writeFile(
        join(orchestra, 'MEMORY.md'),
        `# Project Memory

## Gotchas
- [repo: api] PostgreSQL requires pgvector extension for embeddings
- [repo: frontend] Next.js App Router does not support middleware in layout.tsx
- [repo: api] Rate limiting middleware must be added before auth middleware
- Always use UTC timestamps in logs
- [repo: frontend] Tailwind purge config must include components/ directory
- [repo: infra] Terraform state is stored in S3, never local
`,
      );

      // Today's daily log with mixed entries.
      // Use bash `date` to get the exact same date the hooks will produce,
      // avoiding UTC vs local timezone mismatches between JS and bash.
      const dateProc = Bun.spawnSync(['date', '+%Y-%m-%d']);
      const today = new TextDecoder().decode(dateProc.stdout).trim();
      await writeFile(
        join(orchestra, 'memory', `${today}.md`),
        `# ${today}

## Activity
  - [session: 20260325-100000-111] Added user endpoints [repo: api]
  - [session: 20260325-100000-222] Fixed Tailwind config [repo: frontend]
  - [session: 20260325-110000-333] Updated terraform modules [repo: infra]
  - Reviewed PR feedback across all repos
`,
      );

      // git init inside the frontend repo so hooks can run
      Bun.spawnSync(['git', 'init'], { cwd: frontendRepo });
      await writeFile(join(frontendRepo, 'README.md'), '# Frontend\n');
      Bun.spawnSync(['git', 'add', '-A'], { cwd: frontendRepo });
      Bun.spawnSync(['git', 'commit', '-m', 'init'], {
        cwd: frontendRepo,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      });

      // Run session-start hook from the "frontend" directory
      const proc = Bun.spawn(
        ['bash', join(HOOKS_DIR, 'orchestra-session-start.sh')],
        {
          cwd: frontendRepo,
          env: {
            ...process.env,
            HOME: process.env.HOME || '/tmp',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      // --- MEMORY.md filtering ---

      // Should include frontend-tagged entries
      expect(output).toContain('Next.js App Router');
      expect(output).toContain('Tailwind purge config');

      // Should include untagged (global) entries
      expect(output).toContain('UTC timestamps');

      // Should NOT include api-only entries
      expect(output).not.toContain('pgvector');
      expect(output).not.toContain(
        'Rate limiting middleware must be added before auth',
      );

      // Should NOT include infra-only entries
      expect(output).not.toContain('Terraform state is stored in S3');

      // --- Daily log filtering ---

      // Should include frontend entries and untagged global entries
      expect(output).toContain('Fixed Tailwind config');
      expect(output).toContain('Reviewed PR feedback');

      // Should NOT include api-only or infra-only daily log entries
      expect(output).not.toContain('Added user endpoints');
      expect(output).not.toContain('Updated terraform modules');
    },
    10_000,
  );
});
