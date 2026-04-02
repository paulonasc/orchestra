# Contributing to Orchestra

Thanks for wanting to make Orchestra better. Whether you're fixing a hook script, improving the `/o` skill, or adding new eval cases, this guide gets you up and running.

## Quick start

```bash
git clone <repo> && cd orchestra
bun install
```

Orchestra is a SKILL.md + hooks + setup script. There's no build step for the core — edit files and they take effect immediately in linked repos.

## How Orchestra is structured

```
orchestra/
├── SKILL.md              # the /o command (generated from templates + resolvers)
├── VERSION               # single source of truth for version
├── setup                 # init, link, sync commands
├── bin/
│   ├── orchestra-update-check
│   └── orchestra-changelog
├── hooks/                # bash hooks for Claude Code lifecycle
│   ├── orchestra-session-start.sh
│   ├── orchestra-pre-compact.sh
│   ├── orchestra-post-compact.sh
│   ├── orchestra-post-tool-nudge.sh
│   ├── orchestra-stop.sh
│   ├── orchestra-subagent-stop.sh
│   └── lib.sh
├── templates/            # thread document templates
├── channels/             # multi-agent awareness rules per host
├── evals/
│   ├── cases/            # behavioral evals (Agent SDK + LLM judge)
│   │   ├── router/       # dispatch mechanism tests
│   │   ├── checkpoint/   # writing, triggers, nudge tests
│   │   ├── routing/      # CLAUDE.md routing rules
│   │   ├── session/      # compaction, concurrent, context
│   │   ├── discovery/    # zero-context, plan routing
│   │   ├── decisions/    # recording, implicit
│   │   ├── verification/ # updates, implicit
│   │   ├── regressions/  # plan routing bugs
│   │   ├── identity/     # agent knows Orchestra
│   │   └── stats/        # telemetry command
│   ├── helpers/          # session runner, judge, providers
│   └── hooks/            # hook unit tests (bash)
└── changelog/            # per-version changelogs
```

## Development workflow

### 1. Link your checkout to a test project

```bash
# In a project where you use Orchestra
./setup link ~/Projects/my-app

# Now /o in that project uses your local checkout
```

### 2. Edit and test

- **Hook scripts** (`hooks/`): Changes are live immediately — hooks are referenced by path from the installed `settings.json`.
- **SKILL.md**: Edit the skill file. Next `/o` invocation picks up changes. The preamble auto-syncs if the source is newer than the installed copy.
- **Templates** (`templates/`): Used when creating new threads — changes apply to new threads only.
- **Setup script**: Test with `./setup init /tmp/test-orchestra && ./setup link /tmp/test-repo`.

### 3. Run tests

```bash
# Hook unit tests (fast, free)
bun test evals/hooks/

# All deterministic tests
bun test evals/

# Behavioral evals (needs Claude auth + OPENAI_API_KEY for judge)
EVALS=1 bun test evals/cases/
```

## Testing & evals

### Test tiers

| Tier | Command | Cost | What it tests |
|------|---------|------|---------------|
| 1 — Hook tests | `bun test evals/hooks/` | Free | Hook scripts produce correct output |
| 2 — Deterministic | `bun test evals/` | Free | Hook output assertions, template validation |
| 3 — Behavioral | `EVALS=1 bun test evals/cases/` | ~$2-5 | Real Claude Code sessions via Agent SDK + LLM judge |

### Behavioral evals

These spawn real Claude Code sessions and verify the agent uses Orchestra correctly:

- **Checkpoint evals**: Does `/o checkpoint` write correct files, include decisions, include research?
- **Concurrent sessions**: Do two agents avoid conflicts?
- **Decision recording**: Does the agent record decisions without being explicitly told?
- **Verification**: Does the agent update verification.md after running tests?
- **Compaction survival**: Does state survive context compaction?
- **Nudge triggers**: Does the post-tool nudge actually trigger checkpoints?
- **Plan routing**: Do plans get written to `.orchestra/` correctly?

Evals use the Agent SDK (`@anthropic-ai/claude-agent-sdk`) to spawn sessions and OpenAI as the LLM judge for pass/fail scoring.

```bash
# Run a single eval
EVALS=1 bun test evals/cases/checkpoint/checkpoint-writes-correct-files.test.ts

# Run all behavioral evals (recursive)
EVALS=1 bun test evals/cases/

# Run all evals in a category
EVALS=1 bun test evals/cases/checkpoint/
```

### Adding a new eval

