/**
 * Regression: Post-compaction plan writing without SKILL.md context.
 *
 * Reproduces a real failure where, after context compaction in a long session,
 * the agent lost Orchestra awareness and created a random `plans/` directory
 * in the repo root instead of writing to .orchestra/threads/NNN/plan.md.
 *
 * The key difference from plan-writes-to-orchestra.test.ts:
 * - NO .claude/skills/o/SKILL.md installed (simulates post-compaction context loss)
 * - CLAUDE.md has only the 3-line Orchestra rules (what survives compaction)
 * - The prompt does NOT mention Orchestra at all — just "document this plan"
 * - The .orchestra/ directory structure exists on disk (the agent must discover it)
 *
 * This tests whether the agent can find and use .orchestra/ with minimal hints.
 */

import { expect } from 'bun:test';
import { defineEvalSuite, type EvalCase } from './helpers/harness';
import type { TestWorkDir } from './helpers/setup';
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Custom fixture setup: builds the .orchestra/ directory structure but
 * deliberately does NOT install SKILL.md. This simulates the agent's
 * state after context compaction where the skill instructions are gone.
 */
async function setupWithoutSkill(env: TestWorkDir): Promise<void> {
  // Remove the SKILL.md that createTestWorkDir installs by default
  const skillDir = join(env.root, '.claude', 'skills', 'o');
  try {
    await rm(skillDir, { recursive: true, force: true });
  } catch {
    // May not exist if createTestWorkDir didn't create it — that's fine
  }

  // Also remove the hooks from settings.json so the agent doesn't get
  // Orchestra context injected via hook output (simulating post-compaction
  // where hooks ran but their output is no longer in context)
  const settingsPath = join(env.root, '.claude', 'settings.json');
  const settings = {
    permissions: {
      allow: ['Bash(*)', 'Read(*)', 'Edit(*)', 'Write(*)', 'Glob(*)', 'Grep(*)'],
    },
    // No hooks — the agent is flying blind
  };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2));

  // Overwrite CLAUDE.md with the minimal rules that survive compaction.
  // These mention .orchestra/decisions/ but say nothing about plan.md
  // or the thread directory structure.
  await writeFile(
    join(env.root, 'CLAUDE.md'),
    `# Project Rules

## Orchestra

This repo uses Orchestra for multi-agent coordination. State lives in \`.orchestra/\`.

- **Plans** go in \`.orchestra/threads/<active-thread>/plan.md\`
- **Decisions** go in \`.orchestra/decisions/NNN-slug.md\`
- **Research** goes in \`.orchestra/threads/<active-thread>/research.md\`
- \`/o\` shows the dashboard and active thread. \`/o checkpoint\` saves progress.
- When the user says "document this plan", "record this decision", or "save research" — write to the paths above, not to random directories.
`,
  );
}

// The prompt deliberately avoids any mention of Orchestra, .orchestra/,
// threads, or plan.md. It's what a user would naturally say.
const PLAN_PROMPT_NO_ORCHESTRA_CONTEXT = `\
I want to add Redis caching. Document this plan as a principal engineer would.`;

const evalCases: EvalCase[] = [
  {
    name: 'agent writes plan to .orchestra/threads/ without SKILL.md context',
    fixtures: setupWithoutSkill,
    session: {
      prompt: PLAN_PROMPT_NO_ORCHESTRA_CONTEXT,
      maxTurns: 15,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const threadDir = join(ctx.env.orchestra, 'threads', '001-test-feature');

      // Check 1: Did something get written to the thread's plan.md?
      let planWrittenToOrchestra = false;
      try {
        const planContent = await readFile(join(threadDir, 'plan.md'), 'utf-8');
        // plan.md should have substantial content — not just a stub
        planWrittenToOrchestra = planContent.length > 100;
      } catch {
        // File doesn't exist or is unreadable — that's a failure
      }

      // Check 2: Did the agent create rogue directories in the repo root?
      // This is the exact bug we're reproducing: plans/, docs/, etc.
      const rootEntries = await readdir(ctx.env.root);
      const rogueDirectories = rootEntries.filter(
        (entry) =>
          !entry.startsWith('.') &&
          !['src', 'node_modules', 'CLAUDE.md', 'package.json', 'tsconfig.json'].includes(entry) &&
          ['plans', 'docs', 'notes', 'documentation', 'design'].includes(entry),
      );

      // Check 3: Did the agent write a plan.md anywhere outside .orchestra/?
      // Scan for plan-like files in the repo root
      const rootPlanFiles = rootEntries.filter(
        (entry) =>
          entry.toLowerCase().includes('plan') &&
          !entry.startsWith('.'),
      );

      // Log diagnostics for debugging failures
      if (!planWrittenToOrchestra) {
        console.error('[plan-no-skill-context] Plan NOT found in .orchestra/threads/001-test-feature/plan.md');
        console.error('[plan-no-skill-context] Root entries:', rootEntries);
        if (rogueDirectories.length > 0) {
          console.error('[plan-no-skill-context] Rogue directories found:', rogueDirectories);
        }
        if (rootPlanFiles.length > 0) {
          console.error('[plan-no-skill-context] Plan files at root:', rootPlanFiles);
        }
      }

      // The real assertion: plan must be in the Orchestra thread
      expect(planWrittenToOrchestra).toBe(true);

      // No rogue directories should exist
      expect(rogueDirectories).toEqual([]);

      // No plan files at the repo root
      expect(rootPlanFiles).toEqual([]);
    },
  },
];

defineEvalSuite('plan-no-skill-context', evalCases);
