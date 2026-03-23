# Orchestra

**Agents coordinate through files, not through you.**

When you work with multiple AI agents across repos, YOU become the coordination bottleneck. You transfer context manually. You repeat decisions. You re-explain architecture every session. You are the world's most expensive message bus.

Orchestra fixes this. Agents read and write structured files. Context flows through the filesystem, not through your clipboard.

## What is Orchestra

Orchestra is not a CLI tool, not a framework, not a SaaS.

It is:

- A **skill pack** (`SKILL.md` + `/o` command) for Claude Code
- A **hooks pack** (lifecycle automation — deterministic, never forgotten)
- A **directory convention** (`.orchestra/`)
- A **setup script**

Install once, works everywhere. Same pattern as [gstack](https://github.com/garrytan/gstack/).

## How it works

```
You describe work         →  agent creates a thread
Research together          →  agent writes the spec
"Let's build it"          →  agent generates briefings per repo
Agents work in parallel   →  hooks auto-capture progress
Agents verify their work  →  verification.md tracks pass/fail
You come back             →  /o shows status, flags gaps, audits docs
```

No orchestration server. No message queue. Files on disk, read by agents.

## Install — 30 seconds

**Step 1:** Clone Orchestra to a permanent location.

```bash
git clone https://github.com/orchestrahq/orchestra.git ~/.orchestra
```

**Step 2:** Open Claude Code and paste this. Claude does the rest.

> Set up Orchestra. It's installed at `~/.orchestra`. Ask me: "What repos do you want to coordinate? Give me the full paths, a parent directory, or just one repo." If I give one repo, run `~/.orchestra/setup init <repo-path>` then `~/.orchestra/setup link <repo-path>`. If I give multiple repos or a directory containing repos, run `~/.orchestra/setup init <parent-directory>` (use the directory I gave you, or the common parent of the repos), then run `~/.orchestra/setup link <repo-path>` for each repo. After linking, add an "Orchestra" section to each repo's CLAUDE.md that says: this repo uses Orchestra for multi-agent coordination, the `/o` command shows status, memory and progress are auto-injected via hooks, and when finishing work always write a handoff if the next agent needs context.

Claude asks for your repos, figures out the right setup, links everything, and installs hooks. Every future session starts with full project context — no commands needed.

### Manual install

```bash
git clone https://github.com/orchestrahq/orchestra.git ~/.orchestra

# 1. Create .orchestra/ wherever you want
~/.orchestra/setup init ~/Projects/pied-piper

# 2. Link repos — they don't need to be in the same directory
~/.orchestra/setup link ~/Projects/pied-piper-api
~/.orchestra/setup link ~/Work/pied-piper-frontend
~/.orchestra/setup link /opt/repos/pied-piper-infra
```

Each linked repo gets:
- `.orchestra.link` — one-line pointer to the shared `.orchestra/` directory (auto-gitignored, contains absolute paths)
- `.claude/skills/o/SKILL.md` — the `/o` command
- `.claude/settings.json` — lifecycle hooks installed

## Directory structure

Orchestra uses a single `.orchestra/` directory at your project root (or a shared location for multi-repo setups):

```
.orchestra/
├── orchestra.yaml          # project config
├── plan.md                 # master plan
├── MEMORY.md               # curated long-term memory
├── memory/                 # daily logs (auto-captured)
│   ├── 2026-03-20.md
│   └── 2026-03-21.md
├── state/                  # machine-readable progress
│   ├── progress.yaml
│   ├── blocked.yaml
│   └── session-context.md  # volatile — current session scratchpad
├── decisions/              # append-only architectural decisions
│   ├── 001-use-postgres.md
│   └── 002-api-versioning.md
├── threads/                # units of work
│   ├── compress-video-pipeline/
│   │   ├── spec.md
│   │   ├── verification.md
│   │   ├── research.md
│   │   └── conversation.md
│   └── auth-migration/
├── briefings/              # generated task docs for agents
│   ├── pied-piper-api--compress-video-pipeline.md
│   └── pied-piper-frontend--compress-video-pipeline.md
├── sessions/               # curated agent work logs
│   ├── 2026-03-20-api-refactor.md
│   └── 2026-03-21-frontend-auth.md
├── handoffs/               # agent-to-agent async messages
│   └── api-to-frontend--new-endpoints-ready.md
└── templates/              # templates for all file types
```

## Key concepts

### Skills vs Hooks

Skills are intelligence — the agent decides when and how to use them.

| Command | What it does |
|---------|-------------|
| `/o` | Executive dashboard — roadmap, risks, what needs your attention |
| `/o list` | List all threads with status and progress |
| `/o active` | What the agent thinks we're working on right now |
| `/o <thread>` | Deep dive into a specific workstream |
| `/o update` | Pull latest Orchestra and sync all repos |

Hooks are mechanics — deterministic, fires every time, never forgotten. `SessionStart` injects memory. `Stop` captures session boundaries. You don't invoke hooks. They just run.

### Memory

Two tiers:

| Tier | File | Who writes | Lifespan |
|------|------|-----------|----------|
| Curated | `MEMORY.md` | Agent (with your approval) | Permanent — architectural truths, team conventions, key decisions |
| Daily logs | `memory/YYYY-MM-DD.md` | Hooks (automatic) | Rolling — what happened today, auto-pruned after 30 days |

Both are auto-injected at session start. You never type "here's the context."

### Compaction survival

Long sessions get compacted by Claude Code — the conversation is summarized and older messages are dropped. This destroys in-flight context. Orchestra solves this with continuous flush:

- The agent maintains `state/session-context.md` — a volatile scratchpad updated after every significant action (not at the end, not before compaction, but continuously)
- `PreCompact` hook echoes session context into the compaction input so the summarizer preserves it
- `PostCompact` hook re-injects session context + memory + progress from disk

No manual intervention. No "write this down before it compacts." The context is already on disk because the agent keeps it current.

### Threads

A thread is any unit of work — a feature, a bug, a spike, an investigation. It lives in `threads/<name>/` and contains everything: spec, verification, research, conversation history. Threads are the unit of planning and the input to briefing generation.

### Verification

Every thread has a `verification.md` — the gate between "code was written" and "done." Two phases:

1. **Automated** — agent runs test suites, typecheck, lint, API smoke tests, browser QA. No human needed.
2. **Human-assisted** — agent tells you exactly what to manually test, what to look for, and what context to feed back (logs, screenshots, errors).

A progress item can't be marked `done` until all verification items PASS.

### Briefings

A briefing is a generated, self-contained task document. Everything an agent needs to do the work — in one file. Context, constraints, acceptance criteria, relevant code paths. Generated from threads, scoped to a specific repo.

```
threads/compress-video-pipeline/     →  briefings/pied-piper-api--compress-video-pipeline.md
                                     →  briefings/pied-piper-frontend--compress-video-pipeline.md
```

One thread, multiple briefings. Each agent gets exactly what it needs.

### Handoffs

Agent-to-agent async messages. When an agent finishes work that another agent depends on, it writes a handoff:

```yaml
# handoffs/api-to-frontend--new-endpoints-ready.md
from: pied-piper-api
to: pied-piper-frontend
thread: compress-video-pipeline
---
New endpoints landed. POST /api/v1/compress accepts multipart upload.
Response schema changed — `job_id` is now a UUID, not an integer.
See briefing for updated types.
```

The receiving agent picks this up at session start. No Slack message. No copy-paste.

## Works with

Orchestra is agent-agnostic. It works with anything that reads files.

| Agent | Integration | How |
|-------|------------|-----|
| **Claude Code** | First-class | Hooks + skills (`/o` command) |
| **Codex** | Supported | `AGENTS.md` injection |
| **Cursor** | Supported | `.cursor/rules/` injection |
| **OpenCode** | Supported | `.opencode/instructions.md` injection |
| **Any agent** | Compatible | Reads `.orchestra/` files directly |

## Project topologies

**Monorepo** — one repo, multiple workspaces. Single `.orchestra/` at the root.

**Multi-repo** — separate repos, linked together. Each repo gets an `.orchestra.link` file pointing to the shared `.orchestra/` directory. Repos don't need to be co-located:

```
# pied-piper-api/.orchestra.link
root: /Users/richard/Projects/pied-piper/.orchestra
```

## Auto-update

Orchestra checks for updates when you invoke `/o`. If a newer version exists on GitHub, the agent tells you and asks if you want to update. Updates are a `git pull` + re-link — takes seconds, no data lost.

To check manually: `~/.orchestra/bin/orchestra-update-check`

## The insight

The bottleneck in agent teams isn't intelligence — it's context transfer.

Orchestra's `SessionStart` hook means you never open an agent to a blank slate. Every session starts with project memory, recent activity, and current progress — without typing a single command.

The best coordination system is one you forget is running.

## License

MIT. See [LICENSE](LICENSE).
