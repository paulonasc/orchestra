# Orchestra

**The memory layer for AI agents.**

AI agents are stateless. Every session starts from zero — no memory of what was built, what was decided, what failed. You become the context bus: re-explaining architecture, repeating decisions, copy-pasting between terminals. Orchestra fixes this by giving agents a shared filesystem-based memory that persists across sessions, survives compaction, and works across multiple repos.

Orchestra is not a workflow engine, not a task runner, not a CLI framework. It doesn't *do* work — it *remembers* work. Workflow tools (like [gstack](https://github.com/garrytan/gstack/)) handle actions (QA, review, ship). Orchestra handles state (where are we, what happened, what's next). They're different layers — use both.

## How it works

```
.orchestra/
├── MEMORY.md                    # what we learned (permanent)
├── memory/2026-03-24.md         # what happened today (auto-captured)
├── state/
│   ├── active-thread.md         # what we're working on
│   └── sessions/                # per-session context (concurrent-safe)
├── decisions/                   # why we chose X over Y
├── threads/
│   └── 001-auth-migration/
│       ├── spec.md              # what we're building and why
│       ├── plan.md              # how we're building it
│       ├── progress.yaml        # what's done, what's left
│       ├── verification.md      # what's tested, what's not
│       └── conversation.md      # design decisions, findings
├── briefings/                   # scoped task docs per repo
└── handoffs/                    # agent-to-agent async messages
```

Agents read and write these files. Hooks auto-inject context at session start. The `/o` command gives you a dashboard. That's the whole system.

## What Orchestra solves

| Problem | Without Orchestra | With Orchestra |
|---------|------------------|----------------|
| New session | "Here's what we did last time..." (you explain) | Agent reads state, memory, progress — knows everything |
| Context compaction | Agent forgets mid-session decisions | Session context continuously flushed to disk, re-injected after compaction |
| Multi-repo work | You copy-paste between terminals | Shared `.orchestra/` dir, briefings scoped per repo, handoffs between agents |
| Concurrent sessions | Two agents stomp on each other's state | Session-scoped context files, auto-detected with warnings |
| "Did we decide X?" | You dig through chat history | `decisions/` directory, append-only, searchable |
| Agent forgets to update state | You say "btw update orchestra" every 30 min | Blocking rules (must save research before coding) + heartbeat auto-checks |

## Install — 30 seconds

**Step 1:** Clone Orchestra.

```bash
git clone https://github.com/orchestrahq/orchestra.git ~/.orchestra
```

**Step 2:** Open Claude Code and paste this:

> Set up Orchestra. It's installed at `~/.orchestra`. Ask me which repos to coordinate, then run `~/.orchestra/setup init <path>` and `~/.orchestra/setup link <repo>` for each one.

Claude handles the rest — links repos, installs hooks, injects awareness rules.

### Manual install

```bash
git clone https://github.com/orchestrahq/orchestra.git ~/.orchestra

# Create .orchestra/ wherever you want
~/.orchestra/setup init ~/Projects/pied-piper

# Link repos — they don't need to be co-located
~/.orchestra/setup link ~/Projects/pied-piper-api
~/.orchestra/setup link ~/Work/pied-piper-frontend
~/.orchestra/setup link /opt/repos/pied-piper-infra
```

Each linked repo gets:
- `.orchestra.link` — pointer to the shared `.orchestra/` directory
- `.claude/skills/o/SKILL.md` — the `/o` command
- `.claude/settings.json` — lifecycle hooks
- **Awareness rules** in CLAUDE.md (safely scoped between HTML comment markers — your content is never touched)

## The `/o` command

| Command | What it does |
|---------|-------------|
| `/o` | Executive dashboard — roadmap %, risks, what needs attention |
| `/o list` | All threads with status and progress |
| `/o <thread>` | Deep dive into a specific workstream |
| `/o plan` | Show the plan for the active thread |
| `/o import` | Import external docs (plans, research, specs) into a thread |
| `/o docs` | Audit repo docs against recent changes, fix what's stale |
| `/o checkpoint` | Flush all context to disk — compaction-proof snapshot |
| `/o close` | Mark thread as completed |
| `/o heartbeat` | Auto-audit state every 30 min |
| `/o update` | Pull latest Orchestra and sync all repos |

## Key concepts

### Memory — two tiers

| Tier | File | Written by | Lifespan |
|------|------|-----------|----------|
| Curated | `MEMORY.md` | Agent (with approval) | Permanent — architecture, conventions, gotchas |
| Daily logs | `memory/YYYY-MM-DD.md` | Hooks (automatic) | Rolling — what happened today |

