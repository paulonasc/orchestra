# /o update / stats / release — Maintenance

## /o update — Upgrade Orchestra

**Step 1 — Save old version:**

```bash
_OLD_VER=$(cat __ORCHESTRA_DIR__/VERSION 2>/dev/null | tr -d '[:space:]')
```

**Step 2 — Pull and sync:**

```bash
_ORCH_ROOT=$(grep "^root:" .orchestra.link 2>/dev/null | sed 's/^root: *//')
cd __ORCHESTRA_DIR__ && git pull origin main && ./setup sync "$_ORCH_ROOT"
```

**Step 3 — Show changelog:**

```bash
_NEW_VER=$(cat __ORCHESTRA_DIR__/VERSION 2>/dev/null | tr -d '[:space:]')
__ORCHESTRA_DIR__/bin/orchestra-changelog "$_OLD_VER" "$_NEW_VER" 2>/dev/null
```

If the changelog script returns content, present it to the user as "What's new in Orchestra." Format the output nicely — show features, then prompt for any actions listed in the changelog.

**Changelog actions** use a simple format in changelog `.md` files:

- `action: relink` — run the command automatically (it's a sync/relink, safe to auto-run since `setup sync` just ran above)
- `action: suggest` — show the prompt to the user and ask if they want to try it. Don't auto-run.

If no changelog output (same version or no entries), just report: "Orchestra is up to date (v{version})."

**Step 4 — Enable heartbeat (automatic):**

After update completes, check if heartbeat is scheduled (look for `heartbeat_scheduled: true` in `state/sessions/{session-id}.md`). If not, run `/o heartbeat` to set it up. **Remember:** cron scheduling happens in the main agent (3 tool calls: CronList → CronDelete all → CronCreate with inline prompt). Never delegate cron creation to a subagent.

## /o stats — Local usage analytics

Run `__ORCHESTRA_BIN__/orchestra-stats` and present the output. Accepts optional period: `7d` (default), `30d`, `all`.

Shows: sessions started/ended, checkpoints, nudge effectiveness (how often nudges lead to checkpoints), threads created/closed. All data is local (`.orchestra/.logs/telemetry.jsonl`) — nothing leaves the machine.

## /o release — Bump version and generate changelog (maintainer only)

For Orchestra maintainers shipping a new version. Use AskUserQuestion:

> Ready to release. Current version: v{current}.
>
> RECOMMENDATION: Choose A for bug fixes and small improvements.
>
> A) Patch — bug fixes, small improvements (v{current} → v{patch})
> B) Minor — new features (v{current} → v{minor})
> C) Major — breaking changes (v{current} → v{major})
> D) Skip — not ready to release

If A/B/C: Run `__ORCHESTRA_BIN__/orchestra-release {level}`. Show the generated changelog entry. Then suggest: "Run `./setup sync` to distribute to linked repos, then `git push origin main --tags`."

If D: Do nothing.
