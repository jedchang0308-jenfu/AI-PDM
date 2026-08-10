# Legacy Supabase Migration Mirror

Status: `Immutable audit archive — never execute`

This directory preserves the former Supabase migration mirror solely for historical traceability. It is not a migration source, staging target, rollback target, or release lane.

Current platform authority:

- Database: Google Cloud SQL for PostgreSQL
- Object storage: Google Cloud Storage
- Secrets: Google Secret Manager
- Application runtime: the approved GCP release lane

Operational rules:

- Do not copy these files back to a top-level `supabase/` directory.
- Do not run the Supabase CLI against this archive.
- Do not add credentials, target names, live smoke commands, migration sync commands, or deployment instructions here.
- Use `db/postgres/*.sql` and the GCP/Cloud SQL migration gates for current work.
- Keep the forbidden legacy-project checks in `scripts/postgres-shadow-target-guard-utils.mjs`; those checks prevent accidental reconnection and are not an authorization to use Supabase.

The archived `migrations/manifest.json` records the former mirror hashes and intentionally reports Supabase CLI and migration-history operations as unavailable.