Both auto-injected at session start. You never type "here's the context."

### Threads — units of work

A thread is a feature, bug, spike, or investigation. It lives in `threads/<name>/` and follows a lifecycle:

```
describe → research → plan → execute → verify → close
```

Each thread has: spec, plan, progress (per-thread `progress.yaml` with milestones), verification, research, and conversation history. The `/o` dashboard aggregates active threads into an overall roadmap percentage. Completed and abandoned threads drop out — context stays lean.

### Compaction survival

Long sessions get compacted — Claude summarizes the conversation and drops older messages, destroying in-flight context. Orchestra solves this:

- Agent continuously flushes state to `state/sessions/{session-id}.md` after every significant action
- `PreCompact` hook feeds session context into the summarizer
- `PostCompact` hook re-injects context + memory + progress from disk
- `/o checkpoint` does a full manual flush (6+ files, delegated to a background subagent)

No manual intervention. Context is already on disk because the agent keeps it current.

### Concurrent sessions

Multiple agents can work on the same repo simultaneously. Each session gets its own context file (`state/sessions/{session-id}.md`) instead of sharing a singleton that would get stomped by the last writer.

- Session start generates a unique ID (timestamp + PID) and creates an isolated context file
- Other active sessions are auto-detected with a warning
- Session cleanup on exit (PID-matched) + stale session pruning (>24h)
- `state/session-context.md` still written as a copy for backwards compatibility

### Agent awareness — three layers

The biggest failure mode: the agent gets deep into coding and forgets to update state. Orchestra prevents this at three levels:

**Layer 1 — Blocking rules (all agents).** Injected into CLAUDE.md during setup. Two categories:
- *Blocking*: "Before coding, write your plan to Orchestra first." "Before spawning subagents, update session context." These are gates — the agent must complete them before proceeding.
- *Immediate*: "After researching, save findings." "After committing, update daily log." Post-action triggers.

**Layer 2 — Heartbeat (Claude Code).** Auto-scheduled on first `/o` run. Every 30 minutes, a lightweight cron checks if progress was made and updates state. Zero tool calls on the no-op path.

**Layer 3 — Channels (Claude Code, future).** Event-driven awareness via MCP Channels — fire on git commits instead of a timer. Blocked on Channels API stabilizing.

### Verification

Every thread has `verification.md` — the gate between "code written" and "done." Two phases:

1. **Automated** — agent runs tests, typecheck, lint, API smoke tests
2. **Human-assisted** — agent tells you exactly what to manually test and records your results

A progress item can't be marked `done` until verification passes. No unverified "100% complete" dashboards.

### Briefings and handoffs

**Briefings** are generated, self-contained task documents — one thread produces multiple briefings scoped per repo. Each agent gets exactly what it needs.

**Handoffs** are agent-to-agent async messages. When an agent finishes work another depends on, it writes a handoff. The receiving agent picks it up at session start.

### Documentation sync

Agents update docs **at the moment the change happens** — not as an afterthought. Made a decision? Record it now. Hit a gotcha? Write it now. Changed an API? Update CLAUDE.md now. `/o docs` runs a full audit as a safety net, but the goal is that docs are already current.

## Works with

Orchestra is agent-agnostic. It works with anything that reads files.

| Agent | Integration |
|-------|------------|
| **Claude Code** | First-class — hooks + `/o` skill + heartbeat |
| **Codex** | `AGENTS.md` injection + awareness rules |
| **Cursor** | `.cursor/rules/` injection + awareness rules |
| **OpenCode** | `.opencode/instructions.md` injection |
| **Any agent** | Reads `.orchestra/` files directly |

## Project topologies

**Monorepo** — single `.orchestra/` at the repo root.

**Multi-repo** — separate repos linked to a shared `.orchestra/`. Each repo gets `.orchestra.link`:

```yaml
# pied-piper-api/.orchestra.link
root: /Users/richard/Projects/pied-piper/.orchestra
```

**Worktrees** — zero setup. If `.orchestra.link` is missing, Orchestra checks the main worktree for the link file automatically.

## Auto-sync and updates

- Every `/o` invocation checks if the installed SKILL.md is stale — re-installs automatically
- `/o update` pulls latest, re-links all repos, shows what's new via changelog
- CLAUDE.md rules are safely updated between `<!-- orchestra-rules-start -->` / `<!-- orchestra-rules-end -->` markers — your content above and below is never touched

## License

MIT. See [LICENSE](LICENSE).
