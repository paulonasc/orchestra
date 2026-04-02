/**
 * Shared test setup for Orchestra behavioral evals.
 *
 * Creates isolated working directories with a realistic .orchestra/ structure,
 * installed SKILL.md, hooks, and sample source files. Each test gets its own
 * temp dir that is cleaned up after.
 *
 * IMPORTANT: This calls the REAL setup script (init + link) so that routing rules,
 * hooks, SKILL.md, and rules/ are never hand-duplicated here. If setup changes,
 * evals automatically pick up the new behavior.
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Resolve Orchestra source root relative to this file (evals/cases/helpers/ → repo root)
const ORCHESTRA_SRC = join(import.meta.dir, '..', '..', '..');

/** Paths inside a test working directory. */
export interface TestWorkDir {
  root: string; // The git repo root
  orchestra: string; // .orchestra/ inside root
  hooksDir: string; // Source hooks directory (from real Orchestra)
}

/**
 * Create a self-contained test working directory with Orchestra fully installed.
 *
 * Includes:
 * - .orchestra/ with state/, threads/, decisions/, memory/, .logs/
 * - .orchestra.link pointing to the local .orchestra/
 * - Active thread with sample progress
 * - .claude/skills/o/SKILL.md from the real source
 * - .claude/settings.json with hooks wired up
 * - CLAUDE.md with Orchestra rules
 * - .claude/rules/orchestra.md (compaction-safe routing)
 * - git init + initial commit
 * - Sample source files under src/
 */
export async function createTestWorkDir(name: string): Promise<TestWorkDir> {
  const root = await mkdtemp(join(tmpdir(), `orchestra-eval-${name}-`));
  const orchestra = join(root, '.orchestra');
  const hooksDir = join(ORCHESTRA_SRC, 'hooks');

  // --- Sample source files (eval-specific) ---
  const srcDir = join(root, 'src');
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    join(srcDir, 'app.ts'),
    `import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
`,
  );

  await writeFile(
    join(srcDir, 'utils.ts'),
    `export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}
`,
  );

  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
        dependencies: {
          express: '^4.18.0',
        },
        orchestra: {
          root: '.orchestra',
          plans: '.orchestra/threads',
          decisions: '.orchestra/decisions',
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          outDir: 'dist',
          strict: true,
        },
        include: ['src'],
      },
      null,
      2,
    ),
  );

  // --- git init + initial commit (must happen BEFORE setup init) ---
  const exec = Bun.spawnSync;
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  exec(['git', 'init'], { cwd: root });
  exec(['git', 'add', '-A'], { cwd: root });
  exec(['git', 'commit', '-m', 'Initial commit', '--allow-empty'], {
    cwd: root,
    env: gitEnv,
  });

  // --- Use the REAL setup to install Orchestra — single source of truth. ---
  // ORCHESTRA_STATE_DIR sandboxes state writes to the test dir (not real ~/.orchestra-state/).
  const testStateDir = join(root, '.test-orchestra-state');
  const setupScript = join(ORCHESTRA_SRC, 'setup');

  // Run setup init (creates .orchestra/ with all state files, README, git repo)
  const initResult = Bun.spawnSync(
    ['bash', setupScript, 'init', root],
    { cwd: ORCHESTRA_SRC, env: { ...process.env, ORCHESTRA_STATE_DIR: testStateDir } },
  );
  if (initResult.exitCode !== 0) {
    throw new Error(`setup init failed: ${initResult.stderr.toString()}`);
  }

  // Run setup link (installs SKILL.md, commands/, reference/, hooks, CLAUDE.md, rules)
  const linkResult = Bun.spawnSync(
    ['bash', setupScript, 'link', root],
    { cwd: ORCHESTRA_SRC, env: { ...process.env, ORCHESTRA_STATE_DIR: testStateDir } },
  );
  if (linkResult.exitCode !== 0) {
    throw new Error(`setup link failed: ${linkResult.stderr.toString()}`);
  }

  // --- Eval-specific state (on top of what setup created) ---

  // Create active thread directory
  const threadDir = join(orchestra, 'threads', '001-test-feature');
  await mkdir(threadDir, { recursive: true });

  // Active thread pointer
  await writeFile(
    join(orchestra, 'state', 'active-thread.md'),
    '001-test-feature\n',
  );

  // Sample progress.yaml
  await writeFile(
    join(threadDir, 'progress.yaml'),
    `milestones:
  - name: M0 Setup
    items:
      - name: Project scaffold
        status: done
      - name: CI/CD pipeline
        status: done
      - name: Dev environment
        status: in-progress
  - name: M1 Core Features
    items:
      - name: User endpoints
        status: pending
      - name: Auth middleware
        status: pending
      - name: Input validation
        status: pending
`,
  );

  // Sample plan.md
  await writeFile(
    join(threadDir, 'plan.md'),
    `# Plan: Test Feature

## M0 - Setup
1. Project scaffold
2. CI/CD pipeline
3. Dev environment

## M1 - Core Features
4. User endpoints
5. Auth middleware
6. Input validation
`,
  );

  return { root, orchestra, hooksDir };
}

/**
 * Clean up a test working directory.
 */
export async function cleanupTestWorkDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