1. Create `evals/cases/<category>/your-behavior.test.ts`
2. Use the session runner from `evals/helpers/session-runner.ts`
3. Use the judge from `evals/helpers/judge.ts` for pass/fail
4. **Add provenance to the JSDoc header** (see format below)
5. Test it: `EVALS=1 bun test evals/cases/<category>/your-behavior.test.ts`

### Where to put new evals

| If your eval tests... | Put it in |
|----------------------|-----------|
| Router dispatch (reads correct command file) | `evals/cases/router/` |
| Checkpoint behavior (writing, triggers, nudge) | `evals/cases/checkpoint/` |
| CLAUDE.md routing rules ("looks good" → action) | `evals/cases/routing/` |
| Zero-context discovery, plan routing | `evals/cases/discovery/` |
| Decision recording | `evals/cases/decisions/` |
| Verification updates | `evals/cases/verification/` |
| Agent identity/awareness | `evals/cases/identity/` |
| Stats/telemetry commands | `evals/cases/stats/` |
| Sessions, compaction, concurrency | `evals/cases/session/` |
| Bug regressions | `evals/cases/regressions/` |

### Eval provenance (required)

Every eval must document WHERE it came from in its JSDoc header. This tells future maintainers why the test exists and whether the scenario is theoretical or battle-tested.

Use the `@origin` tag with one of these types:

```typescript
/**
 * Case N: What this eval tests.
 *
 * @origin real-user — Paulo hit this during a long coding session where
 *   the agent forgot to checkpoint after saying "looks good"
 *
 * @origin regression — v0.0.20 broke checkpoint thread file writes,
 *   this eval catches the specific failure pattern
 *
 * @origin research — ETH Zurich "Evaluating AGENTS.md" (Feb 2026)
 *   showed passive breadcrumbs don't change agent behavior
 *   https://arxiv.org/html/2602.11988v1
 *
 * @origin synthetic — hypothetical scenario testing whether the agent
 *   discovers .orchestra/ with zero prompt context
 *
 * @origin external — Gemini CLI issue #22261 documented that agents
 *   skip bookkeeping 40% of the time with complex coding tasks
 *   https://github.com/google-gemini/gemini-cli/issues/22261
 */
```

Origin types:

| Type | When to use |
|------|-------------|
| `real-user` | A real person experienced this failure. Include who and when. |
| `regression` | A code change broke something. Include which version/commit. |
| `research` | Based on published research or study. Include URL. |
| `synthetic` | Hypothetical scenario, not yet observed in the wild. |
| `external` | Observed in another tool/project. Include source URL. |

This takes 1 line to add but makes a huge difference when deciding whether to keep, modify, or delete an eval during refactors.

### Eval integrity — do NOT weaken tests to make them pass

**Evals exist to push the system forward.** The fact that a test is hard is exactly why it exists. When an eval fails, the correct response is to improve the system (prompts, SKILL.md, hooks, architecture) — not to simplify the test.

Rules:
- **Never simplify an eval prompt** to make it pass unless the original prompt was testing the wrong thing
- **Never change assertions** to accept weaker behavior unless the original assertion was incorrect
- **Hard variants (`*-hard.test.ts`) must NEVER be modified to pass.** They represent the realistic scenario. Improve the system until they pass.
- **Baseline variants** test the minimum behavior and should always pass. These gate releases.
- When a hard test fails, treat it as a signal: "our system isn't good enough yet for this case"
- Document WHY you changed an eval if you ever modify one — in the commit message AND the JSDoc

The goal is to **hill-climb**: make the system better until hard evals pass, not make evals easier until they pass on a weak system.

## Working on hooks

Hook scripts live in `hooks/` and are installed into each linked repo's `.claude/settings.json`. They fire on Claude Code lifecycle events:

| Hook | Event | Purpose |
|------|-------|---------|
| `orchestra-session-start.sh` | SessionStart | Inject context, memory, progress into session |
| `orchestra-pre-compact.sh` | PreCompact | Flush breadcrumb to daily log before compaction |
| `orchestra-post-compact.sh` | PostCompact | Re-inject context after compaction |
| `orchestra-post-tool-nudge.sh` | PostToolUse | Count edits, nudge checkpoint after threshold |
| `orchestra-stop.sh` | Stop | Clean up session file |
| `orchestra-subagent-stop.sh` | SubagentStop | Clean up subagent state |

Shared utilities live in `lib.sh`. Hook scripts must be fast (< 1s) — they run on every tool use in the nudge case.

