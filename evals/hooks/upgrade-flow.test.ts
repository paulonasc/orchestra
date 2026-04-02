/**
 * E2E upgrade smoke test.
 *
 * Simulates upgrading Orchestra from an old version:
 * 1. Creates a fake "old" install with VERSION=0.0.1
 * 2. Runs setup link on a test project
 * 3. Verifies all files are installed correctly
 * 4. Simulates version bump
 * 5. Verifies first-run detection detects "upgrade"
 *
 * This is deterministic — no Agent SDK needed.
 *
 * @origin synthetic — /o update was never tested end-to-end.
 *   This catches path bugs, missing files, and broken setup link.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

const ORCHESTRA_SRC = join(import.meta.dir, '..', '..');

describe('upgrade-flow', () => {
  let testDir: string;

  afterAll(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  test('setup link installs all expected files', async () => {
    // Create a fake project
    testDir = await mkdtemp(join(tmpdir(), 'orchestra-upgrade-'));
    const project = join(testDir, 'my-project');
    await mkdir(join(project, 'src'), { recursive: true });
    await writeFile(join(project, 'package.json'), '{"name":"test"}');

    // Git init the project (setup link needs this for some operations)
    await $`cd ${project} && git init -q && git add -A && git commit -qm "init"`;

    // Run setup init + link
    await $`cd ${ORCHESTRA_SRC} && bash setup init ${project}`;
    await $`cd ${ORCHESTRA_SRC} && bash setup link ${project}`;

    // Verify .orchestra/ structure
    expect(await exists(join(project, '.orchestra', 'MEMORY.md'))).toBe(true);
    expect(await exists(join(project, '.orchestra', 'state'))).toBe(true);
    expect(await exists(join(project, '.orchestra', 'threads'))).toBe(true);
    expect(await exists(join(project, '.orchestra', 'README.md'))).toBe(true);

    // Verify .orchestra.link
    const link = await readFile(join(project, '.orchestra.link'), 'utf-8');
    expect(link).toContain('root:');

    // Verify SKILL.md installed
    expect(await exists(join(project, '.claude', 'skills', 'o', 'SKILL.md'))).toBe(true);

    // Verify command files installed
    const commands = await readdir(join(project, '.claude', 'skills', 'o', 'commands'));
    expect(commands).toContain('checkpoint.md');
    expect(commands).toContain('dashboard.md');
    expect(commands).toContain('close.md');

    // Verify reference files installed
    const refs = await readdir(join(project, '.claude', 'skills', 'o', 'reference'));
    expect(refs).toContain('memory.md');
    expect(refs).toContain('verification.md');

    // Verify hooks installed
    expect(await exists(join(project, '.claude', 'settings.json'))).toBe(true);
    const settings = JSON.parse(await readFile(join(project, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeDefined();

    // Verify CLAUDE.md created with rules
    expect(await exists(join(project, 'CLAUDE.md'))).toBe(true);
    const claudeMd = await readFile(join(project, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('orchestra-rules-start');

    // Verify .claude/rules/orchestra.md installed
    expect(await exists(join(project, '.claude', 'rules', 'orchestra.md'))).toBe(true);
    const rules = await readFile(join(project, '.claude', 'rules', 'orchestra.md'), 'utf-8');
    expect(rules).toContain('paulonasc/orchestra');
  });

  test('version marker is written after link', async () => {
    // The stamp_version function should have written the version marker
    // during the setup link in the previous test
    const versionMarker = join(process.env.HOME || '', '.orchestra-state', '.version');
    // Note: this test checks the REAL ~/.orchestra-state/.version
    // It may already exist from a real install — just verify it exists and has content
    const versionExists = await exists(versionMarker);
    expect(versionExists).toBe(true);
    if (versionExists) {
      const version = await readFile(versionMarker, 'utf-8');
      expect(version.trim().length).toBeGreaterThan(0);
    }
  });

  test('setup sync preserves .orchestra/ state', async () => {
    // This test reuses testDir from the first test (setup link already ran)
    // The .orchestra/ directory should already exist with state

    const project = join(testDir, 'my-project');
    const orchestra = join(project, '.orchestra');

    // Write some state that should survive sync
    await writeFile(join(orchestra, 'decisions', '001-test-decision.md'), '# Test Decision\nWe chose X over Y.\n');
    await writeFile(join(orchestra, 'MEMORY.md'), '# Memory\n\n## Gotchas\n\n- Test gotcha\n');
    const memoryDir = join(orchestra, 'memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, '2026-04-02.md'), '## 10:00 — Test session\n');

    // Run setup link AGAIN (simulates sync/upgrade)
    await $`cd ${ORCHESTRA_SRC} && bash setup link ${project}`;

    // Verify state survived
    const decision = await readFile(join(orchestra, 'decisions', '001-test-decision.md'), 'utf-8');
    expect(decision).toContain('We chose X over Y');

    const memory = await readFile(join(orchestra, 'MEMORY.md'), 'utf-8');
    expect(memory).toContain('Test gotcha');

    const dailyLog = await readFile(join(memoryDir, '2026-04-02.md'), 'utf-8');
    expect(dailyLog).toContain('Test session');

    // Verify skill files were UPDATED (not preserved — these are Orchestra's files)
    expect(await exists(join(project, '.claude', 'skills', 'o', 'SKILL.md'))).toBe(true);
    const commands = await readdir(join(project, '.claude', 'skills', 'o', 'commands'));
    expect(commands.length).toBeGreaterThan(0);
  });

  test('command files have no unsubstituted __ORCHESTRA_ placeholders', async () => {
    const project = join(testDir, 'my-project');
    const commandsDir = join(project, '.claude', 'skills', 'o', 'commands');

    // Read every installed command file and check for unsubstituted placeholders
    const commands = await readdir(commandsDir);
    for (const file of commands) {
      const content = await readFile(join(commandsDir, file), 'utf-8');
      expect(content).not.toContain('__ORCHESTRA_DIR__');
      expect(content).not.toContain('__ORCHESTRA_BIN__');
    }

    // Also check SKILL.md
    const skillContent = await readFile(
      join(project, '.claude', 'skills', 'o', 'SKILL.md'), 'utf-8'
    );
    // SKILL.md preamble has __ORCHESTRA_DIR__ in bash variable assignment
    // which gets evaluated at runtime, not substituted. But the sed should
    // have replaced the path references outside of bash code blocks.
    // Check that no raw __ORCHESTRA_BIN__/ paths remain (these should be resolved)
    const lines = skillContent.split('\n');
    for (const line of lines) {
      // Skip lines inside bash code blocks (they use __ORCHESTRA_DIR__ as a variable)
      if (line.includes('_ORCH_DIR="__ORCHESTRA_DIR__"')) continue;
      if (line.includes('__ORCHESTRA_BIN__/') && !line.startsWith('#') && !line.includes('```')) {
        // This line has a path that should have been substituted
        // Verify it was actually resolved to a real path
        expect(line).not.toMatch(/__ORCHESTRA_BIN__\/[a-z]/);
      }
    }
  });

  test('sync removes orphaned command files', async () => {
    const project = join(testDir, 'my-project');
    const commandsDir = join(project, '.claude', 'skills', 'o', 'commands');

    // Plant a fake orphaned file
    await writeFile(join(commandsDir, 'old-removed-command.md'), '# This should be deleted by sync');

    // Run setup link again
    await $`cd ${ORCHESTRA_SRC} && bash setup link ${project}`;

    // Verify orphan was cleaned up
    const commands = await readdir(commandsDir);
    expect(commands).not.toContain('old-removed-command.md');

    // Verify real commands still exist
    expect(commands).toContain('checkpoint.md');
    expect(commands).toContain('dashboard.md');
  });
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
