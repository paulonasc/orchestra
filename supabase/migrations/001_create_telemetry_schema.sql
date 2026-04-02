-- Orchestra Telemetry Schema v1
-- Migration 001: Core tables for telemetry events and installation tracking
--
-- Development workflow:
--   supabase init && supabase start    # local Docker instance
--   supabase db reset                  # apply migrations locally
--   supabase link --project-ref ...    # connect to remote (only when shipping)
--   supabase db push                   # apply migrations to remote

-- Main events table: one row per telemetry event.
-- Session ID on every event enables session-flow reconstruction for eval generation.
CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ DEFAULT now(),
  schema_version INTEGER DEFAULT 1,

  -- Identity
  installation_id TEXT,              -- random UUID, community tier only
  orchestra_version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT,

  -- Session context
  session_id TEXT,                   -- groups events into a session (PID + timestamp)
  event_timestamp TIMESTAMPTZ NOT NULL,  -- client-side timestamp

  -- Event
  event TEXT NOT NULL,               -- hook_session_start, cmd_checkpoint, error, write_plan, etc.

  -- Context fields (populated based on event type)
  sessions INTEGER,                  -- concurrent session count (hook_session_start)
  edit_count INTEGER,                -- edits since checkpoint (hook_nudge_fired, hook_stop)
  duration_s NUMERIC,                -- session length (hook_stop)
  trigger TEXT,                      -- what caused this: nudge/routing_rule/explicit (cmd_checkpoint)
  subcommand TEXT,                   -- which /o subcommand (checkpoint, close, dashboard, etc.)
  outcome TEXT,                      -- success/error/unknown
  error_class TEXT,                  -- hook_crash, write_failed, timeout, etc.
  error_message TEXT                 -- truncated to 200 chars, sanitized
);

-- Session flow reconstruction: group by session_id, order by event_timestamp
CREATE INDEX idx_telemetry_session ON telemetry_events (session_id, event_timestamp);
-- Install tracking: retention, version adoption
CREATE INDEX idx_telemetry_install ON telemetry_events (installation_id, event_timestamp);
-- Error monitoring: crash clusters by version
CREATE INDEX idx_telemetry_errors ON telemetry_events (error_class, orchestra_version) WHERE outcome = 'error';

-- Installation tracking: one row per unique install.
-- Updated on every sync (last_seen, orchestra_version).
CREATE TABLE installations (
  installation_id TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  orchestra_version TEXT,
  os TEXT
);

-- Row Level Security: publishable key can only INSERT, never read.
-- All reads go through edge functions using service_role key.
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_events" ON telemetry_events FOR INSERT WITH CHECK (true);
CREATE POLICY "insert_installs" ON installations FOR INSERT WITH CHECK (true);
