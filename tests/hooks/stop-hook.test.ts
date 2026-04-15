/**
 * Unit tests for the stop hook (hooks/orchestra-stop.sh).
 *
 * Three bugs are being fixed concurrently:
 *   Bug 1 — recursion guard matched JSON key regardless of value, so the hook
 *            always exited early when Claude Code sent {"stop_hook_active": false}.
 *            Fix: grep for '"stop_hook_active": *true'.
 *   Bug 2 — hook_stop event was missing session_id and duration_s.
 *            Fix: write start-time file at session_start and compute duration.
 *   Bug 3 — session_start did not write a start-time file (separate test file).
 *
 * Tests are written against the FIXED behaviour:
 *   - Recursion guard tests FAIL on the buggy code (grep match too broad).
 *   - session_id / duration_s tests FAIL on the buggy code (fields absent).
 *   - exit-code and always-writes tests PASS on both old and new code.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const HOOK_SCRIPT = join(import.meta.dir, '..', '..', 'hooks', 'orchestra-stop.sh');

let tempDir: string;
let orchRoot: string;
let stateDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orch-stop-test-'));
  orchRoot = join(tempDir, '.orchestra');
  stateDir = join(tempDir, '.orchestra-state');
  mkdirSync(join(orchRoot, '.logs'), { recursive: true });
  mkdirSync(join(orchRoot, 'memory'), { recursive: true });
  mkdirSync(join(orchRoot, 'state', 'sessions'), { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  // Point .orchestra.link at our mock .orchestra/ dir
  writeFileSync(join(tempDir, '.orchestra.link'), `root: ${orchRoot}\n`);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Read the telemetry log, return all lines parsed as JSON. */
function readTelemetryLines(): Array<Record<string, unknown>> {
  const logPath = join(orchRoot, '.logs', 'telemetry.jsonl');
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));
}

/** Count lines with a specific event field. */
function countEvents(event: string): number {
  return readTelemetryLines().filter(e => e.event === event).length;
}

/**
 * Run the stop hook with the given JSON input on stdin.
 * Returns { exitCode }.
 */
