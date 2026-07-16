# RD Report: DEV-SUPABASE-DB-001 Supabase CLI Migration List Readiness

Date: 2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001`
- Phase: local Supabase migration mirror CLI-history readiness
- Target: local repository only
- Official reference checked: https://supabase.com/docs/reference/cli/supabase-migration-list

## Changes

- Updated `scripts/sync-supabase-runtime-migrations.mjs` so the generated `supabase/migrations/manifest.json` records `localMigrationList`.
- `localMigrationList.command` is `supabase migration list`, matching the current Supabase CLI reference.
- When the Supabase CLI is unavailable, the manifest records `attempted=false`, `passed=false`, and `reason="supabase CLI not found"`.
- When the Supabase CLI is available later, the same sync script will attempt `supabase migration list` and record redacted stdout / stderr without printing database URLs.
- Updated `scripts/qc-supabase-runtime-migrations.mjs` to verify the migration-list readiness metadata, absent-CLI behavior, and redaction boundary.
- Updated `supabase/README.md` and `.ai-doc/dev_task.md` from the older `supabase migration list --local` wording to `supabase migration list`.

## Verification

- `node --check scripts/sync-supabase-runtime-migrations.mjs` passed.
- `node --check scripts/qc-supabase-runtime-migrations.mjs` passed.
- `npm.cmd run supabase:migrations:sync` passed and regenerated `supabase/migrations/manifest.json`.
- `npm.cmd run qc:supabase-runtime-migrations` passed 19/19.

## Boundary

- Supabase CLI is not installed on this machine, so no CLI migration history was actually validated.
- No SQL was executed.
- No `apply_migration` call was made.
- No Supabase project or branch was created.
- No database URL, service role key, or publishable key was written to repository files.
- No runtime provider pointer was changed.
- Live pre-migration target guard, migration apply, remote migration history comparison, advisor review after apply, Postgres-mode API parity, production cutover, and rollback remain open.
