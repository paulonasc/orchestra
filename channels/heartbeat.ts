#!/usr/bin/env bun
/**
 * Orchestra Heartbeat Channel — pushes state-update reminders into a Claude Code session.
 *
 * EXPERIMENTAL: Requires Claude Code v2.1.80+ with Channels (research preview).
 * Known bugs: notifications may not be delivered (GitHub #36827, #37440).
 *
 * Two modes:
 *   1. Timer-based: fires every HEARTBEAT_INTERVAL_MS (default 10 min)
 *   2. Git-event-driven: watches .git/refs/heads/ for commits, fires on change
 *
 * Usage:
 *   claude --dangerously-load-development-channels server:orchestra-heartbeat
 *
 * Or add to .mcp.json:
 *   { "mcpServers": { "orchestra-heartbeat": { "command": "bun", "args": ["path/to/heartbeat.ts"] } } }
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { watch } from "fs";
import { existsSync } from "fs";

const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.ORCHESTRA_HEARTBEAT_INTERVAL || "600000",
  10
); // 10 min default
const GIT_REFS_DIR = ".git/refs/heads";

// Create the MCP server and declare it as a channel
const mcp = new Server(
  { name: "orchestra-heartbeat", version: "0.0.1" },
  {
    capabilities: { experimental: { "claude/channel": {} } },
    instructions: [
      "Events from the orchestra-heartbeat channel are periodic state audit reminders.",
      "When you receive a heartbeat event, run /o heartbeat to check and update Orchestra state.",
      "Do not reply through this channel — it is one-way.",
    ].join(" "),
  }
);

await mcp.connect(new StdioServerTransport());

async function sendHeartbeat(trigger: "timer" | "git-commit") {
  try {
    await mcp.notification({
      method: "notifications/claude/channel",
      params: {
        content: [
          `Orchestra heartbeat (${trigger}).`,
          "Run /o heartbeat — check for unrecorded decisions, stale session files, missing daily log entries, and progress updates.",
        ].join(" "),
        meta: {
          source: "orchestra",
          type: "heartbeat",
          trigger,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Silently ignore — channel may not be ready or session may have ended
  }
}

// Mode 1: Timer-based heartbeat
setInterval(() => sendHeartbeat("timer"), HEARTBEAT_INTERVAL_MS);

// Mode 2: Git-event-driven heartbeat (fires on commit)
if (existsSync(GIT_REFS_DIR)) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(GIT_REFS_DIR, { recursive: true }, () => {
    // Debounce — git writes multiple files per commit
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => sendHeartbeat("git-commit"), 2000);
  });
}
