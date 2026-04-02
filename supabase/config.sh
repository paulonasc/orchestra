#!/usr/bin/env bash
# Orchestra Supabase configuration — public keys, safe to commit.
#
# The publishable key can only INSERT into tables (RLS blocks all reads).
# The service_role key is never in this file — Supabase auto-injects it
# into edge functions via Deno.env.get('SUPABASE_SERVICE_ROLE_KEY').

ORCHESTRA_SUPABASE_URL="https://lyfasbajetnlwsnwlefk.supabase.co"
ORCHESTRA_SUPABASE_KEY="sb_publishable_5O6dqOR7TRu7rnRJROnhCw_qHU0RhoE"
