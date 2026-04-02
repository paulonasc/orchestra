# Orchestra Telemetry Backend (Supabase)

Opt-in telemetry for usage analytics, error monitoring, and eval generation.

## Local development

```bash
# Prerequisites: Docker running, Supabase CLI installed
brew install supabase/tap/supabase

# Start local Supabase (Postgres, Auth, Edge Functions)
supabase init   # first time only
supabase start

# Apply migrations
supabase db reset

# Local instance:
#   API: http://127.0.0.1:54321
#   Studio: http://127.0.0.1:54323
#   Keys: printed by `supabase start`
```

## Deploy to production

```bash
# Link to remote project (one-time)
supabase link --project-ref lyfasbajetnlwsnwlefk

# Push migrations
supabase db push

# Deploy edge functions
supabase functions deploy telemetry-ingest
```

## Architecture

```
User's machine                          Supabase
─────────────                          ────────
Hooks write JSONL → .orchestra/.logs/telemetry.jsonl
                  ↓
bin/orchestra-telemetry-sync (background, rate-limited)
                  ↓ POST (publishable key)
                                    telemetry-ingest edge function
                                    (validates, truncates, inserts)
                                        ↓
                                    telemetry_events + installations tables
```

## Privacy

| Tier | What's sent | installation_id |
|------|------------|-----------------|
| off (default) | Nothing | — |
| anonymous | Events | Stripped |
| community | Events | Included (random UUID) |

Never captured: code, file paths, repo names, usernames, thread content.

## Files

| File | Purpose |
|------|---------|
| `config.sh` | Public Supabase URL + publishable key (safe to commit) |
| `migrations/001_create_telemetry_schema.sql` | Database schema |
| `functions/telemetry-ingest/index.ts` | Edge function (receives events) |
