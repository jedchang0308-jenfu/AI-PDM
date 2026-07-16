# PostgreSQL / Supabase Migration

This folder contains the planned PostgreSQL schema migration for a future SQLite-to-Supabase upgrade.

Generate the migration:

```powershell
npm.cmd run db:postgres:migration
```

Generated file:

```text
db/postgres/001_initial_schema.sql
db/postgres/002_supabase_rls_plan.sql
db/postgres/003_harden_set_updated_at_search_path.sql
```

Run local shadow checks:

```powershell
npm.cmd run db:postgres:compare
npm.cmd run db:postgres:compare:schema-rls
npm.cmd run qc:postgres-shadow
```

Before applying generated SQL to any live Supabase or PostgreSQL target, run the target guard:

```powershell
npm.cmd run db:postgres:guard -- --phase pre-migration
```

The pre-migration guard only accepts a disposable target with no public base tables. Existing application schemas, including non-AI_PDM Supabase projects, fail closed.
The guard also refuses known existing non-AI_PDM Supabase targets such as `ProJED` / `ProJED_TEST` by project ref or `PDM_SUPABASE_TARGET_NAME`.

After migration and RLS SQL are applied, run:

```powershell
node scripts/guard-postgres-shadow-target.mjs --phase compare
node scripts/compare-sqlite-postgres-shadow.mjs --schema-rls-only --require-postgres
```

The compare guard only accepts the complete generated AI_PDM public schema with RLS enabled and forced on every table.
Use `--schema-rls-only` for a clean staging database when the acceptance criterion is schema/RLS readiness rather than data migration parity. The full `db:postgres:compare -- --require-postgres` command still performs row-count/key-hash data parity and should only be used after an approved seed or data migration policy exists.
The compare report includes a `migrationTrace` block with SHA-256 hashes for `db/schema.sql`, `db/postgres/001_initial_schema.sql`, and `db/postgres/002_supabase_rls_plan.sql` so schema/RLS or row-count/key-hash evidence can be traced back to the exact migration inputs.

Notes:

- IDs stay as application-generated `TEXT` values to preserve compatibility with the current SQLite model.
- SQLite `datetime('now')` defaults are converted to PostgreSQL `now()`.
- Timestamp columns use `TIMESTAMPTZ`.
- JSON payload columns are converted from SQLite text JSON to PostgreSQL `JSONB`.
- The migration creates update triggers for tables that have `updated_at`.
- The RLS plan enables and forces RLS on public tables and revokes direct `anon` / `authenticated` table access. The application must keep using the server-side PDM API until explicit Supabase policies are approved.
- The hardening migration fixes the `set_updated_at()` function `search_path` for Supabase Security Advisor.
- Live shadow comparison can be run by setting `PDM_POSTGRES_SHADOW_URL` and running `node scripts/compare-sqlite-postgres-shadow.mjs --schema-rls-only --require-postgres`; the compare script fails closed if the target guard does not recognize a complete AI_PDM shadow schema.
