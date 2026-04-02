// Supabase Edge Function: telemetry-ingest
// Receives batched telemetry events from Orchestra clients.
// Validates, truncates, inserts into Postgres via service_role key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL env var");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Limits
const MAX_BATCH_SIZE = 50;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB

// Valid event types
const VALID_EVENTS = new Set([
  // Hook events
  "hook_session_start", "hook_pre_compact", "hook_post_compact",
  "hook_nudge_fired", "hook_stop", "hook_subagent_stop",
  // Command events
  "cmd_checkpoint", "cmd_close", "cmd_dashboard", "cmd_import",
  "cmd_docs", "cmd_heartbeat", "cmd_update",
  // State change events
  "write_plan", "write_decision", "write_research",
  "write_verification", "write_memory", "write_handoff",
  // System events
  "error", "update_check", "thread_created", "thread_closed",
]);

// Truncate string to max length
function truncate(val: unknown, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

Deno.serve(async (req: Request) => {
  // Method gate
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Size gate
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: "Payload too large", max: MAX_PAYLOAD_BYTES }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  let events: unknown[];
  try {
    const body = await req.json();
    events = Array.isArray(body) ? body : [body];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Batch gate
  if (events.length > MAX_BATCH_SIZE) {
    return new Response(JSON.stringify({ error: "Too many events", max: MAX_BATCH_SIZE }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate and transform events
  const validRows: Record<string, unknown>[] = [];
  const installUpserts: Map<string, Record<string, unknown>> = new Map();

  for (const raw of events) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Record<string, unknown>;

    // Required fields
    const ts = e.ts || e.event_timestamp;
    const version = e.orchestra_version;
    const os = e.os;
    const event = e.event;

    if (!ts || !version || !os || !event) continue;

    // Schema version check (silently drop unknown)
    const schemaVersion = typeof e.v === "number" ? e.v : (typeof e.schema_version === "number" ? e.schema_version : 1);
    if (schemaVersion !== 1) continue;

    // Event type validation
    const eventStr = truncate(event, 50)!;
    if (!VALID_EVENTS.has(eventStr)) continue;

    // Build validated row
    const row: Record<string, unknown> = {
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

    validRows.push(row);

    // Collect installation upserts (community tier only)
    const installId = row.installation_id as string | null;
    if (installId) {
      installUpserts.set(installId, {
        installation_id: installId,
        last_seen: ts,
        orchestra_version: row.orchestra_version,
        os: row.os,
      });
    }
  }

  if (validRows.length === 0) {
    return new Response(JSON.stringify({ inserted: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Bulk insert events
  const { error: insertError } = await supabase
    .from("telemetry_events")
    .insert(validRows);

  if (insertError) {
    console.error("Insert error:", insertError);
    return new Response(JSON.stringify({ error: "Insert failed", detail: insertError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Upsert installations
  for (const install of installUpserts.values()) {
    await supabase
      .from("installations")
      .upsert(install, { onConflict: "installation_id" });
  }

  return new Response(JSON.stringify({ inserted: validRows.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
