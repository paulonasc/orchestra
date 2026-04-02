/**
 * Eval: Orchestra discovery via .claude/rules/ — compaction survival.
 *
 * Simulates a severe context loss scenario:
 * - NO .claude/skills/o/SKILL.md (agent cannot discover /o skill)
 * - NO CLAUDE.md (no mention of Orchestra rules in instruction file)
 * - NO .claude/settings.json hooks (no session-start injection, no nudge)
 * - YES .claude/rules/orchestra.md (survives — Claude Code injects at session start)
 * - YES .orchestra/ directory on disk with active thread
 *
 * This tests the "realistic worst case" — SKILL.md and CLAUDE.md lost to compaction
 * or deletion, but .claude/rules/ persists (installed by setup link, read by Claude Code).
 *
 * Research (ETH Zurich, "Evaluating AGENTS.md", Feb 2026 — 138 repos, 5,694 PRs):
 * https://arxiv.org/html/2602.11988v1
 * - Passive breadcrumbs (README.md, .gitignore comments, package.json fields) do NOT
 *   reliably change agent behavior (~4% improvement at best)
 * - Active injection (system prompt, rules files) DOES work reliably
 * - .claude/rules/ is an active injection mechanism — Claude Code reads it at session start
 *
 * Does NOT use defineEvalSuite (which auto-installs SKILL.md). Instead, it
 * manually calls createTestWorkDir and strips most Orchestra context.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { rm, unlink, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestWorkDir, cleanupTestWorkDir } from './helpers/setup';
import { runSession } from '../../evals/helpers/session-runner';
import { createProvider } from '../../evals/helpers/providers';
import { judgeBehavior, checkFileWrite } from '../../evals/helpers/judge';

// ---- Config ----

const EVALS_ENABLED = !!process.env.EVALS;
const describeFn = EVALS_ENABLED ? describe : describe.skip;

const ZERO_CONTEXT_PROMPT = `\
I want to add Redis caching to this Express API. Document the plan — options, \
tradeoffs, recommendation, implementation steps.

Think about it as a principal engineer would: consider in-memory vs Redis vs \
Memcached, discuss TTL strategy, cache invalidation approaches, and give a \
clear recommendation with implementation steps.

Write the plan document to disk so we can reference it later.`;

// ---- Test ----

let workDir: string | undefined;

afterAll(async () => {
  if (workDir) await cleanupTestWorkDir(workDir);
});

describeFn('plan-zero-context', () => {
  test(
    'agent with zero Orchestra context discovers .orchestra/ via README.md',
    async () => {
      // 1. Create full test environment (includes SKILL.md, CLAUDE.md, hooks)
      const env = await createTestWorkDir('plan-zero-context');
      workDir = env.root;

      // 2. Strip ALL Orchestra context from the agent's awareness
      //    This simulates a fully compacted session with no memory of Orchestra.

      // Remove SKILL.md so agent cannot discover /o skill
      await rm(join(env.root, '.claude', 'skills'), { recursive: true, force: true });

      // Remove CLAUDE.md so there are no Orchestra rules
      await unlink(join(env.root, 'CLAUDE.md'));

      // Gut settings.json: keep permissions but remove ALL hooks
      // (no session-start injection, no post-tool nudge, no compaction hooks)
      const strippedSettings = {
        permissions: {
          allow: ['Bash(*)', 'Read(*)', 'Edit(*)', 'Write(*)', 'Glob(*)', 'Grep(*)'],
        },
        // No hooks at all
      };
      const { writeFile } = await import('node:fs/promises');
      await writeFile(
        join(env.root, '.claude', 'settings.json'),
        JSON.stringify(strippedSettings, null, 2),
      );

      // Verify: .orchestra/ still exists with active thread (agent CAN find it
      // if it explores, but nothing tells it to look there)
      const activeThread = await readFile(
        join(env.orchestra, 'state', 'active-thread.md'),
        'utf-8',
      );
      expect(activeThread.trim()).toBe('001-test-feature');

      // Experiment 3: .claude/rules/orchestra.md — an active instruction file
      // that Claude Code reads at session start, separate from CLAUDE.md/SKILL.md.
      // The eval strips .claude/skills/ and CLAUDE.md but NOT .claude/rules/.
      // This tests the "realistic worst case" — rules file survives compaction.
      const rulesDir = join(env.root, '.claude', 'rules');
      const { mkdir: mkdirp, writeFile: wf } = await import('node:fs/promises');
      await mkdirp(rulesDir, { recursive: true });
      await wf(
        join(rulesDir, 'orchestra.md'),
        `This project uses Orchestra for coordination.\n\nWhen asked to write a plan, write it to .orchestra/threads/<thread>/plan.md.\nCheck .orchestra/state/active-thread.md for the active thread name.\nDecisions go in .orchestra/decisions/NNN-slug.md.\n`,
      );

      // 3. Run the session with zero Orchestra context (except .claude/rules/)
      const result = await runSession({
        prompt: ZERO_CONTEXT_PROMPT,
        workingDirectory: env.root,
        testName: 'plan-zero-context',
        maxTurns: 12,
        timeout: 180_000,
      });

      console.log(
        `[plan-zero-context] exit=${result.exitReason} turns=${result.turnsUsed} cost=$${result.estimatedCost.toFixed(4)}`,
      );

      // 4. Assertions — what did the agent actually do?

      // Check A: Did the agent write INSIDE .orchestra/ (any subdirectory)?
      // Accepts threads/*/plan.md, decisions/, or any .orchestra/ path.
      const orchestraPlanCheck = checkFileWrite(result.transcript, /\.orchestra\//);

      // Check B: Did the agent create files OUTSIDE .orchestra/?
      // Scan for rogue directories like plans/, docs/, notes/, documentation/
      const rootEntries = await readdir(env.root);
      const rogueEntries = rootEntries.filter(
        (e) =>
          !e.startsWith('.') &&
          !['src', 'node_modules', 'package.json', 'tsconfig.json', 'PLAN.md'].includes(e),
      );

      // Check C: Did the agent write a plan file anywhere outside .orchestra/?
      const roguePlanCheck = checkFileWrite(
        result.transcript,
        /(?<!\.orchestra)\/(plan|plans|docs|notes|documentation)\//,
      );

      // Also scan disk for any new top-level directories
      const newDirs: string[] = [];
      for (const entry of rogueEntries) {
        try {
          const s = await stat(join(env.root, entry));
          if (s.isDirectory()) newDirs.push(entry);
        } catch {
          // file, not dir — also potentially rogue but less concerning
        }
      }

      // Check D: LLM judge — did the agent even TRY to use Orchestra?
      const provider = createProvider();
      const judgeResult = await judgeBehavior(provider, result.transcript, {
        question:
          'Did the agent discover and use the .orchestra/ directory structure to store its plan document?',
        passCriteria:
          'The agent PASSES if it wrote the plan to .orchestra/threads/001-test-feature/plan.md ' +
          'or any path under .orchestra/. The agent FAILS if it wrote the plan to a location ' +
          'outside .orchestra/ (like plans/, docs/, or the repo root), OR if it only printed ' +
          'the plan as text output without writing to any file.',
      });

      // ---- Report ----
      console.log('\n=== PLAN-ZERO-CONTEXT RESULTS ===');
      console.log(`Orchestra plan written: ${orchestraPlanCheck.written}`);
      console.log(`Rogue plan written:     ${roguePlanCheck.written}`);
      console.log(`New top-level dirs:     ${newDirs.length > 0 ? newDirs.join(', ') : '(none)'}`);
      console.log(`Rogue root entries:     ${rogueEntries.length > 0 ? rogueEntries.join(', ') : '(none)'}`);
      console.log(`Judge pass:             ${judgeResult.pass}`);
      console.log(`Judge rationale:        ${judgeResult.rationale}`);
      console.log('=================================\n');

      // ---- .claude/rules/ approach: active injection works ----
      // Research: https://arxiv.org/html/2602.11988v1
      // Passive breadcrumbs fail. Active injection via .claude/rules/ succeeds.
      expect(orchestraPlanCheck.written).toBe(true);

      // Agent should NOT have created rogue directories
      const agentWroteOutsideOrchestra = roguePlanCheck.written || newDirs.length > 0;
      expect(agentWroteOutsideOrchestra).toBe(false);

      // Judge should confirm the agent used Orchestra
      expect(judgeResult.pass).toBe(true);
    },
    300_000, // 5 min timeout — LLM session + judge call
  );
});
