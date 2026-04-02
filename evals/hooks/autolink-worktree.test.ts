/**
 * E2E tests for worktree auto-link feature.
 *
 * Tests the global SessionStart hook that auto-links worktrees of
 * already-linked repos. Covers happy path, idempotency, edge cases,
 * and setup integration.
 *
 * @origin real-user — Paulo's second laptop had unlinked worktrees
 *   because setup link was never run against them.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

const ORCHESTRA_SRC = join(import.meta.dir, '..', '..');
const AUTOLINK_SCRIPT = join(ORCHESTRA_SRC, 'hooks', 'orchestra-autolink-worktree.sh');

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

/** Create a git repo, init Orchestra, link it, and return paths. */
async function createLinkedRepo(testDir: string) {
  const project = join(testDir, 'main-repo');
  const orchState = join(testDir, 'orch-state');

  await mkdir(project, { recursive: true });
  await mkdir(orchState, { recursive: true });
  await writeFile(join(orchState, 'MEMORY.md'), '# Memory\n');
  await mkdir(join(orchState, 'threads'), { recursive: true });
  await mkdir(join(orchState, 'decisions'), { recursive: true });
  await mkdir(join(orchState, 'state'), { recursive: true });

  await $`cd ${project} && git init -q && echo "init" > file.txt && git add . && git commit -qm "init"`;
  await $`cd ${ORCHESTRA_SRC} && bash setup link ${project} ${orchState}`.quiet();

  return { project, orchState };
}

/** Run the autolink script in a given directory, return stdout. */
async function runAutolink(cwd: string): Promise<string> {
  const result = await $`cd ${cwd} && bash ${AUTOLINK_SCRIPT} 2>&1`.nothrow().quiet();
  return result.stdout.toString().trim();
}

describe('autolink-worktree', () => {
  let testDir: string;

  afterAll(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  test('auto-links a new worktree of a linked repo', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'orchestra-autolink-'));
    const { project, orchState } = await createLinkedRepo(testDir);

    // Create a worktree
    const wt = join(testDir, 'my-worktree');
    await $`cd ${project} && git worktree add ${wt} -b feature/test-branch`.quiet();

    // Verify no .claude/ yet
    expect(await exists(join(wt, '.claude', 'skills', 'o', 'SKILL.md'))).toBe(false);

    // Run autolink
    const output = await runAutolink(wt);
    expect(output).toContain('Orchestra auto-linked worktree');
    expect(output).toContain('feature/test-branch');

    // Verify everything installed
    expect(await exists(join(wt, '.claude', 'skills', 'o', 'SKILL.md'))).toBe(true);
    expect(await exists(join(wt, '.claude', 'settings.json'))).toBe(true);
    expect(await exists(join(wt, '.claude', 'rules', 'orchestra.md'))).toBe(true);
    expect(await exists(join(wt, '.orchestra.link'))).toBe(true);

    // Verify .orchestra.link points to correct state dir
    const link = await readFile(join(wt, '.orchestra.link'), 'utf-8');
    expect(link).toContain(`root: ${orchState}`);
    expect(link).toContain('install:');
  });

  test('idempotent — second run is fast-path no-op', async () => {
    const wt = join(testDir, 'my-worktree');
    const output = await runAutolink(wt);
    expect(output).toBe('');  // SKILL.md exists → fast-path exit
  });

  test('non-git directory — silent exit', async () => {
    const plainDir = join(testDir, 'not-a-repo');
    await mkdir(plainDir, { recursive: true });
    const output = await runAutolink(plainDir);
    expect(output).toBe('');
    expect(await exists(join(plainDir, '.claude'))).toBe(false);
  });

  test('main worktree (already linked) — silent exit', async () => {
    const { project } = { project: join(testDir, 'main-repo') };
    const output = await runAutolink(project);
    expect(output).toBe('');  // SKILL.md exists → fast-path exit
  });

  test('worktree of non-Orchestra repo — silent exit', async () => {
    const plainProject = join(testDir, 'plain-project');
    const plainWt = join(testDir, 'plain-wt');
    await mkdir(plainProject, { recursive: true });
    await $`cd ${plainProject} && git init -q && echo "x" > f.txt && git add . && git commit -qm "init"`.quiet();
    await $`cd ${plainProject} && git worktree add ${plainWt} -b feat`.quiet();

    const output = await runAutolink(plainWt);
    expect(output).toBe('');
    expect(await exists(join(plainWt, '.claude'))).toBe(false);
  });

  test('Orchestra install dir gone — silent exit', async () => {
    const wt2 = join(testDir, 'wt-bad-install');
    const { project } = { project: join(testDir, 'main-repo') };
    await $`cd ${project} && git worktree add ${wt2} -b test-bad-install`.quiet();

    // Temporarily break the install: path AND the SKILL.md fallback
    const linkFile = join(project, '.orchestra.link');
    const skillFile = join(project, '.claude', 'skills', 'o', 'SKILL.md');
    const originalLink = await readFile(linkFile, 'utf-8');
    const originalSkill = await readFile(skillFile, 'utf-8');
    await writeFile(linkFile, originalLink.replace(/install:.*/, 'install: /nonexistent/path'));
    await writeFile(skillFile, originalSkill.replace(/_ORCH_DIR="[^"]*"/, '_ORCH_DIR="/nonexistent/path"'));

    const output = await runAutolink(wt2);
    expect(output).toBe('');

    // Restore
    await writeFile(linkFile, originalLink);
    await writeFile(skillFile, originalSkill);
  });

  test('old .orchestra.link format (no install: field) — fallback works', async () => {
    const wt3 = join(testDir, 'wt-old-format');
    const { project, orchState } = { project: join(testDir, 'main-repo'), orchState: join(testDir, 'orch-state') };
    await $`cd ${project} && git worktree add ${wt3} -b test-old-format`.quiet();

    // Write old-format .orchestra.link (no install: line)
    const linkFile = join(project, '.orchestra.link');
    const originalLink = await readFile(linkFile, 'utf-8');
    await writeFile(linkFile, `root: ${orchState}\n`);

    const output = await runAutolink(wt3);
    expect(output).toContain('Orchestra auto-linked worktree');

    // Restore
    await writeFile(linkFile, originalLink);
  });

  test('setup link writes install: field to .orchestra.link', async () => {
    const link = await readFile(join(testDir, 'main-repo', '.orchestra.link'), 'utf-8');
    expect(link).toMatch(/^root: /m);
    expect(link).toMatch(/^install: /m);
  });

  test('global autolink hook registered in ~/.claude/settings.json', async () => {
    const globalSettings = join(process.env.HOME || '', '.claude', 'settings.json');
    if (await exists(globalSettings)) {
      const content = await readFile(globalSettings, 'utf-8');
      expect(content).toContain('orchestra-autolink-worktree');
    }
    // If global settings doesn't exist, skip (CI environments)
  });
});
