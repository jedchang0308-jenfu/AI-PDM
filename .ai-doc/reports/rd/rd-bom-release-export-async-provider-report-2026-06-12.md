# RD Report: BOM Release Export Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/releases/[releaseId]/export` away from direct synchronous `@/lib/db` reads and onto the provider-neutral async DB path.

## Changes

- Added `AsyncBomWorkbenchRepository.getReleaseSnapshotById(...)`.
- Added `SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL` for release snapshot lookup by id.
- Reused the shared release snapshot parser so latest-snapshot and by-id snapshot reads return the same shape.
- Added `getBomReleaseSnapshotByIdAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/releases/[releaseId]/export` to use `getBomReleaseSnapshotByIdAsync(...)` and `getSubmissionAsync(...)`.
- Extended `qc:access-control-async-repository` with static route wiring checks and an in-memory SQLite semantic gate for release snapshot lookup by id.

## Behavioral Notes

- CSV and XLSX generation logic is unchanged.
- Permission enforcement remains `requireAuthAsync(...)` plus `canReadBomReleasedSnapshot(...)`.
- Snapshot lookup by id preserves parent part metadata, parent drawing metadata, release metadata, approver display name, and parsed line snapshots.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 177/177.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-release-export` passed 21/21 against temporary `next dev` at `127.0.0.1:3006`.
- Temporary 3006 listener was stopped after validation.

## Boundary

This slice only covers the release export read route. It does not migrate BOM review approve/reject, draft create/save/from-assembly/import-xls/submit-review, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
