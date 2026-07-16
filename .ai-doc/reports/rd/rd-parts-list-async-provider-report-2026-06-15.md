# RD Report: Parts List Async Provider Conversion

Date: 2026-06-15
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CH

## Scope

- Converted `src/app/api/parts/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral parts list SQL and mapping.
- Extended `src/lib/numbering-async.ts` with `listPartModuleRecordsAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for parts list SQL.

## Implementation Notes

- Preserved query parameters:
  - `query`;
  - `recordStatus`;
  - `developmentPhase`;
  - `limit`.
- Preserved route response shape: `{ parts }`.
- Preserved part list fields including root code, core name, primary drawing number, drawing count, variant attributes, active standard cost, and pending cost request count.
- Preserved part cost redaction through `redactPartListCosts(...)`; authorized Admin smoke verified standard cost amount remains visible.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/parts/route.ts`.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 247/247.
- `npm.cmd run qc:doc-paths` passed 23/23.
- `npm.cmd run lint -- --quiet` passed in the pre-smoke code verification for this slice.
- `npm.cmd run build` passed in the pre-smoke code verification for this slice with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3037` with isolated `PDM_DATA_DIR=tmp-runtime-3ch-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CH`;
  - inserted fixture part `PN-RUNTIME-3CH`;
  - inserted primary manufacturing drawing `DRW-RUNTIME-3CH`;
  - inserted part variant attributes with material code `SUS304`;
  - inserted approved in-house cost profile `Runtime Part List Cost`;
  - inserted active standard cost with unit cost `88.75`;
  - inserted one pending cost change request;
  - admin login through `POST /api/auth/login` returned `200 OK`;
  - GET `/api/parts?query=PN-RUNTIME-3CH&recordStatus=Active&developmentPhase=DVT&limit=10` returned `200 OK`;
  - verified response part id `part-runtime-part-list-async`;
  - verified `primaryDrawingNumber: DRW-RUNTIME-3CH`;
  - verified `drawingCount: 1`;
  - verified `pendingCostRequestCount: 1`;
  - verified `variant.materialCode: SUS304`;
  - verified `standardCost.profileName: Runtime Part List Cost`;
  - verified `standardCost.unitCost: 88.75`;
  - temporary server, logs, pid file, and temporary data directory were cleaned up.

## Boundary

- Runtime smoke used an isolated temporary SQLite database and did not mutate local `data/ai-pdm.sqlite`.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CH is complete for parts list async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM batch-control correction, work stops after 3CH and does not automatically continue into Phase 3CI.