### Testing hooks

```bash
# Run hook unit tests
bun test evals/hooks/

# Manual test — source lib.sh and call functions
source hooks/lib.sh
```

## Working on the SKILL.md

The `/o` skill is the main user-facing interface. When editing:

- Keep the preamble bash block fast — it runs on every invocation
- Routing rules in the `description` frontmatter field determine when Claude proactively suggests `/o`
- Subcommand behavior is defined in the body — each section maps to a `/o <subcommand>`
- The context budget section governs when to delegate to subagents vs. inline writes

## Pull request process

All contributions go through pull requests. **Paulo ([@paulonasc](https://github.com/paulonasc)) reviews and approves all PRs.**

### Before opening a PR

**Evals are mandatory.** Do not open a PR without running them.

1. **Run deterministic tests**: `bun test evals/` — these MUST pass (free, <2s)
2. **Run behavioral evals**: `EVALS=1 bun test evals/cases/` — these MUST pass if you changed hooks, SKILL.md, or setup. Needs `.env` with `OPENAI_API_KEY` (for judge).
3. **Include eval output** in the PR description — paste the pass/fail summary
4. **Test manually**: Use Orchestra in a real project with your changes

If an eval fails, fix the issue — don't skip the eval. If the eval itself is wrong (testing outdated behavior), update the eval in the same PR with an explanation.

### PR guidelines

- **Keep PRs focused**: One feature, one fix, or one improvement per PR
- **Include context**: Explain *why*, not just *what*. If the change was motivated by a real failure, describe it
- **Update evals**: If you're adding behavior, add an eval that tests it. If you're fixing a bug, add an eval that catches the regression
- **Don't break existing evals**: If an eval needs updating because of your change, update it in the same PR with an explanation

### What makes a good contribution

- Bug fixes with reproduction steps
- New eval cases that catch real failure modes
- Hook improvements that reduce latency or improve reliability
- SKILL.md improvements that make the agent behave more correctly
- Support for new agent hosts (Cursor rules, Codex AGENTS.md, etc.)
- Documentation improvements

### What to avoid

- Large refactors without prior discussion — open an issue first
- Changes that break the hook contract (scripts must remain fast and idempotent)
- Adding dependencies unless absolutely necessary (Orchestra is intentionally lightweight)

## Coding agents contributing

AI agents are welcome contributors. The same rules apply — PRs need Paulo's approval. When contributing as an agent:

- **Run all evals before opening the PR** — both `bun test evals/` AND `EVALS=1 bun test evals/cases/`
- **If evals fail, fix the issue** — iterate on your changes until evals pass. Do not open a PR with failing evals.
- **Include the eval output** in the PR description — paste the full pass/fail summary
- **Explain your reasoning** in the PR body — the reviewer needs to understand *why* you made each choice
- **Don't auto-merge** — all PRs wait for human review

## Version and changelog

- Version lives in `VERSION` — single source of truth
- Changelogs live in `changelog/` as individual markdown files per version
- Version bumps happen at ship time, not during development

### Releasing a new version

**All evals must pass before releasing.** The release flow:

```bash
# 1. Run all evals (mandatory)
bun test evals/                         # deterministic — must pass
EVALS=1 bun test evals/cases/          # behavioral — must pass

# 2. Bump version + generate changelog
bin/orchestra-release patch             # or: minor, major, auto

# 3. Push
git push origin main --tags

# 4. Distribute to linked repos
./setup sync
```

`bin/orchestra-release` auto-detects the bump level from git log if you don't specify one (feat commits → minor, everything else → patch). It bumps VERSION, updates package.json, generates `changelog/X.Y.Z.md`, commits, and tags.

Alternatively, use `/o release` inside Claude Code — it presents an AskUserQuestion with patch/minor/major options and a recommendation.

## Things to know

- **No build step for core**: SKILL.md, hooks, and setup are plain text/bash. Edit and go.
- **Evals need API keys**: Behavioral evals need `ANTHROPIC_API_KEY` (Claude) and `OPENAI_API_KEY` (judge). Set them in `.env`.
- **Hooks must be idempotent**: They can fire multiple times. Don't assume single execution.
- **`.orchestra/` is the user's state**: Never commit `.orchestra/` contents. It's per-project, per-user.
- **SKILL.md auto-syncs**: The preamble checks if the source is newer than the installed copy and re-installs automatically.

## Getting help

- Open an issue for bugs or feature requests
- Check existing issues and PRs before starting work — someone may already be on it
