# ADR-SUPABASE-DB-002: Supabase Migration History Policy

Date: 2026-06-16
Status: Accepted for staging exception; production still requires verified history
Task: `DEV-SUPABASE-DB-001`

## Context

`AI_PDM_STAGING` has a known migration-history exception: the base schema and RLS baseline were applied through a raw `psql -f` path before the Supabase migration history path was fully controlled. Later hardening work was recorded through the Supabase migration path, so the target can show partial history while already containing the base schema.

This policy closes the open PM question for the staging exception. It does not approve production cutover, live runtime smoke, or any provider pointer change.

Supabase's current migration guidance treats `supabase/migrations` files and the remote `supabase_migrations.schema_migrations` table as separate records that must be kept in sync. The documented repair path may mark a migration as `applied` only when the schema change is already present and the history table is wrong; repair changes the history table only and does not run SQL.

## Decision

1. The repository migration mirror remains the source-controlled baseline:
   - `supabase/migrations/20260608000100_initial_ai_pdm_schema.sql`
   - `supabase/migrations/20260608000200_force_rls_deny_direct_access.sql`
   - `supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql`
   - `supabase/migrations/manifest.json`
2. The raw `psql -f` base apply is accepted as a staging-only exception because current evidence shows the staging schema/RLS baseline exists and direct API route migration is complete.
3. Before any production cutover, the team must produce migration-history evidence from an approved linked target using Supabase CLI or Supabase MCP tooling.
4. If the target schema already contains a migration but the history table is missing that timestamp, use `supabase migration repair --status applied <timestamp>` only after target identity, schema/RLS parity, and source SHA evidence are captured.
5. If the schema is missing or parity is uncertain, do not repair history. Rebuild a disposable target or apply the missing migration through the approved migration path.
6. Never use migration repair to hide an unknown, partial, failed, production, or non-AI_PDM apply.

## Required Evidence Before Repair

- Explicit PM approval for migration-history repair.
- Target guard proves `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING` or the approved production target.
- `supabase migration list` or Supabase MCP `list_migrations` output is recorded.
- `db:postgres:compare:schema-rls -- --no-write` passes against the same target.
- `qc:supabase-runtime-migrations` passes locally and source SHA values match.
- `qc:supabase-secret-boundary` passes.
- No live connection string, database password, service role key, or pooler URL is written to repository files.

## Approval-Only Command Pattern

These commands are examples for an approved staging repair session. They must not be run as part of local preparation.

```powershell
$env:PDM_SUPABASE_TARGET_NAME = "AI_PDM_STAGING"
npm.cmd run db:postgres:guard -- --phase compare
supabase migration list
npm.cmd run db:postgres:compare:schema-rls -- --no-write
npm.cmd run qc:supabase-runtime-migrations

# Run only for migrations that are proven present in schema/RLS parity but absent from history:
supabase migration repair --status applied 20260608000100
supabase migration repair --status applied 20260608000200

supabase migration list
```

## No-Go Conditions

- Target identity is missing, unknown, `ProJED`, `ProJED_TEST`, or any non-AI_PDM project.
- Schema/RLS compare cannot prove the base state.
- A migration was partially applied or failed and needs SQL execution, not history repair.
- The action would repair production history without an approved production target and rollback plan.
- Any command requires committing secrets to the repository.

## Current Stop Point

This policy resolves the staging exception as a documented, controlled exception. Actual migration-history repair and runtime smoke remain blocked until explicit approval, target credentials, and linked Supabase CLI or MCP evidence are available.

## References

- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/cli/supabase-migration-repair
- https://supabase.com/changelog
- [Supabase Runtime Gate QA Plan](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md)
- [Supabase migration mirror README](C:/VIBE%20CODING/AI_PDM/supabase/README.md)
