/**
 * Shared test harness for Orchestra behavioral evals.
 *
 * Eliminates boilerplate from individual test files by handling:
 * - The EVALS environment gate (skip when EVALS is not set)
 * - Working directory lifecycle (create + cleanup)
 * - The run -> assert pipeline
 *
 * Test files become minimal config objects instead of 80-line scripts.
 */

import { describe, test, afterAll } from 'bun:test';
import { createTestWorkDir, cleanupTestWorkDir, type TestWorkDir } from './setup';
import { runSession, type SessionOptions, type SessionResult } from '../../helpers/session-runner';
import { judgeBehavior, checkSkillInvocation, checkFileWrite, checkFileRead, countCommandFileReads, type JudgeResult } from '../../helpers/judge';
import { createProvider, type LLMProvider } from '../../helpers/providers';

// ---- Public types ----

export interface EvalAssertionContext {
  result: SessionResult;
  provider: LLMProvider;
  env: TestWorkDir;
  /** Convenience: check if the agent invoked a skill */
  checkSkill: (skillName: string) => { invoked: boolean; args?: string };
  /** Convenience: check if the agent wrote to a file matching the pattern */
  checkFile: (pattern: string | RegExp) => { written: boolean; content?: string };
  /** Convenience: check if the agent Read a file matching the pattern */
  checkRead: (pattern: string | RegExp) => { read: boolean; paths: string[] };
  /** Convenience: count distinct command files the agent Read */
  countCommandReads: () => { count: number; files: string[] };
  /** Convenience: run the LLM judge on the transcript */
  judge: (check: { question: string; passCriteria: string }) => Promise<JudgeResult>;
}

export interface EvalCase {
  name: string;
  /** Files to create in the working dir before running the session */
  fixtures?: (env: TestWorkDir) => Promise<void>;
  /** Session options. workingDirectory is auto-filled from the test env. */
  session: Omit<SessionOptions, 'workingDirectory' | 'testName'>;
  /** Assertions to run on the session result */
  assert: (ctx: EvalAssertionContext) => Promise<void>;
  /** Per-test timeout in ms (default: 180_000 for LLM tests) */
  timeout?: number;
}

export interface EvalSuiteOptions {
  /** Whether this suite requires the EVALS env var to run (default: true) */
  requireEvals?: boolean;
}

// ---- Implementation ----

/**
 * Define and register an eval suite. Handles the EVALS gate, working directory
 * lifecycle, session execution, and assertion plumbing.
 *
 * Usage:
 *   defineEvalSuite('my-suite', [{ name: '...', session: {...}, assert: async (ctx) => {...} }]);
 */
export function defineEvalSuite(
  suiteName: string,
  cases: EvalCase[],
  options: EvalSuiteOptions = {},
): void {
  const requireEvals = options.requireEvals !== false;
  const evalsEnabled = !requireEvals || !!process.env.EVALS;
  const describeFn = evalsEnabled ? describe : describe.skip;

  // Track working directories for cleanup
  const workDirs: string[] = [];

  afterAll(async () => {
    for (const dir of workDirs) {
      await cleanupTestWorkDir(dir);
    }
  });

  describeFn(suiteName, () => {
    for (const evalCase of cases) {
      const timeout = evalCase.timeout ?? 180_000;

      test(
        evalCase.name,
        async () => {
          // 1. Create isolated working directory
          const slug = suiteName.replace(/[^a-zA-Z0-9-]/g, '-');
          const env = await createTestWorkDir(slug);
          workDirs.push(env.root);

          // 2. Populate fixtures if provided
          if (evalCase.fixtures) {
            await evalCase.fixtures(env);
          }

          // 3. Run the agent session
          const result = await runSession({
            ...evalCase.session,
            workingDirectory: env.root,
            testName: suiteName,
          });

          // 3b. Log non-success sessions for debugging
          if (result.exitReason !== 'success') {
            console.error(`[${suiteName}] exit=${result.exitReason} turns=${result.turnsUsed} transcript=${result.transcript.length}`);
          }

          // 4. Build assertion context with convenience helpers
          const provider = createProvider();
          const ctx: EvalAssertionContext = {
            result,
            provider,
            env,
            checkSkill: (skillName: string) =>
              checkSkillInvocation(result.transcript, skillName),
            checkFile: (pattern: string | RegExp) =>
              checkFileWrite(result.transcript, pattern),
            checkRead: (pattern: string | RegExp) =>
              checkFileRead(result.transcript, pattern),
            countCommandReads: () =>
              countCommandFileReads(result.transcript),
            judge: (check: { question: string; passCriteria: string }) =>
              judgeBehavior(provider, result.transcript, check),
          };

          // 5. Run user-defined assertions
          await evalCase.assert(ctx);
        },
        timeout,
      );
    }
  });
}
