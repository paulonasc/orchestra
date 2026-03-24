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
- An **awareness layer** (trigger-action rules + auto-scheduling heartbeat)
- A **setup script**

Install once, works everywhere. Same pattern as [gstack](https://github.com/garrytan/gstack/).

## How it works

```
You describe work         →  agent creates a thread (spec + conversation)
Research together          →  agent writes research.md
Plan the approach          →  agent writes plan.md (all milestones upfront)
"Let's build it"          →  agent generates briefings per repo
Agents work in parallel   →  hooks auto-capture progress
Heartbeat keeps state fresh →  /o heartbeat auto-checks every 30 min
Agents verify their work  →  verification.md tracks pass/fail
You come back             →  /o shows status, flags gaps, audits docs
Thread ships              →  /o close — thread drops out of dashboard
```

No orchestration server. No message queue. Files on disk, read by agents.

## Install — 30 seconds

**Step 1:** Clone Orchestra to a permanent location.

```bash
git clone https://github.com/orchestrahq/orchestra.git ~/.orchestra
```

**Step 2:** Open Claude Code and paste this. Claude does the rest.

> Set up Orchestra. It's installed at `~/.orchestra`. Ask me: "What repos do you want to coordinate? Give me the full paths, a parent directory, or just one repo." If I give one repo, run `~/.orchestra/setup init <repo-path>` then `~/.orchestra/setup link <repo-path>`. If I give multiple repos or a directory containing repos, run `~/.orchestra/setup init <parent-directory>` (use the directory I gave you, or the common parent of the repos), then run `~/.orchestra/setup link <repo-path>` for each repo. The link command auto-injects Orchestra awareness rules into the repo's CLAUDE.md (trigger-action pairs so agents update state after commits, merges, decisions) and installs hooks that auto-enable heartbeat on every session start.

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
- `.orchestra.link` — one-line pointer to the shared `.orchestra/` directory (auto-gitignored)
- `.orchestra/` directory added to `.gitignore` (if `.orchestra/` lives inside the repo)
- `.claude/skills/o/SKILL.md` — the `/o` command
- `.claude/settings.json` — lifecycle hooks installed
- **Instruction file rules** — trigger-action pairs injected into CLAUDE.md, AGENTS.md, or .cursor/rules (agent-agnostic awareness)

## Directory structure

Orchestra uses a single `.orchestra/` directory at your project root (or a shared location for multi-repo setups):

```
.orchestra/
├── orchestra.yaml          # project config
├── MEMORY.md               # curated long-term memory
├── BACKLOG.md              # project-wide tech debt, future work, investigations
├── memory/                 # daily logs (auto-captured)
│   ├── 2026-03-20.md
│   └── 2026-03-21.md
├── state/                  # machine-readable state
│   ├── active-thread.md
│   ├── blocked.yaml
│   └── session-context.md  # volatile — current session scratchpad
├── decisions/              # append-only architectural decisions
│   ├── 001-use-postgres.md
│   └── 002-api-versioning.md
├── threads/                # units of work
│   ├── compress-video-pipeline/
│   │   ├── spec.md
│   │   ├── plan.md
│   │   ├── progress.yaml       # per-thread milestones and items
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
| `/o` | Executive dashboard — full roadmap with overall %, risks, what needs your attention, contextual hints |
| `/o list` | List all threads with status and progress |
| `/o active` | What the agent thinks we're working on right now |
| `/o <thread>` | Deep dive into a specific workstream |
| `/o plan` | Show the plan for the active thread |
| `/o import` | Import external docs (plans, research, specs) into a thread |
| `/o docs` | Audit repo docs against recent changes, fix what's stale |
| `/o checkpoint` | Flush all context to disk — compaction-proof snapshot |
| `/o close` | Mark active thread as completed (shipped) or abandoned |
| `/o reopen` | Reopen a completed or abandoned thread |
| `/o heartbeat` | Audit state every 30 min. Auto-enabled on first `/o` run. Deduplicates cron jobs to prevent leaks. |
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
- `PostCompact` hook re-injects session context + memory + progress + backlog from disk

No manual intervention. No "write this down before it compacts." The context is already on disk because the agent keeps it current. For an explicit full save, `/o checkpoint` flushes everything — session context, progress, verification, daily log, memory — in one shot.

### Threads

A thread is any unit of work — a feature, a bug, a spike, an investigation. It lives in `threads/<name>/` and follows a lifecycle: **chat → research → plan → execute & iterate → close**.

Each thread contains: spec (with risks and alternatives considered), plan (milestones and phases), progress (per-thread `progress.yaml`), verification, research, conversation history. When a plan is committed, all milestones populate the thread's `progress.yaml` upfront.

Threads have a `status` field in their `progress.yaml`: `active`, `completed`, or `abandoned`. The `/o` dashboard only aggregates active threads — completed and abandoned threads are excluded from the roadmap percentage and session injection, keeping context lean as threads accumulate. `/o close` marks a thread as shipped; `/o reopen` brings it back if needed.

You don't have to remember to close threads. When the agent detects a merge signal — you say "PR merged", a `gh pr view` shows MERGED, or all items are done and verified — it prompts you: *"Looks like this thread is shipped. Close it?"* One confirmation, done.

### Verification

Every thread has a `verification.md` — the gate between "code was written" and "done." Two phases:

1. **Automated** — agent runs test suites, typecheck, lint, API smoke tests, browser QA. No human needed.
2. **Human-assisted** — agent tells you exactly what to manually test, what to look for, and what context to feed back (logs, screenshots, errors).

When you report results back ("I ran terraform plan and got X"), the agent records it in `verification.md` and updates progress automatically. Progress captured from both sides — agent work and user work.

The agent proactively discovers existing tests in the repo and proposes a verification strategy if none exists. When importing work done outside Orchestra, items are marked `in_progress` (not `done`) until verification passes — no unverified "100% complete" dashboards.

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

### Backlog

`BACKLOG.md` lives at the `.orchestra/` root — a project-wide list of tech debt, future improvements, and things to investigate. The problem it solves: agents working on thread A discover something for thread B, write it in thread A's conversation.md, and it's never seen again. The backlog is the escape hatch.

Auto-injected at session start (after active thread and progress — it's background reference, not active context). Three categories: **Future improvements**, **Tech debt**, **Investigate**. One line per item with a thread reference back to full context. Cap at 50 items. When an item gets prioritized, it graduates to a full thread — remove it from the backlog.

### Documentation sync

Agents update docs **at the moment the change happens** — not as an end-of-session chore. Made an architecture decision? Record it in `decisions/` now. Hit a deployment gotcha? Write it to `MEMORY.md` now. Changed an API? Update `CLAUDE.md` now. The SKILL.md defines specific triggers (decision made, gotcha found, endpoint changed, milestone completed) that tell the agent to stop and update docs immediately.

`/o docs` runs a full audit as a safety net: scans all docs against recent git changes, reports what's stale, and offers to fix it. But the goal is that docs are already current before you need to run it.

### Importing context

Plans, research, and specs created outside Orchestra can be imported into threads with `/o import`. The agent reads the content, auto-detects the type (plan, research, spec, or general context), asks whether to import into an existing thread or create a new one, normalizes it to Orchestra's format, and populates `progress.yaml` if milestones are detected. No manual file copying or reformatting needed.

### Agent awareness

The biggest failure mode in agent coordination: the agent gets deep into coding and forgets to update state. Decisions go unrecorded, progress isn't tracked, docs go stale. You end up saying "btw update orchestra" every 30 minutes.

Orchestra solves this with three layers, plus a context-saving delegation pattern:

**Layer 1 — Instruction file rules (all agents).** During `setup link`, Orchestra injects trigger-action rules directly into the repo's instruction file (CLAUDE.md, AGENTS.md, .cursor/rules). These are specific: "after you commit code, update session-context.md and daily log." Works across every agent. Zero runtime cost.

**Layer 2 — `/o heartbeat` with auto-schedule (Claude Code).** Fully automatic. Heartbeat is set up on the first `/o` dashboard invocation each session — NOT by hooks (hooks triggering heartbeat caused compaction loops). Cron scheduling happens deterministically in the main agent context (3 tool calls: list, delete all, create). The cron uses a minimal inline prompt — never `/o heartbeat` — to prevent recursive invocation. State audit file writes are delegated to background subagents to protect the main context window.

**Layer 3 — Channels heartbeat (Claude Code, future).** Claude Code Channels (v2.1.80+, research preview) allow MCP servers to push events into a running session. An Orchestra Channel server could fire on git commits instead of a timer — true event-driven awareness. Blocked on Channels stabilizing (known bugs in v2.1.80-81).

**Subagent delegation — protect the main context window.** Heavy operations like `/o checkpoint`, `/o docs`, and post-work audits read and write many files. Instead of doing this inline (which fills the context window and accelerates compaction), Orchestra instructs the agent to spawn background subagents for multi-file writes. The main agent passes all relevant context in the subagent prompt; the subagent writes to `.orchestra/` files and returns a one-line summary. The files themselves are the persistent log — no context is lost.

## Works with

Orchestra is agent-agnostic. It works with anything that reads files.

| Agent | Integration | How |
|-------|------------|-----|
| **Claude Code** | First-class | Hooks + skills (`/o`) + auto-scheduling heartbeat |
| **Codex** | Supported | `AGENTS.md` injection + trigger-action rules |
| **Cursor** | Supported | `.cursor/rules/` injection + trigger-action rules |
| **OpenCode** | Supported | `.opencode/instructions.md` injection |
| **Any agent** | Compatible | Reads `.orchestra/` files directly |

## Project topologies

**Monorepo** — one repo, multiple workspaces. Single `.orchestra/` at the root.

**Multi-repo** — separate repos, linked together. Each repo gets an `.orchestra.link` file pointing to the shared `.orchestra/` directory. Repos don't need to be co-located:

```
# pied-piper-api/.orchestra.link
root: /Users/richard/Projects/pied-piper/.orchestra
```

**Worktrees** — git worktrees work with zero setup. `.orchestra.link` is gitignored (machine-specific paths), so worktrees don't have it. Orchestra detects this automatically: if `.orchestra.link` is missing, it checks the main worktree for the link file. Agents in worktrees get full Orchestra context — threads, memory, progress, everything.

## Auto-sync & Auto-update

**Auto-sync (local):** Every `/o` invocation checks if the installed SKILL.md is stale compared to the source in the Orchestra repo. If so, it re-installs automatically — no manual `setup sync` needed. Edit Orchestra once, every linked repo picks it up on next `/o`.

**Auto-update (remote):** Orchestra checks for updates on GitHub when you invoke `/o`. If a newer version exists, the agent tells you and asks if you want to update. `/o update` does a `git pull` + re-link + shows what's new (changelog). Takes seconds, no data lost.

**Changelog:** Each release has a `changelog/<version>.md` file. After update, the agent presents new features and prompts for any setup actions (like enabling heartbeat). New features are never silent.

To check manually: `~/.orchestra/bin/orchestra-update-check`

## The insight

The bottleneck in agent teams isn't intelligence — it's context transfer.

Orchestra's `SessionStart` hook means you never open an agent to a blank slate. Every session starts with project memory, recent activity, and current progress — without typing a single command.

The best coordination system is one you forget is running.

## License

MIT. See [LICENSE](LICENSE).
