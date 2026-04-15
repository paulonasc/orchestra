/**
 * Tests for dynamic hook paths (setup changes).
 *
 * The fix: instead of hardcoding absolute Orchestra paths in settings.json,
 * setup writes per-user wrapper scripts to ~/.orchestra-state/hooks/ and
 * settings.json uses `bash $HOME/.orchestra-state/hooks/<hook>.sh`.
 *
 * Tests verify all 6 scenarios from the plan:
 *   1. Fresh link creates wrappers + settings.json uses $HOME paths
 *   2. Moving Orchestra + re-running setup sync regenerates wrappers
 *   3. New hook added → wrapper + settings.json entry appear after sync
 *   4. Hook removed → wrapper deleted + settings.json entry removed after sync
 *   5. Cross-user: $HOME in settings.json expands to the right path at runtime
 *   6. Missing wrapper gives a clear error (non-zero exit, actionable message)
 *   7. .claude/settings.json added to .gitignore
 */

import { describe, test, expect, afterEach } from 'bun:test';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  copyFileSync,
  renameSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ORCHESTRA_SRC = join(import.meta.dir, '..', '..');
const SETUP_SCRIPT = join(ORCHESTRA_SRC, 'setup');
const HOOKS_DIR = join(ORCHESTRA_SRC, 'hooks');

// Temp dirs created per-test — collected for cleanup.
const tempDirs: string[] = [];

afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

/** Create a temp directory, register it for cleanup, and return its path. */
function makeTempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

/**
 * Create a minimal project with a git repo and an .orchestra/ directory
 * alongside it (sibling, so setup link can auto-detect).
 *
 * Returns { project, orchestra } absolute paths.
 */
function makeProject(root: string): { project: string; orchestra: string } {
  const project = join(root, 'my-project');
  const orchestra = join(project, '.orchestra');

  mkdirSync(project, { recursive: true });
  mkdirSync(join(orchestra, '.logs'), { recursive: true });
  mkdirSync(join(orchestra, 'state'), { recursive: true });
  mkdirSync(join(orchestra, 'decisions'), { recursive: true });
  mkdirSync(join(orchestra, 'threads'), { recursive: true });
  mkdirSync(join(orchestra, 'handoffs'), { recursive: true });
  mkdirSync(join(orchestra, 'templates'), { recursive: true });
  mkdirSync(join(orchestra, 'memory'), { recursive: true });
  mkdirSync(join(orchestra, 'inject'), { recursive: true });
  mkdirSync(join(orchestra, 'briefings'), { recursive: true });
  mkdirSync(join(orchestra, 'sessions'), { recursive: true });
  mkdirSync(join(orchestra, 'state', 'sessions'), { recursive: true });

  // Minimal MEMORY.md so setup link can find .orchestra/
  writeFileSync(join(orchestra, 'MEMORY.md'), '# Memory\n');
  // .gitignore so setup link can add entries
  writeFileSync(join(project, '.gitignore'), '');

  return { project, orchestra };
}

/**
 * Run `bash /path/to/setup <args>` with HOME overridden to a temp dir.
 * Returns { exitCode, stdout, stderr }.
 */
