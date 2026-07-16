# RD Report: Parts Cost Profiles Async Provider Conversion

Date: 2026-06-15
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CK

## Scope

- Converted `src/app/api/parts/[partNumber]/cost-profiles/route.ts` POST from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral part cost profile, cost tier, cost change request, and audit SQL.
- Extended `src/lib/numbering-async.ts` with `createPartCostProfileAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for part cost profile creation SQL.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(partNumber)`.
- Preserved request validation in the API route for `costType`, `profileName`, and `tiers`.
- Preserved response shape: `{ part }`.
- Preserved missing part behavior: invalid part numbers return `400` with the repository error message.
- Preserved cost visibility handling by returning `redactPartDetailCosts(part, canViewPartCostAmounts(auth))`.
- Preserved audit action `numbering.part_cost_profile.create`.
- Kept insert, pending standard-cost change request creation, audit write, and readback on the same async client inside the Postgres transaction path.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/parts/[partNumber]/cost-profiles/route.ts`.
- Direct `@/lib/db` API route count decreased from 22 to 21.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 250/250.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3040` with isolated `PDM_DATA_DIR=tmp-runtime-3ck-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CK`;
  - inserted fixture part `PN-RUNTIME-3CK`;
  - inserted primary manufacturing drawing `DRW-RUNTIME-3CK`;
  - admin demo login returned a valid session cookie;
  - POST `/api/parts/PN-RUNTIME-3CK/cost-profiles` created profile `Runtime purchase cost`;
  - verified detail response includes part number, primary drawing, pending review cost profile, two tiers, and pending `set_standard` cost change request;
  - POST `/api/parts/PN-RUNTIME-3CK-MISSING/cost-profiles` returned `400` with `PART_NUMBER_NOT_FOUND`;
  - POST `/api/parts/PN-RUNTIME-3CK/cost-profiles` with unsupported `costType` returned `400` with the existing validation message;
  - verified `numbering.part_cost_profile.create` audit row was written with actor `user-admin-demo` and `tierCount: 2`;
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
- Full lint/build was intentionally skipped for this slice per the 2026-06-15 PM batch-control correction; targeted typecheck, exact route scan, QC syntax, targeted QC, and runtime smoke were used instead.

## Result

Phase 3CK is complete for parts cost profile async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM batch-control correction, work stops after 3CK and does not automatically continue into Phase 3CL.
