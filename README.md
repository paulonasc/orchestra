# Orchestra

**The memory layer for AI agents.**

AI agents are stateless. Every session starts from zero — no memory of what was built, what was decided, what failed. Orchestra fixes this with persistent, file-based memory that survives across sessions, compaction, and multiple repos.

Orchestra doesn't do work — it remembers work. Workflow tools (gstack, Cursor, etc.) handle actions. Orchestra handles state.

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
| New session | You re-explain everything | Agent reads state, memory, progress — knows everything |
| Context compaction | Agent forgets mid-session decisions | Session context flushed to disk, re-injected after compaction |
| Multi-repo work | You copy-paste between terminals | Shared `.orchestra/` dir, briefings per repo, handoffs between agents |
| Concurrent sessions | Two agents stomp each other's state | Session-scoped context files, auto-detected with warnings |
| "Did we decide X?" | You dig through chat history | `decisions/` directory, append-only, searchable |
| Agent forgets to update state | You remind it every 30 min | Mechanical nudge after 10 edits + pattern-match triggers |
| Frontend agent gets API noise | Shared context dumps everything | Repo-aware filtering — each agent sees only relevant memory |

## Install

**Step 1:** Clone Orchestra.

```bash
git clone https://github.com/paulonasc/orchestra.git ~/orchestra
```

**Step 2:** Run the guided setup.

```bash
cd ~/orchestra && ./setup install
```

Orchestra will ask which project to coordinate, create the `.orchestra/` state directory, install hooks, and inject the `/o` skill. Done.

### Manual setup

```bash
git clone https://github.com/paulonasc/orchestra.git ~/orchestra
~/orchestra/setup init ~/Projects/my-app
~/orchestra/setup link ~/Projects/my-app
~/orchestra/setup link ~/Projects/my-api
```

Each linked repo gets:
- `.orchestra.link` — pointer to the shared `.orchestra/` directory
- `.claude/skills/o/SKILL.md` — the `/o` command router (247 lines) with 8 command files in `commands/`
- `.claude/settings.json` — lifecycle hooks (SessionStart, PreCompact, PostToolUse nudge, Stop)
- `.claude/rules/orchestra.md` — compaction-safe routing rules
- Orchestra rules in CLAUDE.md (between HTML comment markers — your content is never touched)

## The `/o` command

| Command | What it does |
|---------|-------------|
| `/o` | Executive dashboard — roadmap %, risks, what needs attention |
| `/o list` | All threads with status and progress |
| `/o active` | What the agent thinks we're working on right now |
| `/o <thread>` | Deep dive into a specific workstream |
| `/o plan` | Show the plan for the active thread |
| `/o import` | Import external docs (plans, research, specs) into a thread |
| `/o docs` | Audit repo docs against recent changes, fix what's stale |
| `/o checkpoint` | Flush all context to disk — compaction-proof snapshot |
| `/o close` | Mark thread as completed |
| `/o reopen` | Reopen a completed or abandoned thread |
| `/o heartbeat` | Auto-audit state every 30 min |
| `/o update` | Pull latest Orchestra and sync all repos |
| `/o stats` | Show local usage analytics |
| `/o release` | Bump version, generate changelog, commit + tag |

## Key concepts

### Memory

Two tiers, both auto-injected at session start:

| Tier | File | Written by | Lifespan |
|------|------|-----------|----------|
| Curated | `MEMORY.md` | Agent (with approval) | Permanent — architecture, conventions, gotchas |
| Daily logs | `memory/YYYY-MM-DD.md` | Hooks (automatic) | Rolling — what happened today |

### Threads

A thread is a feature, bug, spike, or investigation. It lives in `threads/<name>/` and follows a lifecycle:

```
describe → research → plan → execute → verify → close
```

Each thread has: spec, plan, progress (per-thread `progress.yaml` with milestones), verification, research, and conversation history. The `/o` dashboard aggregates active threads into an overall roadmap percentage.

