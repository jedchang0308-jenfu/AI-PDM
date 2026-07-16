# RD Report: Numbering Drafts Overdue Async Provider Conversion

Date: 2026-06-12
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CD

## Scope

- Converted `src/app/api/numbering/drafts/overdue/route.ts` POST from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral overdue draft root selection, root/part/drawing status updates, task insert, notification insert, and audit write SQL.
- Extended `src/lib/numbering-async.ts` with `markOverdueDraftNumberingRecordsAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for overdue draft selection, PendingAdminConfirm updates, task creation, notification creation, and audit SQL.

## Implementation Notes

- Preserved `olderThanDays` clamping to a minimum of 1.
- Preserved `INVALID_NOW` validation.
- Preserved returned shape: `cutoffAt`, `updatedRootCodes`, and `updatedCount`.
- Preserved task and notification semantics:
  - `taskType` / `notificationType`: `draft_admin_confirm`;
  - `assignedRole` / `recipientRole`: `pdm_admin`;
  - notification is non-dismissible;
  - action URL points to `/numbering/search?root=...`.
- SQL uses named parameters and avoids SQLite-only `datetime(...)` or `rowid` behavior.
- SQLite runs sequential async provider operations; Postgres keeps transaction-backed behavior through the async provider.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/numbering/drafts/overdue/route.ts`.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 243/243.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3033` passed with isolated `PDM_DATA_DIR=tmp-runtime-3cd-data`:
  - initialized a temporary SQLite database;
  - admin demo login returned `303 See Other` with a session cookie;
  - inserted overdue root fixture `ROOT-RUNTIME-3CD`;
  - POST `/api/numbering/drafts/overdue` returned `200 OK` with `updatedCount: 1`;
  - verified root, part, and drawing statuses became `PendingAdminConfirm`;
  - verified generated task `5f34df92-2949-4dbe-a01f-68ced670dffe`;
  - verified generated notification `da806336-8edd-4744-b6e4-2f11f0b29173`;
  - verified generated audit row `89724eb7-dbd1-4c06-8dfd-b37ad2765d3f`;
  - temporary server, logs, pid file, and temporary data directory were cleaned up.

## Boundary

- Runtime smoke used an isolated temporary SQLite database and did not mutate local `data/ai-pdm.sqlite`.
- No local persistent audit rows were created by this slice.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CD is complete for numbering overdue draft admin-confirm async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
