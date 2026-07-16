# RD Report: SQLite Fallback Local Gate

Date: 2026-06-12
Task: DEV-SUPABASE-DB-001
Phase: SQLite fallback local runtime gate

## Scope

Verify that the local SQLite fallback remains usable while the Supabase Postgres runtime migration is still in progress.

This gate covers local initialization, provider contracts, documentation path integrity, TypeScript, lint, production build, and API regression against SQLite mode.

## Evidence

- `PDM_DB_PROVIDER=sqlite` was set for the local verification commands.
- `npm.cmd run db:init` initialized `data/ai-pdm.sqlite`.
- `npm.cmd run qc:db-provider-contract` passed 35/35.
- `npm.cmd run qc:db-provider-postgres` passed 9/9; live probe was skipped because `PDM_POSTGRES_URL` is not configured.
- `npm.cmd run qc:doc-paths` passed 23/23.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT trace warning.
- `node scripts/qc-api-test.mjs` passed 409/409 against a temporary `next dev` server on `127.0.0.1:3002`.
- API regression output was saved to `output/sqlite-fallback-qc-api-2026-06-12.json`.

## Production Start Note

`next start` was not used as the formal API-regression evidence because the QC provenance header is intentionally ignored when `NODE_ENV=production`. A production `next start` smoke caused the provenance-specific API checks to fail by design, while the production `build` gate itself passed.

## Boundary

- No Supabase connector calls.
- No live Postgres connection.
- No schema migration apply.
- No RLS/advisor post-apply proof.
- No production cutover.
- No runtime provider pointer change.

The API regression wrote local QC data to SQLite. This is acceptable for this fallback runtime gate, but it must not be treated as live production evidence.