### Compaction survival

Long sessions get compacted — Claude summarizes the conversation and drops older messages. Orchestra handles this mechanically:

- **PostToolUse nudge** counts code edits per session. After 10 edits without a checkpoint, the agent gets a reminder. No voluntary compliance needed.
- **PreCompact hook** writes a breadcrumb to the daily log and feeds session context into the summarizer so it's preserved.
- **PostCompact hook** re-injects context + memory + progress from disk.
- **`/o checkpoint`** does a full flush (session file, thread files, daily log, decisions, MEMORY.md) via a background subagent.

### Concurrent sessions

Multiple agents can work on the same repo simultaneously. Each session writes to its own file — no conflicts on shared state.

- Session start generates a unique ID (timestamp + PID) and creates an isolated context file
- Session state goes to `state/sessions/{id}.md` — concurrent agents never conflict
- Thread files are written directly — safe because only one agent works on a given thread at a time
- Append-only files (daily log, decisions) use session prefixes or unique filenames
- Other active sessions are auto-detected with a warning

### Agent awareness

The biggest failure mode: the agent forgets to update state. Orchestra prevents this with five layers:

1. **`.claude/rules/orchestra.md`** — injected into the system prompt at session start. Survives compaction. Contains mandatory routing rules (e.g., "when user says done, run `/o checkpoint` BEFORE responding").

2. **CLAUDE.md injection** — Orchestra rules between `<!-- orchestra-rules-start -->` / `<!-- orchestra-rules-end -->` markers. Pattern-match triggers for completion signals, decisions, test results.

3. **SKILL.md description** — the `/o` skill description lives in permanent system prompt attention. Includes mandatory triggers: "when user says done/looks good/all set, invoke `/o checkpoint` BEFORE responding."

4. **Lifecycle hooks** — SessionStart injects context, PreCompact saves state, PostCompact restores it, Stop cleans up. Mechanical, not instruction-based.

5. **PostToolUse nudge** — counts code edits. After 10 edits without a checkpoint: "Orchestra: 12 edits since last checkpoint. Run /o checkpoint to save progress." The agent cannot miss this — it appears in the tool response.

## Works with

Orchestra is agent-agnostic. It works with anything that reads files.

| Agent | Integration |
|-------|------------|
| **Claude Code** | First-class — hooks + `/o` skill + nudge + heartbeat |
| **Codex** | `AGENTS.md` injection + awareness rules |
| **Cursor** | `.cursor/rules/` injection + awareness rules |
| **OpenCode** | `.opencode/instructions.md` injection |
| **Any agent** | Reads `.orchestra/` files directly |

## Eval system

27 behavioral tests across 10 categories (router, checkpoint, routing, session, discovery, decisions, verification, regressions, identity, stats) plus 3 hook unit tests. Three tiers:

1. **Hook unit tests** — bash scripts against a mock `.orchestra/`. No LLM. Sub-second.
2. **Deterministic integration** — hook output assertions. No LLM.
3. **Behavioral evals** — real Claude Code sessions via Agent SDK, judged by OpenAI for pass/fail.

```bash
bun test evals/              # deterministic tests (fast, no API keys)
EVALS=1 bun test evals/cases/  # behavioral evals (needs Claude + OpenAI keys)
```

See [evals/README.md](evals/README.md) for full documentation.

## Telemetry

Opt-in, prompted on first run. Three tiers:

| Tier | What's sent | Device ID |
|------|------------|-----------|
| **Community** | Anonymous usage data (which commands, how often) | Stable device ID for trend tracking |
| **Anonymous** | Counters only | None |
| **Off** | Nothing | Nothing |

No code, file paths, or repo names are ever sent. Data is stored locally in `.orchestra/.logs/telemetry.jsonl` and synced to a Supabase backend when enabled. Change anytime: `orchestra-config set telemetry off`.

## License

MIT. See [LICENSE](LICENSE).
