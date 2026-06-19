# RD Report: Parts Detail Async Provider Conversion

Date: 2026-06-15
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CI

## Scope

- Converted `src/app/api/parts/[partNumber]/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral part detail loading.
- Extended `src/lib/numbering-async.ts` with `getPartModuleDetailAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for part detail SQL.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(partNumber)`.
- Preserved route response shape: `{ part }`.
- Preserved not-found behavior: missing part numbers return `404` with `{ error: "Part number not found" }`.
- Preserved detail fields including linked drawings, same-drawing variants, cost profiles, cost tiers, cost change requests, primary drawing, active standard cost, and part variant attributes.
- Preserved part cost redaction through `redactPartDetailCosts(...)`; authorized Admin smoke verified cost profiles and standard cost amount remain visible.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/parts/[partNumber]/route.ts`.
- Direct `@/lib/db` API route count decreased from 24 to 23.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 248/248.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3038` with isolated `PDM_DATA_DIR=tmp-runtime-3ci-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CI`;
  - inserted fixture part `PN-RUNTIME-3CI`;
  - inserted primary manufacturing drawing `DRW-RUNTIME-3CI`;
  - inserted linked drawing `primary_manufacturing`;
  - inserted same-drawing variant `material: SUS316`;
  - inserted approved in-house cost profile `Runtime standard cost`;
  - inserted cost tier with unit cost `88.75`;
  - inserted active standard cost with unit cost `88.75`;
  - inserted pending cost change request `set_standard`;
  - admin demo login returned a valid session cookie;
  - GET `/api/parts/PN-RUNTIME-3CI` returned `200 OK`;
  - verified part number, primary drawing, linked drawing, same-drawing variant, cost profile tier, standard cost, and cost change request;
  - GET `/api/parts/PN-RUNTIME-3CI-MISSING` returned `404`;
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

Phase 3CI is complete for parts detail async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM batch-control correction, work stops after 3CI and does not automatically continue into Phase 3CJ.
