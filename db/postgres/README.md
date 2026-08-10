# Cloud SQL PostgreSQL Migrations

This directory is the authoritative PostgreSQL migration source for AI_PDM. The approved production database is Google Cloud SQL for PostgreSQL; Supabase is retired and is not a staging, migration, rollback, or release target.

Use the current GCP migration lane:

```powershell
npm.cmd run dev-046:cloudsql-migration-package
npm.cmd run dev-046:cloudsql-migration-runner:dry-run
```

Safety rules:

- Authenticate Cloud SQL through the approved localhost proxy/connector path.
- Never use a static Cloud SQL password in production.
- Do not copy current migrations into a top-level `supabase/` directory.
- Do not use the Supabase CLI, project URLs, service-role keys, migration history, live smoke, or cutover commands.
- Keep `scripts/postgres-shadow-target-guard-utils.mjs`; it rejects known retired/non-AI_PDM Supabase projects and protects generic PostgreSQL shadow checks.

For an approved disposable PostgreSQL shadow target, run the fail-closed identity/schema guard before any migration-like action:

```powershell
npm.cmd run db:postgres:guard -- --phase pre-migration
```

After an approved generic PostgreSQL shadow migration, use `db:postgres:compare` or `db:postgres:compare:schema-rls` for evidence. These commands do not authorize Supabase use; known retired projects remain explicitly rejected.

Run `npm.cmd run qc:postgres-shadow` to verify the provider-neutral PostgreSQL schema, RLS baseline traceability, target guard, and compare contract without authorizing a live provider target.

The file `002_supabase_rls_plan.sql` is a historical deny-direct-access baseline retained for traceability. Current Cloud SQL package generation excludes that provider-specific file; it must not be applied as a current Cloud SQL migration. Current migrations begin with the provider-neutral schema and the approved Cloud SQL migration package manifest.

Implementation notes:

- IDs remain application-generated `TEXT` values for SQLite compatibility.
- PostgreSQL timestamps use `TIMESTAMPTZ` and JSON payloads use `JSONB`.
- Migrations with `updated_at` columns install the controlled update trigger where required.
- Application database access remains server-side through the repository and BFF boundaries.
