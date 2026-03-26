# Orchestra Eval System

Automated behavioral testing for Orchestra hooks, skills, and agent compliance.
Three tiers of tests, one harness, deterministic checks before LLM judges.

## Architecture

```
  Test Cases (.test.ts)
       |
       v
  Harness (defineEvalSuite)         Hook Unit Tests
       |                              |
       v                              v
  Session Runner (Agent SDK)       Bun.spawn (bash hooks)
       |                              |
       v                              v
  Claude (claude-sonnet-4-6)       stdout assertions
       |
       v
  Assertions
    1. Deterministic checks (checkSkillInvocation, checkFileWrite)
    2. LLM Judge (OpenAI gpt-5.4-mini) -- only if deterministic check inconclusive
```

### Three test tiers

1. **Hook unit tests** (`evals/hooks/`). Run the actual bash hook scripts via `Bun.spawn` against a mock `.orchestra/` directory. No LLM. Sub-second. Test hook logic in isolation.

2. **Deterministic integration tests** (`evals/cases/`). Run bash hooks or inspect their output with `expect()`. No LLM needed. Example: `session-start-relevant-context.test.ts` runs the session-start hook and asserts that repo-filtered MEMORY.md entries appear (or do not appear) in stdout.

3. **Behavioral evals** (`evals/cases/`, gated by `EVALS=1`). Spawn a real Claude Code agent session via the Agent SDK, then assert on its behavior. Use deterministic transcript checks first, fall back to an LLM judge for fuzzy behavioral questions. Example: did the agent suggest `/o checkpoint` when the user said "looks good"?

## How it works

### Session runner

The session runner (`helpers/session-runner.ts`) uses `query()` from `@anthropic-ai/claude-agent-sdk` to spawn real Claude Code sessions. This is **not** `claude -p` as a subprocess -- the SDK avoids the nested session restriction where `claude -p` refuses to launch inside another Claude Code session.

Key configuration passed to `query()`:

- `permissionMode: 'bypassPermissions'` -- evals run unattended
- `settingSources: ['user', 'project', 'local']` -- required for skill discovery from `.claude/skills/`; without this, the agent cannot find Orchestra's SKILL.md
- `maxTurns` -- configurable per test (default 15)
- `model` -- defaults to `claude-sonnet-4-6`, overridable via `EVALS_MODEL`
- `allowedTools` -- defaults to `Read, Write, Edit, Bash, Glob, Grep, Skill`

Sessions run with an `AbortController` timeout (default 3 minutes). On non-success exit, the full transcript is saved to `evals/runs/` as JSON for post-mortem debugging.

### Judge

The judge (`helpers/judge.ts`) provides two kinds of checks:

**Deterministic checks** scan the transcript array directly:
- `checkSkillInvocation(transcript, 'o')` -- did the agent call the Skill tool with skill name `o`?
- `checkFileWrite(transcript, /progress\.yaml/)` -- did a Write/Edit/Bash call target a matching path?

**LLM judge** (`judgeBehavior`) sends a formatted transcript summary to an LLM and asks a binary pass/fail question. The judge model defaults to OpenAI `gpt-5.4-mini` and is configurable via `EVAL_JUDGE_MODEL`. The provider abstraction (`helpers/providers.ts`) routes to OpenAI or Anthropic based on model name prefix.

### Test harness

`defineEvalSuite` (`cases/helpers/harness.ts`) eliminates boilerplate. It handles:
- Gating on the `EVALS` env var (behavioral tests are skipped without it)
- Creating an isolated temp directory with a full Orchestra installation (git repo, `.orchestra/`, hooks, SKILL.md, sample source files)
- Running the agent session
- Building the assertion context with convenience helpers (`ctx.checkSkill`, `ctx.checkFile`, `ctx.judge`)
- Cleaning up temp directories after all tests

## Running evals

```bash
# Hook unit tests only (fast, no API keys needed)
bun test evals/hooks/

# All deterministic tests including hook tests
bun test evals/

# LLM behavioral evals (needs ANTHROPIC auth + OPENAI_API_KEY)
source .env
EVALS=1 bun test evals/cases/

# Single eval
EVALS=1 bun test evals/cases/user-done-suggests-checkpoint.test.ts

# Custom judge model
EVAL_JUDGE_MODEL=gpt-5.4-mini EVALS=1 bun test evals/cases/

# Custom agent model
EVALS_MODEL=claude-opus-4-6 EVALS=1 bun test evals/cases/

# Using package.json scripts
bun run test:hooks
bun run test:evals
```

