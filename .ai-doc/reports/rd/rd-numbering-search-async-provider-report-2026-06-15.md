# RD Report: Numbering Search Async Provider Conversion

Date: 2026-06-15
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CF

## Scope

- Converted `src/app/api/numbering/search/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral search SQL for numbering roots, part numbers, and drawing numbers.
- Extended `src/lib/numbering-async.ts` with `searchNumberingRecordsAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for numbering search SQL.

## Implementation Notes

- Preserved query parameters:
  - `query`;
  - `entityType`;
  - `recordStatus`;
  - `developmentPhase`;
  - `limit`.
- Preserved route response shape: `{ results }`.
- Preserved result fields including `primaryDrawingNumber`, `partCount`, `drawingCount`, `linkedPartCount`, and `warningCount`.
- Preserved final sorting by warning count, root code, display code, and final limit slicing.
- SQL uses named parameters, `LIKE ... ESCAPE`, and provider-neutral query execution through `AsyncDatabaseClient`.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/numbering/search/route.ts`.
- `npm.cmd run qc:access-control-async-repository` passed 245/245.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3035` with isolated `PDM_DATA_DIR=tmp-runtime-3cf-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CF`;
  - inserted one part, one primary manufacturing drawing, one drawing-part link, and one unacknowledged part warning;
  - admin login through `POST /api/auth/login` returned user `user-admin-demo`;
  - GET `/api/numbering/search?query=RUNTIME-3CF&entityType=all&recordStatus=Active&developmentPhase=DVT&limit=10` returned `200 OK`;
  - verified three results: `part_number`, `drawing_number`, and `part_root`;
  - verified root `primaryDrawingNumber: "DRW-RUNTIME-3CF"`;
  - verified part `warningCount: 1`;
  - verified drawing `linkedPartCount: 1`;
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

Phase 3CF is complete for numbering search async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
