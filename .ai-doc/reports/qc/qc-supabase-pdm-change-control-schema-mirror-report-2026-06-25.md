# QC Supabase PDM Change-Control Schema Mirror Report - 2026-06-25

## Scope

This report records the local Supabase/Postgres mirror repair for the PDM change-control package.

The repaired scope is schema/RLS mirror readiness only. It does not claim a live Supabase staging or production deployment.

## Change Summary

- Added the PDM change-control tables that existed in `db/schema.sql` but were missing from `db/postgres/001_initial_schema.sql`:
  - `part_number_drafts`
  - `part_number_events`
  - `part_replacement_links`
  - `drawing_revision_fff_assessments`
  - `review_confirmation_events`
  - `bom_reconfirmation_flags`
- Added the matching Postgres indexes, including the partial unique index for active reserved part numbers.
- Added the six tables to `db/postgres/002_supabase_rls_plan.sql` so the Supabase baseline still forces RLS and denies direct `anon` / `authenticated` table grants.
- Moved `companies` before `users` in the Postgres schema so the `users.company_id -> companies.id` foreign key is valid on a clean database.
- Regenerated `supabase/migrations/20260608000100_initial_ai_pdm_schema.sql`, `supabase/migrations/20260608000200_force_rls_deny_direct_access.sql`, and `supabase/migrations/manifest.json`.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Schema/RLS compare | Pass | `npm.cmd run db:postgres:compare:schema-rls -- --no-write` returned `postgresTables=72`, `missingInPostgres=[]`, `rlsMissingTables=[]`. |
| Migration mirror QC | Pass | `npm.cmd run qc:supabase-runtime-migrations` passed 22/22. |
| Data parity policy QC | Pass | `npm.cmd run qc:supabase-data-parity-policy` passed 13/13. |
| Local readiness QC | Pass | `npm.cmd run qc:supabase-runtime-local-readiness` passed 10/10. |
| Secret boundary QC | Pass | `npm.cmd run qc:supabase-secret-boundary` passed 15/15. |
| TypeScript | Pass | `npx.cmd tsc --noEmit --pretty false` completed with exit code 0. |
| Live runtime smoke preflight | Expected block | `npm.cmd run qc:supabase-runtime-smoke-preflight` returned `blocked_expected` because the local env does not provide `PDM_RUNTIME_SMOKE_APPROVED`, `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING`, `PDM_POSTGRES_URL`, `PDM_POSTGRES_SHADOW_URL`, or `PDM_DB_PROVIDER=postgres`. |

## Residual Risk

- The current connector-visible Supabase projects are `ProJED` and `ProJED_TEST`; the previously referenced `AI_PDM_STAGING` / production target is not available through the current Supabase MCP session.
- Supabase CLI is not installed locally, so migration history can only be checked after CLI installation or through an approved connector-visible target.
- Live staging/prod execution remains blocked until PM supplies the target identity, server-side connection strings, shadow target, smoke approval flag, and cleanup owner.

## QC Decision

Local schema/RLS mirror readiness is accepted for this package.

Live Supabase staging/prod deployment remains not executed.