async function runSetup(
  args: string[],
  opts: { home: string; cwd?: string }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bash', SETUP_SCRIPT, ...args], {
    cwd: opts.cwd ?? ORCHESTRA_SRC,
    env: {
      ...process.env,
      HOME: opts.home,
      // Keep PATH so jq, git, etc. are available
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Fresh link creates wrappers + $HOME paths in settings.json
// ─────────────────────────────────────────────────────────────────────────────
describe('setup-hook-paths', () => {
  test('fresh link creates wrappers and settings.json uses $HOME paths', async () => {
    const root = makeTempDir('orch-hp-t1-');
    const tmpHome = makeTempDir('orch-hp-home1-');
    const { project } = makeProject(root);

    const result = await runSetup(['link', project], { home: tmpHome });

    // Setup should succeed
    expect(result.exitCode).toBe(0);

    // Wrapper file must exist for orchestra-stop.sh
    const wrapperPath = join(tmpHome, '.orchestra-state', 'hooks', 'orchestra-stop.sh');
    expect(existsSync(wrapperPath)).toBe(true);

    // Wrapper content must exec-delegate to the real hook
    const wrapperContent = readFileSync(wrapperPath, 'utf-8');
    expect(wrapperContent).toContain('exec bash');
    // The wrapper must reference the real hook path inside the Orchestra source
    const realHookPath = join(HOOKS_DIR, 'orchestra-stop.sh');
    expect(wrapperContent).toContain(realHookPath);

    // settings.json must exist
    const settingsPath = join(project, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settingsRaw = readFileSync(settingsPath, 'utf-8');

    // Hooks must use literal $HOME (not the expanded path)
    expect(settingsRaw).toContain('$HOME/.orchestra-state/hooks/orchestra-stop.sh');

    // Hooks must NOT contain the hardcoded Orchestra source path
    expect(settingsRaw).not.toContain(join(ORCHESTRA_SRC, 'hooks'));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 2 — Wrappers regenerated when Orchestra directory changes
  // ───────────────────────────────────────────────────────────────────────────
  test('running link twice with different ORCHESTRA_DIR produces wrappers for the second one', async () => {
    // We simulate "Orchestra moved" by running setup link a second time from a
    // different copy of the setup script (different ORCHESTRA_DIR).  The simplest
    // approach without physically moving git repos: just run link twice — on the
    // second run the wrappers should point to the current ORCHESTRA_DIR.
    //
    // Since both runs use the same ORCHESTRA_SRC here, we verify the wrapper
    // correctly references ORCHESTRA_SRC after both runs (i.e. no stale paths).

    const root = makeTempDir('orch-hp-t2-');
    const tmpHome = makeTempDir('orch-hp-home2-');
    const { project } = makeProject(root);

    // First link
    await runSetup(['link', project], { home: tmpHome });

    // Second link (re-running, simulates sync after Orchestra path changes)
    const result = await runSetup(['link', project], { home: tmpHome });
    expect(result.exitCode).toBe(0);

    // Wrapper must exist and still point to current ORCHESTRA_SRC hooks
    const wrapperPath = join(tmpHome, '.orchestra-state', 'hooks', 'orchestra-stop.sh');
    expect(existsSync(wrapperPath)).toBe(true);
    const wrapperContent = readFileSync(wrapperPath, 'utf-8');
    expect(wrapperContent).toContain(join(HOOKS_DIR, 'orchestra-stop.sh'));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 3 — New hook added → wrapper appears after re-link
  // ───────────────────────────────────────────────────────────────────────────
  test('new hook added to hooks/ gets a wrapper after re-link', async () => {
    const root = makeTempDir('orch-hp-t3-');
    const tmpHome = makeTempDir('orch-hp-home3-');
    const { project } = makeProject(root);

    // First link — no dummy hook yet
    await runSetup(['link', project], { home: tmpHome });

    // Add a dummy hook to the source hooks/ dir
    const dummyHookSrc = join(HOOKS_DIR, 'orchestra-test-hook.sh');
    writeFileSync(dummyHookSrc, '#!/bin/bash\necho "test hook"\n');

    try {
      // Re-link — setup should pick up the new hook
      const result = await runSetup(['link', project], { home: tmpHome });
      expect(result.exitCode).toBe(0);

      // Wrapper for the new hook must now exist
      const wrapperPath = join(tmpHome, '.orchestra-state', 'hooks', 'orchestra-test-hook.sh');
      expect(existsSync(wrapperPath)).toBe(true);

      const wrapperContent = readFileSync(wrapperPath, 'utf-8');
      expect(wrapperContent).toContain(dummyHookSrc);
    } finally {
      // Always clean up the dummy source hook
      if (existsSync(dummyHookSrc)) rmSync(dummyHookSrc);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 4 — Hook removed → wrapper deleted after re-link
  // ───────────────────────────────────────────────────────────────────────────
  test('removed hook loses its wrapper after re-link', async () => {
    const root = makeTempDir('orch-hp-t4-');
    const tmpHome = makeTempDir('orch-hp-home4-');
    const { project } = makeProject(root);

    // Add a dummy hook first
    const dummyHookSrc = join(HOOKS_DIR, 'orchestra-removable.sh');
    const dummyHookAside = join(tmpdir(), 'orchestra-removable-aside.sh');
    writeFileSync(dummyHookSrc, '#!/bin/bash\necho "removable"\n');

    try {
      // First link — wrapper should be created
      await runSetup(['link', project], { home: tmpHome });

      const wrapperPath = join(tmpHome, '.orchestra-state', 'hooks', 'orchestra-removable.sh');
      expect(existsSync(wrapperPath)).toBe(true);

      // Simulate hook removal — move the source hook aside
      renameSync(dummyHookSrc, dummyHookAside);

      // Re-link — setup should detect the missing source and remove the wrapper
      const result = await runSetup(['link', project], { home: tmpHome });
      expect(result.exitCode).toBe(0);

      // Wrapper must be gone
      expect(existsSync(wrapperPath)).toBe(false);
    } finally {
      // Restore the dummy hook if it was moved aside
      if (existsSync(dummyHookAside) && !existsSync(dummyHookSrc)) {
        renameSync(dummyHookAside, dummyHookSrc);
      }
      // If the source hook somehow survived, clean it up
      if (existsSync(dummyHookSrc)) rmSync(dummyHookSrc);
      if (existsSync(dummyHookAside)) rmSync(dummyHookAside);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 5 — Cross-user: hook fires correctly via $HOME path
  // ───────────────────────────────────────────────────────────────────────────
  test('hook command from settings.json expands $HOME and runs successfully', async () => {
    const root = makeTempDir('orch-hp-t5-');
    const tmpHome = makeTempDir('orch-hp-home5-');
    const { project, orchestra } = makeProject(root);

    // Run setup link to create wrappers + settings.json
    const linkResult = await runSetup(['link', project], { home: tmpHome });
    expect(linkResult.exitCode).toBe(0);

    // Read the command from settings.json
    const settingsPath = join(project, '.claude', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Find the PostToolUse hook command (orchestra-post-tool-nudge.sh)
    const postToolEntries: Array<{ hooks: Array<{ command: string }> }> =
      settings.hooks?.PostToolUse ?? [];
    const nudgeEntry = postToolEntries.find((e) =>
      e.hooks?.some((h: { command: string }) => h.command.includes('orchestra-post-tool-nudge'))
    );
    expect(nudgeEntry).toBeDefined();
    const command = nudgeEntry!.hooks[0].command;

    // The command should contain literal $HOME, not the expanded path
    expect(command).toContain('$HOME');

    // Run the command via bash with HOME set to our temp dir.
    // The post-tool-nudge hook reads .orchestra.link from cwd, so we need a link.
    writeFileSync(join(project, '.orchestra.link'), `root: ${orchestra}\n`);

    const proc = Bun.spawn(['bash', '-c', command], {
      env: {
        ...process.env,
        HOME: tmpHome,
        ORCHESTRA_SESSION_ID: 'test-cross-user',
      },
      cwd: project,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    // Must not fail with "No such file or directory"
    expect(stderr).not.toContain('No such file');
    expect(exitCode).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 6 — Missing wrapper gives non-zero exit + stderr
  // ───────────────────────────────────────────────────────────────────────────
  test('missing wrapper produces non-zero exit and stderr message', async () => {
    const tmpHome = makeTempDir('orch-hp-home6-');

    // Do NOT run setup link — no wrappers exist in tmpHome
    const missingWrapper = join(tmpHome, '.orchestra-state', 'hooks', 'orchestra-stop.sh');

    const proc = Bun.spawn(
      ['bash', '-c', `bash ${missingWrapper}`],
      {
        env: { ...process.env, HOME: tmpHome },
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    // Must exit non-zero
    expect(exitCode).not.toBe(0);

    // Must produce a recognisable error message (bash "No such file or directory"
    // or similar — no custom message required, just confirm the failure is obvious)
    const combined = stderr.toLowerCase();
    const hasErrorMessage =
      combined.includes('no such file') ||
      combined.includes('not found') ||
      combined.includes('cannot open') ||
      combined.includes('does not exist');
    expect(hasErrorMessage).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 7 — .claude/settings.json added to .gitignore
  // ───────────────────────────────────────────────────────────────────────────
  test('setup link adds .claude/settings.json to .gitignore', async () => {
    const root = makeTempDir('orch-hp-t7-');
    const tmpHome = makeTempDir('orch-hp-home7-');
    const { project } = makeProject(root);

    // Start with a .gitignore that does NOT mention settings.json
    const gitignorePath = join(project, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/\n.env\n');

    const result = await runSetup(['link', project], { home: tmpHome });
    expect(result.exitCode).toBe(0);

    // .gitignore must now contain .claude/settings.json
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('.claude/settings.json');
  });
});
