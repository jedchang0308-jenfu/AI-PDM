# RD Report: Procurement Sync Runs Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts procurement sync-run list/create/decision endpoints from synchronous `@/lib/db` helpers to provider-neutral async database access.

Covered routes:

- `/api/integrations/procurement/sync-runs`
- `/api/integrations/procurement/sync-runs/[runId]`

## Changes

- Extended `AsyncReleaseRepository` with provider-neutral procurement sync-run SQL:
  - list sync runs
  - get sync run by id
  - insert sent sync run
  - acknowledge/fail sync run
- Extended `src/lib/release-records-async.ts` with:
  - `listProcurementSyncRunsAsync(...)`
  - `createProcurementSyncRunAsync(...)`
  - `decideProcurementSyncRunAsync(...)`
- Rewired sync-run routes to use async release helpers and `getSubmissionAsync(...)` instead of direct `@/lib/db` imports.
- Preserved route authorization through `requireRoleAsync(...)` for R&D Manager / Admin.
- Preserved business guards:
  - submission must exist
  - user must be able to read the submission
  - submission must be Released
  - release package must exist before creating a sync run
  - only `sent` sync runs can be acknowledged or failed
- Preserved audit actions:
  - `ProcurementSyncSent`
  - `ProcurementSyncAcknowledged`
  - `ProcurementSyncFailed`

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- Static checks for procurement sync-run async SQL constants.
- Static checks that runtime helpers expose list/create/decision operations without sync DB imports.
- Static checks that procurement sync-run routes use async helpers and avoid direct `@/lib/db` imports.
- SQLite semantic checks proving:
  - create/list/get returns joined submission/item/user metadata
  - target/submission filters work
  - sent audit is written
  - acknowledge decision updates status, response, external reference, actor, and timestamp
  - acknowledge audit is written

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 204/204.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3015` passed:
  - manager login returned 200.
  - `GET /api/integrations/procurement/sync-runs` returned 200 with `runs`.
  - `POST /api/integrations/procurement/sync-runs` returned 201 with `status=sent`.
  - `PATCH /api/integrations/procurement/sync-runs/[runId]` returned 200 with `status=acknowledged`.
  - filtered GET returned the created run.
- Temporary port 3015 listener was stopped after verification.

## Boundary

This phase does not convert supplier/share/sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI/chat routes, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