Note: without `EVALS=1`, behavioral test suites are skipped via `describe.skip`. Hook unit tests and deterministic integration tests always run.

## Writing a new behavioral eval

### 1. Add the prompt to `cases/helpers/prompts.ts`

```typescript
export const MY_NEW_SCENARIO = `\
This repo uses Orchestra for multi-agent coordination.
You have an active thread with work in progress.

<describe the scenario and what the user is telling the agent>

The user says: <the trigger phrase>.`;
```

### 2. Add a fixture to `cases/helpers/fixtures.ts` (if needed)

Fixtures set up scenario-specific files beyond the base Orchestra installation (which already includes `.orchestra/`, hooks, SKILL.md, sample source, and a git repo).

```typescript
export async function writeMyScenarioFixture(env: TestWorkDir): Promise<void> {
  await mkdir(join(env.root, 'src', 'services'), { recursive: true });
  await writeFile(join(env.root, 'src', 'services', 'cache.ts'), `export class CacheService { ... }`);
}
```

### 3. Create the test file

Create `evals/cases/my-new-scenario.test.ts`:

```typescript
import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { writeMyScenarioFixture } from './helpers/fixtures';
import { MY_NEW_SCENARIO } from './helpers/prompts';

defineEvalSuite('my-new-scenario', [
  {
    name: 'agent does the expected thing when triggered',
    fixtures: async (env) => {
      await writeMyScenarioFixture(env);
    },
    session: {
      prompt: MY_NEW_SCENARIO,
      maxTurns: 10,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Tier 1: deterministic check -- did the agent actually invoke the skill?
      const skillCheck = ctx.checkSkill('o');
      if (skillCheck.invoked && skillCheck.args?.toLowerCase().includes('checkpoint')) {
        return; // Hard pass, no LLM needed
      }

      // Tier 2: LLM judge -- did the agent at least suggest it?
      const judgeResult = await ctx.judge({
        question:
          'Did the agent suggest or perform the expected action?',
        passCriteria:
          'The agent must have either performed the action or explicitly suggested it to the user. A generic response without mentioning the specific action fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
```

The two-tier assertion pattern is important: deterministic checks are faster, cheaper, and more reliable. The LLM judge is the fallback for cases where the agent's behavior is correct but expressed in a way the deterministic check cannot catch (e.g., the agent suggested the command in prose rather than invoking it).

### 4. Run it

```bash
EVALS=1 bun test evals/cases/my-new-scenario.test.ts
```

## Writing a new hook test

Hook tests run the real bash scripts against a mock directory. No LLM, no API keys.

Create `evals/hooks/my-hook.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const HOOK_SCRIPT = join(import.meta.dir, '..', '..', 'hooks', 'my-hook.sh');

let tempDir: string;
let orchRoot: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orchestra-test-'));
  orchRoot = join(tempDir, '.orchestra');
  mkdirSync(join(orchRoot, '.logs'), { recursive: true });
  writeFileSync(join(tempDir, '.orchestra.link'), `root: ${orchRoot}\n`);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function runHook(): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(['bash', HOOK_SCRIPT], {
    cwd: tempDir,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

describe('my-hook', () => {
  test('produces expected output given preconditions', async () => {
    // Set up preconditions (files, counters, state)
    writeFileSync(join(orchRoot, 'some-state-file'), 'value');

    const result = await runHook();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('expected output');
  });
});
```

## Directory structure

