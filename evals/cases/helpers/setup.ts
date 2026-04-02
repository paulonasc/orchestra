/**
 * Shared test setup for Orchestra behavioral evals.
 *
 * Creates isolated working directories with a realistic .orchestra/ structure,
 * installed SKILL.md, hooks, and sample source files. Each test gets its own
 * temp dir that is cleaned up after.
 */

import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
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
 * - .claude/settings.json with PostToolUse hook wired up
 * - CLAUDE.md with simplified Orchestra rules
 * - git init + initial commit
 * - Sample source files under src/
 */
export async function createTestWorkDir(name: string): Promise<TestWorkDir> {
  const root = await mkdtemp(join(tmpdir(), `orchestra-eval-${name}-`));
  const orchestra = join(root, '.orchestra');
  const hooksDir = join(ORCHESTRA_SRC, 'hooks');

  // Create .orchestra/ directory structure
  const dirs = [
    join(orchestra, 'state', 'sessions'),
    join(orchestra, 'threads', '001-test-feature'),
    join(orchestra, 'decisions'),
    join(orchestra, 'memory'),
    join(orchestra, '.logs'),
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Discovery README.md — helps agents find .orchestra/ without external context
  await writeFile(
    join(orchestra, 'README.md'),
    `# .orchestra/ — Multi-agent coordination state

This directory is managed by [Orchestra](https://github.com/orchestrahq/orchestra).

## For AI agents

If you find this directory, you should use it for coordination state:
- **Plans** go in \`threads/<active-thread>/plan.md\`
- **Decisions** go in \`decisions/NNN-slug.md\`
- **Research** goes in \`threads/<active-thread>/research.md\`
- **Verification** results go in \`threads/<active-thread>/verification.md\`
- Check \`state/active-thread.md\` to find the current active thread.

## Structure

\`\`\`
.orchestra/
├── MEMORY.md           # permanent project memory
├── state/
│   └── active-thread.md  # current thread name
├── threads/            # per-thread workspaces
│   └── NNN-slug/
│       ├── plan.md
│       ├── spec.md
│       ├── progress.yaml
│       └── verification.md
├── decisions/          # architectural decision records
└── memory/             # daily logs
\`\`\`

Run \`/o\` in Claude Code for the full dashboard.
`,
  );

  // .orchestra.link so hooks can find the root
  await writeFile(join(root, '.orchestra.link'), `root: ${orchestra}\n`);

  // Active thread
  await writeFile(
    join(orchestra, 'state', 'active-thread.md'),
    '001-test-feature\n',
  );

  // Sample progress.yaml
  await writeFile(
    join(orchestra, 'threads', '001-test-feature', 'progress.yaml'),
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
    join(orchestra, 'threads', '001-test-feature', 'plan.md'),
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

  // Install SKILL.md
  const skillDir = join(root, '.claude', 'skills', 'o');
  await mkdir(skillDir, { recursive: true });

  const rawSkill = await readFile(join(ORCHESTRA_SRC, 'SKILL.md'), 'utf-8');
  const installedSkill = rawSkill
    .replace(/__ORCHESTRA_BIN__/g, join(ORCHESTRA_SRC, 'bin'))
    .replace(/__ORCHESTRA_DIR__/g, ORCHESTRA_SRC);
  await writeFile(join(skillDir, 'SKILL.md'), installedSkill);

  // Install .claude/settings.json with hooks (including PostToolUse nudge)
  const settings = {
    permissions: {
      allow: ['Bash(*)', 'Read(*)', 'Edit(*)', 'Write(*)', 'Skill(*)'],
    },
    hooks: {
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [
            {
              type: 'command',
              command: `bash ${hooksDir}/orchestra-post-tool-nudge.sh`,
            },
          ],
        },
      ],
      SessionStart: [
        {
          matcher: 'startup|resume',
          hooks: [
            {
              type: 'command',
              command: `bash ${hooksDir}/orchestra-session-start.sh`,
            },
          ],
        },
        {
          matcher: 'compact',
          hooks: [
            {
              type: 'command',
              command: `bash ${hooksDir}/orchestra-post-compact.sh`,
            },
          ],
        },
      ],
      PreCompact: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: `bash ${hooksDir}/orchestra-pre-compact.sh`,
            },
          ],
        },
      ],
    },
  };
  await writeFile(
    join(root, '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2),
  );

  // CLAUDE.md with Orchestra routing rules (must match setup's orchestra_rules_block())
  await writeFile(
    join(root, 'CLAUDE.md'),
    `# Project Rules

## Orchestra

This repo uses Orchestra for multi-agent coordination. State lives in \`.orchestra/\`.

When the user's request matches a pattern below, ALWAYS act on it BEFORE responding directly:

- User says "done", "looks good", "that's working", "all set", "that's all", "nice work" → run \`/o checkpoint\` BEFORE responding
- User says "merged", "shipped", "deployed" → run \`/o close\`
- User says "plan this", "write a plan", "document the plan" → write to \`.orchestra/threads/<active-thread>/plan.md\`
- User says "record this decision", "we decided", "let's go with" → write to \`.orchestra/decisions/NNN-slug.md\`
- User mentions test results ("tests passed", "0 failures", "build clean") → update verification.md FIRST, then respond
- User says "what's the status", "where are we" → run \`/o\`

**Do NOT skip Orchestra writes to answer the user faster.** The write takes 5 seconds. Losing state costs 20 minutes next session.
`,
  );

  // .claude/rules/orchestra.md — strongest persistence layer (survives compaction)
  const rulesDir = join(root, '.claude', 'rules');
  await mkdir(rulesDir, { recursive: true });
  await writeFile(
    join(rulesDir, 'orchestra.md'),
    `This project uses Orchestra for coordination. State lives in .orchestra/.

MANDATORY: When the user signals completion ("done", "looks good", "that's working",
"all set", "that's all", "nice work"), invoke /o checkpoint BEFORE responding.
This is your LAST tool call before any text response. State is lost if you skip this.

Plans go in .orchestra/threads/<thread>/plan.md.
Check .orchestra/state/active-thread.md for the active thread name.
Decisions go in .orchestra/decisions/NNN-slug.md.
`,
  );

  // Sample source files
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

  // .gitignore — the descriptive comment acts as a breadcrumb for agents
  // that explore the repo without CLAUDE.md or SKILL.md context.
  await writeFile(
    join(root, '.gitignore'),
    `.orchestra.link
# Orchestra — multi-agent coordination (plans, decisions, research go here)
.orchestra/
node_modules/
dist/
`,
  );

  // git init + initial commit
  const exec = Bun.spawnSync;
  exec(['git', 'init'], { cwd: root });
  exec(['git', 'add', '-A'], { cwd: root });
  exec(['git', 'commit', '-m', 'Initial commit', '--allow-empty'], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    },
  });

  return { root, orchestra, hooksDir };
}

/**
 * Clean up a test working directory.
 */
export async function cleanupTestWorkDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
