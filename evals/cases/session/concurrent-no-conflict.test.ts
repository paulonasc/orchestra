/**
 * Case 8: Two agents checkpoint simultaneously with no data loss.
 *
 * This is a deterministic test — no LLM needed. We simulate two sessions
 * writing to their own session files and appending to the shared daily log
 * concurrently. Both files must survive intact.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir: string | undefined;

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('concurrent-sessions-no-conflict', () => {
  test(
    'two simultaneous session writes produce no data loss',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'orchestra-eval-concurrent-'));
      workDir = root;

      const orchestra = join(root, '.orchestra');
      await mkdir(join(orchestra, 'state', 'sessions'), { recursive: true });
      await mkdir(join(orchestra, 'memory'), { recursive: true });

      const today = new Date().toISOString().split('T')[0];
      const dailyLog = join(orchestra, 'memory', `${today}.md`);
      await writeFile(dailyLog, `# ${today}\n\n`);

      const sessionA = '20260325-140000-11111';
      const sessionB = '20260325-140001-22222';

      const sessionAContent = `# Session ${sessionA}
Started: 2026-03-25 14:00:00
Repo: api

## Working on
Building user authentication endpoints

## Progress updates
- Completed JWT token generation
- Added bcrypt password hashing

## Decisions made
- Chose JWT over session cookies for stateless auth

## Research findings
- bcrypt cost factor 12 provides good security/performance balance

## Gotchas
- express-jwt v8 has breaking changes from v7

## Next steps
- Add refresh token rotation
`;

      const sessionBContent = `# Session ${sessionB}
Started: 2026-03-25 14:00:01
Repo: frontend

## Working on
Implementing login form with React Hook Form

## Progress updates
- Created LoginForm component
- Added zod validation schema

## Decisions made
- Using React Hook Form over Formik for smaller bundle size

## Research findings
- React Hook Form has better re-render performance than Formik

## Gotchas
- useForm must be called before useFieldArray

## Next steps
- Add OAuth provider buttons
`;

      const logEntryA =
        '  - [session: 20260325-140000-11111] Checkpoint: Built JWT auth endpoints [repo: api]\n';
      const logEntryB =
        '  - [session: 20260325-140001-22222] Checkpoint: Implemented login form [repo: frontend]\n';

      // Write both session files and append to daily log concurrently
      const writeA = async () => {
        await writeFile(
          join(orchestra, 'state', 'sessions', `${sessionA}.md`),
          sessionAContent,
        );
        await appendFile(dailyLog, logEntryA);
      };

      const writeB = async () => {
        await writeFile(
          join(orchestra, 'state', 'sessions', `${sessionB}.md`),
          sessionBContent,
        );
        await appendFile(dailyLog, logEntryB);
      };

      // Run them truly in parallel
      await Promise.all([writeA(), writeB()]);

      // Verify: both session files exist and are complete
      const readA = await readFile(
        join(orchestra, 'state', 'sessions', `${sessionA}.md`),
        'utf-8',
      );
      const readB = await readFile(
        join(orchestra, 'state', 'sessions', `${sessionB}.md`),
        'utf-8',
      );

      expect(readA).toContain('JWT token generation');
      expect(readA).toContain('Chose JWT over session cookies');
      expect(readA).toContain('Add refresh token rotation');

      expect(readB).toContain('LoginForm component');
      expect(readB).toContain('React Hook Form over Formik');
      expect(readB).toContain('OAuth provider buttons');

      // Verify: daily log has entries from BOTH sessions
      const logContent = await readFile(dailyLog, 'utf-8');
      expect(logContent).toContain('20260325-140000-11111');
      expect(logContent).toContain('20260325-140001-22222');
      expect(logContent).toContain('Built JWT auth endpoints');
      expect(logContent).toContain('Implemented login form');

      // Verify: no file corruption (each file has expected sections)
      const sectionHeaders = [
        '## Working on',
        '## Progress updates',
        '## Decisions made',
        '## Gotchas',
        '## Next steps',
      ];
      for (const header of sectionHeaders) {
        expect(readA).toContain(header);
        expect(readB).toContain(header);
      }
    },
    10_000,
  );
});
