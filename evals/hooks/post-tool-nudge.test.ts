import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Unit tests for the post-tool-nudge hook.
 *
 * These tests run the actual hook script via Bun.spawn in an isolated
 * temp directory with a mock .orchestra.link and .orchestra/.logs/ setup.
 * No LLM needed — purely tests the bash logic.
 */

const HOOK_SCRIPT = join(import.meta.dir, '..', '..', 'hooks', 'orchestra-post-tool-nudge.sh');

let tempDir: string;
let orchRoot: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orchestra-test-'));
  orchRoot = join(tempDir, '.orchestra');
  mkdirSync(join(orchRoot, '.logs'), { recursive: true });

  // Create .orchestra.link in the working directory pointing to our mock
  writeFileSync(
    join(tempDir, '.orchestra.link'),
    `root: ${orchRoot}\n`
  );
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Run the nudge hook in the temp directory with a given session ID.
 * Returns { stdout, exitCode }.
 */
async function runHook(
  sessionId: string = 'test-session'
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(['bash', HOOK_SCRIPT], {
    cwd: tempDir,
    env: {
      ...process.env,
      ORCHESTRA_SESSION_ID: sessionId,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

/**
 * Get the current edit count for a session.
 */
function getEditCount(sessionId: string = 'test-session'): number {
  const counterFile = join(orchRoot, '.logs', `edit-count-${sessionId}`);
  try {
    return parseInt(readFileSync(counterFile, 'utf-8').trim(), 10);
  } catch {
    return 0;
  }
}

describe('post-tool-nudge hook', () => {
  test('counter increments on each run', async () => {
    await runHook();
    expect(getEditCount()).toBe(1);

    await runHook();
    expect(getEditCount()).toBe(2);

    await runHook();
    expect(getEditCount()).toBe(3);
  });

  test('no output when counter < threshold', async () => {
    // Run 9 times (below default threshold of 10)
    for (let i = 0; i < 9; i++) {
      const result = await runHook();
      expect(result.stdout).toBe('');
    }
    expect(getEditCount()).toBe(9);
  });

  test('outputs nudge message when counter >= threshold', async () => {
    // Run 10 times to hit the threshold
    let lastResult = { stdout: '', exitCode: 0 };
    for (let i = 0; i < 10; i++) {
      lastResult = await runHook();
    }

    expect(lastResult.stdout).toContain('Orchestra:');
    expect(lastResult.stdout).toContain('10 edits');
    expect(lastResult.stdout).toContain('checkpoint');
  });

  test('continues to nudge after threshold', async () => {
    // Run 12 times
    for (let i = 0; i < 11; i++) {
      await runHook();
    }

    const result = await runHook();
    expect(result.stdout).toContain('Orchestra:');
    expect(result.stdout).toContain('12 edits');
  });

  test('per-session counter files do not interfere', async () => {
    // Run 5 times for session A
    for (let i = 0; i < 5; i++) {
      await runHook('session-a');
    }

    // Run 3 times for session B
    for (let i = 0; i < 3; i++) {
      await runHook('session-b');
    }

    // Verify counts are independent
    expect(getEditCount('session-a')).toBe(5);
    expect(getEditCount('session-b')).toBe(3);
  });

  test('exits with code 0 even on nudge', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await runHook();
      expect(result.exitCode).toBe(0);
    }
  });

  test('handles missing counter file gracefully', async () => {
    // First run — no counter file exists yet
    const result = await runHook();
    expect(result.exitCode).toBe(0);
    expect(getEditCount()).toBe(1);
  });
});
