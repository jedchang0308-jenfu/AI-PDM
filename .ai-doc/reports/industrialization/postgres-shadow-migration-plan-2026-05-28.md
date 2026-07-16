# Postgres / Supabase Shadow Migration Plan - 2026-05-28

## Scope
Prepare a repeatable SQLite to PostgreSQL/Supabase shadow migration without switching production runtime away from SQLite.

## Current Implementation
- `scripts/generate-postgres-migration.mjs` generates `db/postgres/001_initial_schema.sql` from `db/schema.sql`.
- `db/postgres/002_supabase_rls_plan.sql` enables and forces RLS for every public table, revokes direct `anon` and `authenticated` table access, and keeps Data API access denied by default until explicit policies are approved.
- `scripts/compare-sqlite-postgres-shadow.mjs` compares SQLite table coverage, row counts, and primary-key hashes. It writes `migrationTrace` SHA-256 hashes for the SQLite schema, generated Postgres migration, and RLS plan so compare evidence is tied to the exact migration inputs. If `PDM_POSTGRES_SHADOW_URL` is configured and `psql` is available, it can also compare against a real Postgres shadow database.
- `scripts/guard-postgres-shadow-target.mjs` fails closed unless the target is an empty disposable public schema before migration, or a complete generated AI_PDM shadow schema with forced RLS during compare.
- `scripts/qc-postgres-shadow-test.mjs` verifies generated migration coverage, RLS baseline coverage, target guard behavior, and the no-user-editable-auth-metadata rule.

## Supabase Notes
- Supabase recommends local schema migrations with `supabase migration new`, `supabase db reset`, `supabase db diff`, and deployment through `supabase db push`.
- Supabase public-schema tables must have RLS enabled when exposed to the Data API.
- Policies should use stable server-side identity such as `auth.uid()` or signed app metadata. Authorization must not depend on user-editable metadata.
- Recent Supabase changelog entries affecting this plan:
  - Tables are not always exposed to Data/GraphQL API automatically for new projects.
  - OpenAPI schema access via the anon key is being removed.
  - Self-hosted Supabase defaults are moving toward newer Postgres versions, so CI should not rely on a hidden local image tag.

## Shadow Workflow
1. Generate SQL: `npm.cmd run db:postgres:migration`.
2. Local static compare: `npm.cmd run db:postgres:compare`.
3. Optional live shadow compare:
   - Set `PDM_POSTGRES_SHADOW_URL` to the disposable target.
   - Run `npm.cmd run db:postgres:guard -- --phase pre-migration` before applying SQL.
   - Apply `db/postgres/001_initial_schema.sql` and controlled seed/import data to a disposable Postgres/Supabase branch.
   - Apply `db/postgres/002_supabase_rls_plan.sql`.
   - Run `node scripts/compare-sqlite-postgres-shadow.mjs --require-postgres`.
4. Run Supabase advisor and RLS checks on the disposable branch before any production cutover.

## Pass Criteria
- Generated Postgres migration covers every SQLite table and index.
- Row counts and primary-key hashes match for the tested dataset.
- RLS baseline covers every public table.
- The target guard blocks non-empty non-AI_PDM public schemas and partial AI_PDM schemas.
- No P0/P1 Supabase advisor or RLS issues remain before enabling Data API access.

## Evidence
- `npm.cmd run db:postgres:migration`: PASS.
- `npm.cmd run db:postgres:compare`: PASS for local SQLite/static shadow coverage.
- `npm.cmd run qc:postgres-shadow-target-guard`: PASS.
- `npm.cmd run qc:postgres-shadow`: PASS.

## Result
PASS for local migration readiness. Live Supabase advisor execution remains gated on a disposable Supabase project or branch.
