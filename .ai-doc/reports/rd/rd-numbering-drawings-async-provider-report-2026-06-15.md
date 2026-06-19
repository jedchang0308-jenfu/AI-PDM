# RD Report: Numbering Drawings Async Provider Conversion

Date: 2026-06-15
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CG

## Scope

- Converted `src/app/api/numbering/drawings/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral drawing module SQL for drawing list rows, linked part numbers, and same-root linked part summaries.
- Extended `src/lib/numbering-async.ts` with `listDrawingModuleRecordsAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for drawing module SQL.

## Implementation Notes

- Preserved query parameters:
  - `query`;
  - `recordStatus`;
  - `developmentPhase`;
  - `purposeCode`;
  - `limit`.
- Preserved route response shape: `{ drawings }`.
- Replaced SQLite-specific linked part aggregation with provider-neutral row loading and TypeScript grouping.
- Preserved drawing fields including linked part count, linked part numbers, same-root parts, title-block variant warning, warning count, and updated timestamp.
- Preserved same-root part metadata including variant attributes and active standard cost status.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/numbering/drawings/route.ts`.
- `npm.cmd run qc:access-control-async-repository` passed 246/246.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3036` with isolated `PDM_DATA_DIR=tmp-runtime-3cg-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture drawing `DRW-RUNTIME-3CG`;
  - inserted two same-root parts and linked both to the drawing;
  - inserted variant attributes and active standard cost for part `PN-RUNTIME-3CG-A`;
  - inserted one unacknowledged drawing warning;
  - admin login through `POST /api/auth/login` returned user `user-admin-demo`;
  - GET `/api/numbering/drawings?query=PN-RUNTIME-3CG-A&recordStatus=Active&developmentPhase=DVT&purposeCode=MA&limit=10` returned `200 OK`;
  - verified `linkedPartCount: 2`;
  - verified linked part numbers `PN-RUNTIME-3CG-A` and `PN-RUNTIME-3CG-B`;
  - verified `sameRootParts: 2`;
  - verified `warningCount: 1`;
  - verified `titleBlockVariantWarning: true`;
  - verified active standard cost status for part `PN-RUNTIME-3CG-A`;
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

Phase 3CG is complete for numbering drawings list async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
