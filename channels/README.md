# Orchestra Channels (Experimental)

Claude Code Channels (v2.1.80+, research preview) allow MCP servers to push events into a running session.

## Heartbeat Channel

Pushes periodic state-audit reminders so the agent keeps Orchestra state current during long sessions.

**Status:** Prototype. Channels has known notification delivery bugs (#36827, #37440). Do not use in production until stable.

### How it works

Two triggers fire in parallel:
- **Timer**: every 10 minutes (configurable via `ORCHESTRA_HEARTBEAT_INTERVAL`)
- **Git events**: watches `.git/refs/heads/` — fires when you commit or push

When triggered, the channel pushes a one-way notification telling the agent to run `/o heartbeat`.

### Setup

```bash
# Install dependency
cd ~/.orchestra/channels && bun add @modelcontextprotocol/sdk

# Start Claude Code with the channel
claude --dangerously-load-development-channels server:orchestra-heartbeat
```

Or add to `.mcp.json`:
```json
{
  "mcpServers": {
    "orchestra-heartbeat": {
      "command": "bun",
      "args": ["/path/to/orchestra/channels/heartbeat.ts"]
    }
  }
}
```

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `ORCHESTRA_HEARTBEAT_INTERVAL` | `600000` (10 min) | Timer interval in milliseconds |