async function runStopHook(
  input: Record<string, unknown> = {},
  sessionId = 'test-session'
): Promise<{ exitCode: number }> {
  const proc = Bun.spawn(['bash', HOOK_SCRIPT], {
    cwd: tempDir,
    env: {
      ...process.env,
      ORCHESTRA_SESSION_ID: sessionId,
      ORCHESTRA_STATE_DIR: stateDir,
    },
    stdin: new TextEncoder().encode(JSON.stringify(input)),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  return { exitCode };
}

describe('stop hook — recursion guard', () => {
  /**
   * BUG 1: Before the fix, grep matched '"stop_hook_active"' (key only),
   * so passing false still triggered the early-exit. This test FAILS on
   * the buggy code and PASSES after the fix.
   */
  test('stop_hook_active: false — writes hook_stop event', async () => {
    await runStopHook({ stop_hook_active: false });

    const lines = readTelemetryLines();
    expect(lines.length).toBeGreaterThan(0);

    const last = lines[lines.length - 1];
    expect(last.event).toBe('hook_stop');
  });

  /**
   * stop_hook_active: true — must NOT write a new hook_stop line.
   * This is the correct guard behaviour. It should pass on both old and new code
   * because even the buggy grep matches the true case. Included for completeness.
   */
  test('stop_hook_active: true — exits without writing hook_stop', async () => {
    // Pre-seed a sentinel line so we can detect if a new line was appended
    const logPath = join(orchRoot, '.logs', 'telemetry.jsonl');
    writeFileSync(logPath, '{"ts":"2000-01-01T00:00:00Z","event":"sentinel"}\n');

    await runStopHook({ stop_hook_active: true });

    const lines = readTelemetryLines();
    // Should still only have the sentinel — no hook_stop appended
    expect(lines.filter(e => e.event === 'hook_stop').length).toBe(0);
    expect(lines[0].event).toBe('sentinel');
  });

  /**
   * BUG 1 (robustness): No stop_hook_active key at all must also write the event.
   * Fails on buggy code if the grep matches an absent key (it won't — so this
   * actually passes on the old code too, but confirms the fix didn't break it).
   */
  test('stop_hook_active absent — writes hook_stop event', async () => {
    await runStopHook({});

    const lines = readTelemetryLines();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[lines.length - 1].event).toBe('hook_stop');
  });
});

describe('stop hook — hook_stop event fields', () => {
  /**
   * BUG 2: Before the fix, the event had no session_id field.
   * FAILS on buggy code, PASSES after fix.
   */
  test('event includes session_id', async () => {
    await runStopHook({ stop_hook_active: false }, 'test-session-123');

    const lines = readTelemetryLines();
    const stopEvent = lines.find(e => e.event === 'hook_stop');
    expect(stopEvent).toBeDefined();
    expect(stopEvent!.session_id).toBe('test-session-123');
  });

  /**
   * BUG 2: Before the fix, event had no duration_s field at all.
   * With the fix, duration_s is a non-negative number when the start-time file exists.
   * FAILS on buggy code, PASSES after fix.
   */
  test('event includes duration_s when start-time file exists', async () => {
    const sessionId = 'dur-session';
    // Write a start timestamp 10 seconds in the past
    const startTs = Math.floor(Date.now() / 1000) - 10;
    const startFile = join(orchRoot, '.logs', `session-start-${sessionId}`);
    writeFileSync(startFile, String(startTs));

    await runStopHook({ stop_hook_active: false }, sessionId);

    const lines = readTelemetryLines();
    const stopEvent = lines.find(e => e.event === 'hook_stop');
    expect(stopEvent).toBeDefined();
    expect(typeof stopEvent!.duration_s).toBe('number');
    expect(stopEvent!.duration_s as number).toBeGreaterThanOrEqual(0);
  });

  /**
   * BUG 2: When no start-time file exists, duration_s should be null
   * (or absent — either is acceptable per spec).
   * FAILS on buggy code (field missing entirely vs. null), PASSES after fix.
   */
  test('event has duration_s null when no start-time file', async () => {
    // Ensure there is no start-time file
    const startFile = join(orchRoot, '.logs', 'session-start-no-start-session');
    if (existsSync(startFile)) rmSync(startFile);

    await runStopHook({ stop_hook_active: false }, 'no-start-session');

    const lines = readTelemetryLines();
    const stopEvent = lines.find(e => e.event === 'hook_stop');
    expect(stopEvent).toBeDefined();
    // After fix: duration_s is null (the JSON literal null) or absent
    const durField = stopEvent!.duration_s;
    const acceptable = durField === null || durField === undefined;
    expect(acceptable).toBe(true);
  });

  /**
   * Verify the written event has a ts field with an ISO timestamp.
   * Passes on both old and new code — confirms basic event shape.
   */
  test('event has a valid ISO ts field', async () => {
    await runStopHook({ stop_hook_active: false });

    const lines = readTelemetryLines();
    const stopEvent = lines.find(e => e.event === 'hook_stop');
    expect(stopEvent).toBeDefined();
    expect(typeof stopEvent!.ts).toBe('string');
    expect(new Date(stopEvent!.ts as string).getTime()).toBeGreaterThan(0);
  });

  /**
   * edit_count field is present in both old and new code.
   */
  test('event has edit_count field', async () => {
    await runStopHook({ stop_hook_active: false });

    const lines = readTelemetryLines();
    const stopEvent = lines.find(e => e.event === 'hook_stop');
    expect(stopEvent).toBeDefined();
    expect(typeof stopEvent!.edit_count).toBe('number');
  });
});

describe('stop hook — exit code', () => {
  test('exits with code 0 when stop_hook_active is false', async () => {
    const { exitCode } = await runStopHook({ stop_hook_active: false });
    expect(exitCode).toBe(0);
  });

  test('exits with code 0 when stop_hook_active is true (guard)', async () => {
    const { exitCode } = await runStopHook({ stop_hook_active: true });
    expect(exitCode).toBe(0);
  });

  test('exits with code 0 with empty input', async () => {
    const { exitCode } = await runStopHook({});
    expect(exitCode).toBe(0);
  });
});

describe('stop hook — idempotency / multiple runs', () => {
  /**
   * Running the hook twice (both with false) should produce two hook_stop events,
   * not be silently swallowed. Fails on buggy code (both runs exit early).
   */
  test('two runs with stop_hook_active: false produce two hook_stop events', async () => {
    await runStopHook({ stop_hook_active: false });
    await runStopHook({ stop_hook_active: false });

    expect(countEvents('hook_stop')).toBe(2);
  });
});
