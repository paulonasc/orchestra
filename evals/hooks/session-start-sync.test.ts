/**
 * Unit tests for the session-start hook (hooks/orchestra-session-start.sh).
 *
 * Bug 3 being fixed: the session-start hook did not write a start-time file,
 * so the stop hook could never compute duration_s. After the fix, the hook
 * writes `.orchestra/.logs/session-start-<session_id>` containing the Unix
 * epoch timestamp at session start.
 *
 * This file focuses on:
 *   1. Start-time file written (FAILS before fix, PASSES after).
 *   2. Telemetry event (session_start) is appended.
 *   3. Hook exits with code 0 in all cases.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const HOOK_SCRIPT = join(import.meta.dir, '..', '..', 'hooks', 'orchestra-session-start.sh');

let tempDir: string;
let orchRoot: string;
let stateDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orch-session-start-test-'));
  orchRoot = join(tempDir, '.orchestra');
  stateDir = join(tempDir, '.orchestra-state');
  mkdirSync(join(orchRoot, '.logs'), { recursive: true });
  mkdirSync(join(orchRoot, 'memory'), { recursive: true });
  mkdirSync(join(orchRoot, 'state', 'sessions'), { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  writeFileSync(join(tempDir, '.orchestra.link'), `root: ${orchRoot}\n`);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Run the session-start hook.
 * Returns { exitCode }.
 *
 * Note: the hook generates its own session ID via generate_session_id() (date+PID),
 * so we can't predict the exact filename. Instead, we check for any matching file.
 */
async function runSessionStartHook(
  sessionId?: string
): Promise<{ exitCode: number }> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ORCHESTRA_STATE_DIR: stateDir,
  };
  if (sessionId) {
    env.ORCHESTRA_SESSION_ID = sessionId;
  }

  const proc = Bun.spawn(['bash', HOOK_SCRIPT], {
    cwd: tempDir,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  return { exitCode };
}

/** Return the path of the first session-start-* file in .logs, or null. */
function findStartTimeFile(sessionId?: string): string | null {
  const logsDir = join(orchRoot, '.logs');
  if (!existsSync(logsDir)) return null;

  if (sessionId) {
    const specific = join(logsDir, `session-start-${sessionId}`);
    return existsSync(specific) ? specific : null;
  }

  const { readdirSync } = require('fs');
  const files = readdirSync(logsDir).filter((f: string) => f.startsWith('session-start-'));
  return files.length > 0 ? join(logsDir, files[0]) : null;
}

/** Read all lines from telemetry.jsonl, parsed. */
function readTelemetryLines(): Array<Record<string, unknown>> {
  const logPath = join(orchRoot, '.logs', 'telemetry.jsonl');
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));
}

describe('session-start hook — start-time file', () => {
  /**
   * BUG 3: Before the fix, the session-start hook did not write a start-time
   * file. This test FAILS on the buggy code and PASSES after the fix.
   */
  test('writes a session-start-<session_id> file in .logs/', async () => {
    const sessionId = 'start-file-test';
    await runSessionStartHook(sessionId);

    const file = findStartTimeFile(sessionId);
    expect(file).not.toBeNull();
  });

  /**
   * The start-time file contains a Unix epoch integer (seconds since epoch).
   * FAILS on buggy code (file absent), PASSES after fix.
   */
  test('start-time file contains a valid Unix timestamp', async () => {
    const sessionId = 'ts-check-test';
    const beforeRun = Math.floor(Date.now() / 1000);

    await runSessionStartHook(sessionId);

    const file = findStartTimeFile(sessionId);
    expect(file).not.toBeNull();

    const content = readFileSync(file!, 'utf-8').trim();
    const ts = parseInt(content, 10);
    expect(isNaN(ts)).toBe(false);
    // The timestamp should be close to now (within 60 seconds)
    expect(ts).toBeGreaterThanOrEqual(beforeRun - 5);
    expect(ts).toBeLessThanOrEqual(beforeRun + 60);
  });

  /**
   * Each session gets its own file (different session IDs don't collide).
   * Passes on both old and new code once file writing is in place.
   */
  test('separate sessions write separate start-time files', async () => {
    await runSessionStartHook('session-alpha');
    await runSessionStartHook('session-beta');

    expect(findStartTimeFile('session-alpha')).not.toBeNull();
    expect(findStartTimeFile('session-beta')).not.toBeNull();
  });
});

describe('session-start hook — telemetry event', () => {
  /**
   * The hook appends a session_start event to telemetry.jsonl.
   * This should pass on both old and new code.
   */
  test('writes a session_start event to telemetry.jsonl', async () => {
    await runSessionStartHook();

    const lines = readTelemetryLines();
    const startEvent = lines.find(e => e.event === 'session_start');
    expect(startEvent).toBeDefined();
  });

  test('session_start event has a valid ISO ts field', async () => {
    await runSessionStartHook();

    const lines = readTelemetryLines();
    const startEvent = lines.find(e => e.event === 'session_start');
    expect(startEvent).toBeDefined();
    expect(typeof startEvent!.ts).toBe('string');
    expect(new Date(startEvent!.ts as string).getTime()).toBeGreaterThan(0);
  });

  test('session_start event has sessions field (numeric)', async () => {
    await runSessionStartHook();

    const lines = readTelemetryLines();
    const startEvent = lines.find(e => e.event === 'session_start');
    expect(startEvent).toBeDefined();
    expect(typeof startEvent!.sessions).toBe('number');
  });
});

describe('session-start hook — exit code', () => {
  test('exits with code 0', async () => {
    const { exitCode } = await runSessionStartHook();
    expect(exitCode).toBe(0);
  });

  test('exits with code 0 when given explicit session ID', async () => {
    const { exitCode } = await runSessionStartHook('explicit-session-id');
    expect(exitCode).toBe(0);
  });
});

describe('session-start + stop integration — duration roundtrip', () => {
  /**
   * Integration: run session-start then stop hook and verify stop sees duration_s.
   * This ties Bug 3 (session-start writes file) to Bug 2 (stop hook reads it).
   * FAILS on the buggy code, PASSES after both bugs are fixed.
   */
  test('stop hook reads start-time file written by session-start', async () => {
    const STOP_HOOK = join(import.meta.dir, '..', '..', 'hooks', 'orchestra-stop.sh');
    const sessionId = 'roundtrip-session';

    // Run session-start to write the start-time file
    await runSessionStartHook(sessionId);

    // Verify file was written before running stop
    const startFile = findStartTimeFile(sessionId);
    expect(startFile).not.toBeNull();

    // Now run stop hook — it should pick up the start-time file and compute duration
    const proc = Bun.spawn(['bash', STOP_HOOK], {
      cwd: tempDir,
      env: {
        ...process.env as Record<string, string>,
        ORCHESTRA_SESSION_ID: sessionId,
        ORCHESTRA_STATE_DIR: stateDir,
      },
      stdin: new TextEncoder().encode(JSON.stringify({ stop_hook_active: false })),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;

    const lines = readTelemetryLines();
    const stopEvent = lines.find(e => e.event === 'hook_stop');
    expect(stopEvent).toBeDefined();
    expect(typeof stopEvent!.duration_s).toBe('number');
    expect(stopEvent!.duration_s as number).toBeGreaterThanOrEqual(0);
  });
});
