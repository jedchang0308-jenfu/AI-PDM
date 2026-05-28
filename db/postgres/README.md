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
```

Run local shadow checks:

```powershell
npm.cmd run db:postgres:compare
npm.cmd run qc:postgres-shadow
```

Notes:

- IDs stay as application-generated `TEXT` values to preserve compatibility with the current SQLite model.
- SQLite `datetime('now')` defaults are converted to PostgreSQL `now()`.
- Timestamp columns use `TIMESTAMPTZ`.
- JSON payload columns are converted from SQLite text JSON to PostgreSQL `JSONB`.
- The migration creates update triggers for tables that have `updated_at`.
- The RLS plan enables and forces RLS on public tables and revokes direct `anon` / `authenticated` table access. The application must keep using the server-side PDM API until explicit Supabase policies are approved.
- Live shadow comparison can be run by setting `PDM_POSTGRES_SHADOW_URL` and running `node scripts/compare-sqlite-postgres-shadow.mjs --require-postgres`.