```
evals/
  helpers/
    providers.ts        # LLM provider abstraction (OpenAI, Anthropic)
    session-runner.ts   # Agent SDK wrapper: query() + transcript capture
    judge.ts            # Deterministic checks + LLM judge
  cases/
    helpers/
      harness.ts        # defineEvalSuite: test lifecycle + assertion context
      setup.ts          # createTestWorkDir: full Orchestra installation in tmp
      fixtures.ts       # Scenario-specific file generators
      prompts.ts        # All eval prompts as exported constants
    *.test.ts           # Behavioral eval test files
  hooks/
    *.test.ts           # Hook unit tests (no LLM)
  fixtures/
    orchestra-setup/    # Static fixture files (if needed)
  runs/
    *.json              # Saved failure transcripts for debugging
    .gitignore          # Ignores JSON transcripts from version control
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `EVALS` | For behavioral tests | unset | Set to `1` to enable behavioral eval suites. Without it, they are skipped. |
| `EVALS_MODEL` | No | `claude-sonnet-4-6` | Model used for the agent session under test. |
| `EVAL_JUDGE_MODEL` | No | `gpt-5.4-mini` | Model used for the LLM judge. Prefix-routed: `gpt*`/`o1*`/`o3*`/`o4*` go to OpenAI, everything else to Anthropic. |
| `OPENAI_API_KEY` | For LLM judge (OpenAI models) | -- | Standard OpenAI API key. |
| `ANTHROPIC_API_KEY` | For agent sessions | -- | Standard Anthropic API key. Used by the Agent SDK. |

## Key design decisions

**Agent SDK over `claude -p`.** Claude Code's `claude -p` subprocess mode refuses to launch inside another Claude Code session (nested session restriction). The Agent SDK's `query()` function avoids this entirely, making evals runnable from any context.

**OpenAI for the judge.** Using the same model family for both agent and judge creates self-evaluation bias. OpenAI models are also cheaper for the simple binary classification the judge performs. The provider abstraction supports Anthropic judges if needed via `EVAL_JUDGE_MODEL`.

**Binary pass/fail.** Behavioral compliance is a yes/no question: did the agent suggest checkpoint, or did it not? Scoring on a 1-5 scale adds noise without adding signal for these types of checks.

**`settingSources: ['user', 'project', 'local']` is required.** Without this option, the Agent SDK does not load `.claude/skills/` or `.claude/settings.json` from the working directory. The agent would never discover Orchestra's SKILL.md or hook configuration, causing every behavioral eval to fail.

**`max_completion_tokens` not `max_tokens`.** The OpenAI provider uses `max_completion_tokens` because `gpt-5.4-mini` and newer OpenAI models require this parameter name. Using `max_tokens` causes an API error.

**Deterministic checks before LLM judge.** When you can answer the question by scanning the transcript for a specific tool call, do that first. It is faster (no API call), cheaper (no tokens), and more reliable (no judge hallucination). The LLM judge is only the fallback for fuzzy behavioral questions that transcript scanning cannot answer.

## Debugging failed evals

### Check saved transcripts

Failed sessions are saved to `evals/runs/` as JSON:

```
evals/runs/user-done-suggests-checkpoint-2026-03-25T23-10-03-418Z.json
```

The filename is `{suite-name}-{ISO-timestamp}.json`.

### Reading transcript JSON

The JSON contains the full `SessionResult` with fields: `toolCalls` (summary of what the agent did), `exitReason`, `duration`, `output` (final assistant text), `transcript` (raw SDK messages), `model`, `turnsUsed`, `estimatedCost`. Look at `toolCalls` for a quick overview; dig into `transcript` for the full message-by-message exchange.

### Common failure modes

**Skill not found.** The agent never calls the Skill tool. Check that `settingSources` includes `'project'` and `'local'`, and that `setup.ts` correctly installs SKILL.md into `.claude/skills/o/SKILL.md` in the temp directory.

**Judge API error.** Usually a parameter mismatch. If you switch to a new OpenAI model, check whether it requires `max_completion_tokens` or `max_tokens`. If you switch to an Anthropic judge, ensure `@anthropic-ai/sdk` is installed.

**Timeout.** The agent ran out of turns or wall-clock time before completing the task. Increase `maxTurns` or `timeout` in the test case's `session` config. Check the transcript to see if the agent got stuck in a loop.

**Judge false negative.** The agent did the right thing but the judge said fail. Check the judge's `rationale` in the test output. Tighten the `passCriteria` to be more specific about what counts, or add a deterministic check that catches the common case before the judge runs.

**Flaky pass/fail.** Behavioral evals have inherent variance. If a test flips between pass and fail, make the prompt more explicit about expected behavior or add stronger deterministic checks.
