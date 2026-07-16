# RD Report: DEV-SUPABASE-DB-001 Postgres Async Provider Local Gate

日期：2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001`
- Phase: local async runtime provider checklist sync
- Goal: verify and document the local `sqlite` / `postgres` async runtime provider gate without claiming live Supabase Postgres cutover or API parity.

## Verified Local Behavior

- `getAsyncDatabaseClient()` selects `sqlite` or `postgres` from `PDM_DB_PROVIDER`.
- SQLite remains the default fallback.
- Postgres provider requires `PDM_POSTGRES_URL` and fails closed when it is missing.
- Postgres adapter uses `pg` server-side pool, unnamed query execution, named parameter normalization, transaction `BEGIN` / `COMMIT` / `ROLLBACK`, and nested transaction fail-closed behavior.
- `closeAsyncDatabaseClient()` is available for runtime lifecycle cleanup.

## Verification

- `npm.cmd run qc:db-provider-contract` passed 35/35.
- `npm.cmd run qc:db-provider-postgres` passed 9/9.
- `qc:db-provider-postgres` reported `live Postgres probe skipped without env` because `PDM_POSTGRES_URL` is not configured.

## Guardrails

- No Supabase SQL was executed.
- No `apply_migration` was called.
- No production or staging runtime pointer was changed.
- No Postgres-mode API regression was claimed.

## Remaining Work

- Configure a server-side `PDM_POSTGRES_URL` for the accepted `AI_PDM_STAGING` target outside the repository.
- Run pre-migration target guard, migration apply, schema compare, RLS/advisor checks, and Postgres-mode API regression.
- Keep production cutover blocked until staging evidence and rollback evidence are complete.
