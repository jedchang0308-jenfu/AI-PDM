# RD Report: Parts Cost Change Request Async Provider Conversion

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CL

## Scope

- Converted `src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts` PATCH from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral cost change decision SQL for approve and reject paths.
- Extended `src/lib/numbering-async.ts` with `decidePartCostChangeRequestAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for cost change decision SQL.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(partNumber)` and `decodeURIComponent(requestId)`.
- Preserved request validation: `decision` must be `approve` or `reject`.
- Preserved response shape: `{ part }`.
- Preserved missing part / missing request / already decided behavior through repository error messages.
- Preserved cost visibility handling by returning `redactPartDetailCosts(part, canViewPartCostAmounts(auth))`.
- Preserved approve behavior:
  - mark request `approved`;
  - mark proposed profile `approved`;
  - for `set_standard`, close active standard cost rows and insert a new `part_standard_costs` row;
  - write `numbering.part_cost_change.approve` audit;
  - read back part detail through the same async client.
- Preserved reject behavior:
  - mark request `rejected`;
  - mark pending proposed profile `rejected`;
  - write `numbering.part_cost_change.reject` audit;
  - read back part detail through the same async client.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts`.
- Direct `@/lib/db` API route count decreased from 21 to 20.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 251/251.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3041` with isolated `PDM_DATA_DIR=tmp-runtime-3cl-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CL`;
  - inserted fixture part `PN-RUNTIME-3CL`;
  - inserted primary manufacturing drawing `DRW-RUNTIME-3CL`;
  - admin demo login returned a valid session cookie;
  - POST `/api/parts/PN-RUNTIME-3CL/cost-profiles` created an approve fixture and pending change request;
  - PATCH `/api/parts/PN-RUNTIME-3CL/cost-change-requests/{requestId}` with `approve` returned `200`;
  - verified approved profile, approved change request, active standard cost, and `basisQty=10`;
  - repeated PATCH on the approved request returned `400` with `PART_COST_CHANGE_REQUEST_ALREADY_DECIDED`;
  - POST created a reject fixture and pending change request;
  - PATCH with `reject` returned `200`;
  - verified rejected profile and rejected change request;
  - PATCH with invalid decision returned `400` with the existing validation message;
  - verified approve and reject audit rows were written;
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

Phase 3CL is complete for parts cost change request async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM batch-control correction, work stops after 3CL and does not automatically continue into Phase 3CM.
