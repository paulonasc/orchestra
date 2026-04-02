/**
 * Telemetry ingest validation tests.
 *
 * Tests event validation, truncation, and edge cases WITHOUT requiring
 * a running Supabase instance. These are unit tests of the validation
 * logic, not integration tests.
 *
 * @origin synthetic — validates the edge function's input validation
 */

import { describe, test, expect } from "bun:test";

// Replicate the validation logic from the edge function
const VALID_EVENTS = new Set([
  "hook_session_start", "hook_pre_compact", "hook_post_compact",
  "hook_nudge_fired", "hook_stop", "hook_subagent_stop",
  "cmd_checkpoint", "cmd_close", "cmd_dashboard", "cmd_import",
  "cmd_docs", "cmd_heartbeat", "cmd_update",
  "write_plan", "write_decision", "write_research",
  "write_verification", "write_memory", "write_handoff",
  "error", "update_check", "thread_created", "thread_closed",
]);

function truncate(val: unknown, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function validateEvent(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;

  const ts = e.ts || e.event_timestamp;
  const version = e.orchestra_version;
  const os = e.os;
  const event = e.event;

  if (!ts || !version || !os || !event) return null;

  const schemaVersion = typeof e.v === "number" ? e.v : 1;
  if (schemaVersion !== 1) return null;

  const eventStr = truncate(event, 50)!;
  if (!VALID_EVENTS.has(eventStr)) return null;

  return {
    schema_version: 1,
    event_timestamp: ts,
    orchestra_version: truncate(version, 20),
    os: truncate(os, 20),
    arch: truncate(e.arch, 20),
    session_id: truncate(e.session_id, 64),
    event: eventStr,
    sessions: typeof e.sessions === "number" ? e.sessions : null,
    edit_count: typeof e.edit_count === "number" ? e.edit_count : null,
    duration_s: typeof e.duration_s === "number" ? e.duration_s : null,
    trigger: truncate(e.trigger, 50),
    subcommand: truncate(e.subcommand, 50),
    outcome: truncate(e.outcome, 20),
    error_class: truncate(e.error_class, 100),
    error_message: truncate(e.error_message, 200),
    installation_id: truncate(e.installation_id, 64),
  };
}

describe("telemetry-ingest validation", () => {
  test("accepts valid event with all fields", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      arch: "arm64",
      event: "hook_session_start",
      session_id: "12345-1711929600",
      sessions: 2,
    });
    expect(result).not.toBeNull();
    expect(result!.event).toBe("hook_session_start");
    expect(result!.sessions).toBe(2);
  });

  test("accepts valid event with minimal fields", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "hook_stop",
    });
    expect(result).not.toBeNull();
    expect(result!.arch).toBeNull();
    expect(result!.sessions).toBeNull();
  });

  test("rejects event missing required fields", () => {
    expect(validateEvent({ ts: "2026-04-02T10:00:00Z" })).toBeNull();
    expect(validateEvent({ orchestra_version: "0.4.1" })).toBeNull();
    expect(validateEvent({ os: "darwin" })).toBeNull();
    expect(validateEvent({ event: "hook_stop" })).toBeNull();
  });

  test("rejects unknown event type", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "unknown_event_type",
    });
    expect(result).toBeNull();
  });

  test("rejects unknown schema version", () => {
    const result = validateEvent({
      v: 2,
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "hook_stop",
    });
    expect(result).toBeNull();
  });

  test("rejects non-object input", () => {
    expect(validateEvent(null)).toBeNull();
    expect(validateEvent("string")).toBeNull();
    expect(validateEvent(42)).toBeNull();
    expect(validateEvent(undefined)).toBeNull();
  });

  test("truncates long strings", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "a".repeat(100),
      os: "b".repeat(100),
      event: "hook_stop",
      error_message: "c".repeat(500),
    });
    expect(result).not.toBeNull();
    expect((result!.orchestra_version as string).length).toBe(20);
    expect((result!.os as string).length).toBe(20);
    expect((result!.error_message as string).length).toBe(200);
  });

  test("handles numeric fields correctly", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "hook_nudge_fired",
      edit_count: 12,
      duration_s: 900.5,
      sessions: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.edit_count).toBe(12);
    expect(result!.duration_s).toBe(900.5);
    expect(result!.sessions).toBe(3);
  });

  test("nulls non-numeric values for numeric fields", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "hook_stop",
      edit_count: "not a number",
      duration_s: null,
      sessions: undefined,
    });
    expect(result).not.toBeNull();
    expect(result!.edit_count).toBeNull();
    expect(result!.duration_s).toBeNull();
    expect(result!.sessions).toBeNull();
  });

  test("accepts all valid event types", () => {
    for (const eventType of VALID_EVENTS) {
      const result = validateEvent({
        ts: "2026-04-02T10:00:00Z",
        orchestra_version: "0.4.1",
        os: "darwin",
        event: eventType,
      });
      expect(result).not.toBeNull();
    }
  });

  test("handles checkpoint with trigger field", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "cmd_checkpoint",
      trigger: "routing_rule",
      subcommand: "checkpoint",
    });
    expect(result).not.toBeNull();
    expect(result!.trigger).toBe("routing_rule");
    expect(result!.subcommand).toBe("checkpoint");
  });

  test("handles error event with error fields", () => {
    const result = validateEvent({
      ts: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "error",
      error_class: "hook_crash",
      error_message: "orchestra-session-start.sh: line 42: unexpected EOF",
      outcome: "error",
    });
    expect(result).not.toBeNull();
    expect(result!.error_class).toBe("hook_crash");
    expect(result!.outcome).toBe("error");
  });

  test("accepts event_timestamp as alternative to ts", () => {
    const result = validateEvent({
      event_timestamp: "2026-04-02T10:00:00Z",
      orchestra_version: "0.4.1",
      os: "darwin",
      event: "hook_stop",
    });
    expect(result).not.toBeNull();
    expect(result!.event_timestamp).toBe("2026-04-02T10:00:00Z");
  });
});
